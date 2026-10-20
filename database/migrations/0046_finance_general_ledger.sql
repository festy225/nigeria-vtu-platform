CREATE TABLE finance_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(80) NOT NULL,
  name VARCHAR(180) NOT NULL,
  account_type VARCHAR(16) NOT NULL
    CHECK (account_type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
  currency VARCHAR(3) NOT NULL REFERENCES finance_currencies(code),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (currency, code),
  UNIQUE (id, currency)
);

CREATE TABLE finance_journals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference VARCHAR(100) NOT NULL UNIQUE,
  source_type VARCHAR(80) NOT NULL,
  source_id UUID,
  currency VARCHAR(3) NOT NULL REFERENCES finance_currencies(code),
  status VARCHAR(12) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','POSTED','REVERSED')),
  description TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_at TIMESTAMPTZ,
  UNIQUE (source_type, source_id),
  UNIQUE (id, currency),
  CHECK ((status = 'POSTED' AND posted_at IS NOT NULL)
      OR status <> 'POSTED')
);

CREATE TABLE finance_journal_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id UUID NOT NULL,
  currency VARCHAR(3) NOT NULL,
  debit_account_id UUID NOT NULL,
  credit_account_id UUID NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (journal_id, currency)
    REFERENCES finance_journals(id, currency),
  FOREIGN KEY (debit_account_id, currency)
    REFERENCES finance_accounts(id, currency),
  FOREIGN KEY (credit_account_id, currency)
    REFERENCES finance_accounts(id, currency),
  CHECK (debit_account_id <> credit_account_id)
);

CREATE INDEX finance_journals_source_idx
  ON finance_journals(source_type, source_id);

CREATE INDEX finance_journals_status_idx
  ON finance_journals(status, created_at DESC);

CREATE INDEX finance_journal_postings_account_idx
  ON finance_journal_postings(currency, debit_account_id, created_at DESC);

CREATE INDEX finance_journal_postings_credit_idx
  ON finance_journal_postings(currency, credit_account_id, created_at DESC);
ALTER TABLE finance_journals
  ADD COLUMN reversal_of UUID REFERENCES finance_journals(id),
  ADD CONSTRAINT finance_journals_no_self_reversal
    CHECK (reversal_of IS NULL OR reversal_of <> id);

CREATE UNIQUE INDEX finance_journals_reversal_unique_idx
  ON finance_journals(reversal_of)
  WHERE reversal_of IS NOT NULL;

CREATE OR REPLACE FUNCTION finance_guard_journal_postings()
RETURNS trigger
LANGUAGE plpgsql
AS $finance_guard_postings$
DECLARE
  old_status VARCHAR(12);
  new_status VARCHAR(12);
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT status INTO old_status
      FROM finance_journals WHERE id = OLD.journal_id FOR UPDATE;

    IF old_status IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'Postings can only be changed while their journal is DRAFT';
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    SELECT status INTO new_status
      FROM finance_journals WHERE id = NEW.journal_id FOR UPDATE;

    IF new_status IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'Postings can only be changed while their journal is DRAFT';
    END IF;

    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$finance_guard_postings$;

CREATE TRIGGER finance_journal_postings_guard
  BEFORE INSERT OR UPDATE OR DELETE ON finance_journal_postings
  FOR EACH ROW EXECUTE FUNCTION finance_guard_journal_postings();

CREATE OR REPLACE FUNCTION finance_guard_journal_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $finance_guard_lifecycle$
DECLARE
  original_status VARCHAR(12);
  original_currency VARCHAR(3);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'Journals must be created as DRAFT';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'Only DRAFT journals may be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'REVERSED' THEN
    RAISE EXCEPTION 'Reversed journals are immutable';
  END IF;

  IF OLD.status = 'POSTED' THEN
    IF NEW.status <> 'REVERSED'
       OR (to_jsonb(NEW) - 'status') IS DISTINCT FROM
          (to_jsonb(OLD) - 'status') THEN
      RAISE EXCEPTION 'Posted journals are immutable; use a reversal';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM finance_journals r
      WHERE r.reversal_of = OLD.id
        AND r.status = 'POSTED'
        AND r.currency = OLD.currency
    ) THEN
      RAISE EXCEPTION 'A matching posted reversal is required';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.status = 'REVERSED' THEN
    RAISE EXCEPTION 'A DRAFT journal cannot be reversed';
  END IF;

  IF NEW.status = 'POSTED' THEN
    IF NEW.posted_at IS NULL OR NOT EXISTS (
      SELECT 1 FROM finance_journal_postings p
      WHERE p.journal_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'A journal requires postings and posted_at before posting';
    END IF;

    IF NEW.reversal_of IS NOT NULL THEN
      SELECT status, currency
        INTO original_status, original_currency
        FROM finance_journals
        WHERE id = NEW.reversal_of
        FOR UPDATE;

      IF original_status IS DISTINCT FROM 'POSTED'
         OR original_currency IS DISTINCT FROM NEW.currency THEN
        RAISE EXCEPTION 'A reversal must reference a POSTED journal in the same currency';
      END IF;

      IF EXISTS (
        WITH expected AS (
          SELECT credit_account_id AS debit_account_id,
                 debit_account_id AS credit_account_id,
                 amount_minor,
                 COUNT(*) AS line_count
          FROM finance_journal_postings
          WHERE journal_id = NEW.reversal_of
          GROUP BY credit_account_id, debit_account_id, amount_minor
        ),
        actual AS (
          SELECT debit_account_id, credit_account_id, amount_minor,
                 COUNT(*) AS line_count
          FROM finance_journal_postings
          WHERE journal_id = NEW.id
          GROUP BY debit_account_id, credit_account_id, amount_minor
        )
        SELECT 1
        FROM expected e
        FULL JOIN actual a
          USING (debit_account_id, credit_account_id, amount_minor)
        WHERE e.line_count IS DISTINCT FROM a.line_count
      ) THEN
        RAISE EXCEPTION 'Reversal postings must exactly mirror the original journal';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$finance_guard_lifecycle$;

CREATE TRIGGER finance_journals_lifecycle_guard
  BEFORE INSERT OR UPDATE OR DELETE ON finance_journals
  FOR EACH ROW EXECUTE FUNCTION finance_guard_journal_lifecycle();