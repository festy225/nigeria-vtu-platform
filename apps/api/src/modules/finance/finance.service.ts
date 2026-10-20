import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class FinanceService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}


  async listAccounts() {
    const result = await this.database.query(
      `SELECT id, code, name, account_type, currency, enabled,
              is_system, created_at
       FROM finance_accounts
       ORDER BY currency, code`,
    );
    return result.rows;
  }

  async createAccount(
    input: {
      code: string;
      name: string;
      accountType: string;
      currency: string;
    },
    actorId: string,
  ) {
    const code = input.code?.trim().toUpperCase();
    const name = input.name?.trim();
    const accountType = input.accountType?.trim().toUpperCase();
    const currency = input.currency?.trim().toUpperCase();
    const validTypes = ["ASSET","LIABILITY","EQUITY","REVENUE","EXPENSE"];

    if (
      !code || !/^[A-Z0-9][A-Z0-9._-]{0,79}$/.test(code) ||
      !name || name.length > 180 ||
      !validTypes.includes(accountType ?? '') ||
      !/^[A-Z]{3}$/.test(currency ?? '')
    ) {
      throw new BadRequestException(
        'Provide a valid account code, name, account type and currency.',
      );
    }

    try {
      return await this.database.withTransaction(async (client: PoolClient) => {
        const currencyResult = await client.query(
          `SELECT code FROM finance_currencies
           WHERE code = $1 AND enabled = TRUE`,
          [currency],
        );
        if (!currencyResult.rows.length) {
          throw new BadRequestException('The selected currency is not enabled.');
        }

        const inserted = await client.query(
          `INSERT INTO finance_accounts
             (code, name, account_type, currency, created_by)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, code, name, account_type, currency, enabled,
                     is_system, created_at`,
          [code, name, accountType, currency, actorId],
        );
        const account = inserted.rows[0];

        await this.audit.record({
          actorId,
          action: 'FINANCE_ACCOUNT_CREATED',
          resourceType: 'finance_account',
          resourceId: account.id,
        }, client);
        return account;
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        throw new ConflictException(
          'An account with that code already exists for this currency.',
        );
      }
      throw error;
    }
  }

  async setAccountEnabled(accountId: string, enabled: boolean, actorId: string) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountId) ||
      typeof enabled !== 'boolean'
    ) {
      throw new BadRequestException(
        'A valid account ID and enabled status are required.',
      );
    }

    return this.database.withTransaction(async (client: PoolClient) => {
      const current = await client.query(
        `SELECT id, enabled, is_system FROM finance_accounts
         WHERE id = $1 FOR UPDATE`,
        [accountId],
      );
      if (!current.rows.length) {
        throw new BadRequestException('Finance account was not found.');
      }
      if (current.rows[0].is_system && !enabled) {
        throw new ConflictException('System accounts cannot be disabled.');
      }

      const updated = await client.query(
        `UPDATE finance_accounts SET enabled = $2
         WHERE id = $1
         RETURNING id, code, name, account_type, currency, enabled,
                   is_system, created_at`,
        [accountId, enabled],
      );
      const account = updated.rows[0];

      await this.audit.record({
        actorId,
        action: enabled ? 'FINANCE_ACCOUNT_ENABLED' : 'FINANCE_ACCOUNT_DISABLED',
        resourceType: 'finance_account',
        resourceId: accountId,
      }, client);
      return account;
    });
  }

  async overview() {
    const [payments, airtime] = await Promise.all([
      this.database.query(
        `SELECT currency::text AS currency,
                state::text AS status,
                COUNT(*)::text AS count,
                COALESCE(SUM(amount_minor), 0)::text AS amount_minor
         FROM payments
         GROUP BY currency, state
         ORDER BY currency, state`,
      ),
      this.database.query(
        `SELECT currency::text AS currency,
                state::text AS status,
                COUNT(*)::text AS count,
                COALESCE(SUM(amount_minor), 0)::text AS amount_minor,
                COALESCE(SUM(fee_minor), 0)::text AS fee_minor,
                COALESCE(SUM(commission_minor), 0)::text AS commission_minor
         FROM transactions
         GROUP BY currency, state
         ORDER BY currency, state`,
      ),
    ]);

    const currencies = await this.database.query(
      `SELECT code, name, minor_unit, enabled, is_reporting_currency
       FROM finance_currencies
       ORDER BY code`,
    );

    return {
      currencies: currencies.rows,
      accountingStatus: 'INCOMPLETE',
      revenue: null,
      profit: null,
      note: 'Payment totals, airtime transaction totals, fees and recorded commission fields are operational metrics, not verified company revenue or profit.',
      paymentsByCurrencyAndStatus: payments.rows,
      airtimeByCurrencyAndStatus: airtime.rows,
    };
  }

  async listExchangeRates() {
    const result = await this.database.query(
      `SELECT r.id, r.base_currency, r.quote_currency, r.rate::text AS rate,
              r.source, r.effective_at, r.recorded_at, r.recorded_by, r.reason
       FROM finance_exchange_rates r
       ORDER BY r.effective_at DESC, r.recorded_at DESC`,
    );
    return result.rows;
  }

  async recordExchangeRate(
    input: {
      baseCurrency: string;
      quoteCurrency: string;
      rate: number;
      source: string;
      effectiveAt: string;
      reason?: string;
    },
    actorId: string,
  ) {
    const base = input.baseCurrency?.trim().toUpperCase();
    const quote = input.quoteCurrency?.trim().toUpperCase();
    const source = input.source?.trim();
    const rate = input.rate;
    const effectiveAt = new Date(input.effectiveAt);

    if (
      !/^[A-Z]{3}$/.test(base ?? '') ||
      !/^[A-Z]{3}$/.test(quote ?? '') ||
      base === quote ||
      !Number.isFinite(rate) ||
      rate <= 0 ||
      !source ||
      source.length > 120 ||
      !input.effectiveAt ||
      Number.isNaN(effectiveAt.getTime())
    ) {
      throw new BadRequestException('Valid distinct currencies, positive rate, source and effective date are required');
    }

    return this.database.withTransaction(async (client: PoolClient) => {
      const currencyResult = await client.query(
        `SELECT code
         FROM finance_currencies
         WHERE code = ANY($1::varchar[])
           AND enabled = TRUE
         ORDER BY code`,
        [[base, quote]],
      );

      if (currencyResult.rows.length !== 2) {
        throw new BadRequestException('Both currencies must exist and be enabled');
      }

      const inserted = await client.query(
        `INSERT INTO finance_exchange_rates
           (base_currency, quote_currency, rate, source, effective_at, recorded_by, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, base_currency, quote_currency, rate::text AS rate,
                   source, effective_at, recorded_at, recorded_by, reason`,
        [base, quote, rate, source, effectiveAt.toISOString(), actorId, input.reason?.trim() || null],
      );

      const row = inserted.rows[0];
      await this.audit.record({
        actorId,
        action: 'FINANCE_EXCHANGE_RATE_RECORDED',
        resourceType: 'finance_exchange_rate',
        resourceId: row.id,
        afterData: row,
        reason: input.reason?.trim() || 'Exchange rate recorded',
      }, client);

      return row;
    });
  }
  async listJournals(limit = 100) {
    const safeLimit = Number.isInteger(limit)
      ? Math.min(Math.max(limit, 1), 200)
      : 100;

    const result = await this.database.query(
      `SELECT
         j.id, j.reference, j.source_type, j.source_id,
         j.currency, j.status, j.description, j.created_by,
         j.created_at, j.posted_at, j.reversal_of,
         COALESCE(
           json_agg(
             json_build_object(
               'id', p.id,
               'debitAccountId', p.debit_account_id,
               'debitAccountCode', da.code,
               'debitAccountName', da.name,
               'creditAccountId', p.credit_account_id,
               'creditAccountCode', ca.code,
               'creditAccountName', ca.name,
               'amountMinor', p.amount_minor::text,
               'description', p.description,
               'createdAt', p.created_at
             ) ORDER BY p.created_at, p.id
           ) FILTER (WHERE p.id IS NOT NULL),
           '[]'::json
         ) AS postings
       FROM finance_journals j
       LEFT JOIN finance_journal_postings p ON p.journal_id = j.id
       LEFT JOIN finance_accounts da ON da.id = p.debit_account_id
       LEFT JOIN finance_accounts ca ON ca.id = p.credit_account_id
       GROUP BY j.id
       ORDER BY j.created_at DESC, j.id DESC
       LIMIT $1`,
      [safeLimit],
    );

    return result.rows;
  }
  async postJournal(
    input: {
      reference: string;
      sourceType: string;
      sourceId: string;
      currency: string;
      description: string;
      postings: Array<{
        debitAccountId: string;
        creditAccountId: string;
        amountMinor: number;
        description?: string;
      }>;
    },
    actorId: string,
  ) {
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    const reference = input?.reference?.trim();
    const sourceType = input?.sourceType?.trim().toUpperCase();
    const sourceId = input?.sourceId?.trim();
    const currency = input?.currency?.trim().toUpperCase();
    const description = input?.description?.trim();
    const postings = input?.postings;

    if (
      !reference || reference.length > 100 ||
      !sourceType || sourceType.length > 80 ||
      !uuidPattern.test(sourceId ?? '') ||
      !/^[A-Z]{3}$/.test(currency ?? '') ||
      !description || description.length > 1000 ||
      !Array.isArray(postings) ||
      postings.length < 2 || postings.length > 100
    ) {
      throw new BadRequestException('Invalid journal details or postings');
    }

    let debitTotal = 0n;
    let creditTotal = 0n;

    for (const posting of postings) {
      if (
        !uuidPattern.test(posting?.debitAccountId ?? '') ||
        !uuidPattern.test(posting?.creditAccountId ?? '') ||
        posting.debitAccountId === posting.creditAccountId ||
        !Number.isSafeInteger(posting.amountMinor) ||
        posting.amountMinor <= 0 ||
        (posting.description != null &&
          (typeof posting.description !== 'string' ||
           posting.description.length > 1000))
      ) {
        throw new BadRequestException(
          'Each posting requires distinct account UUIDs and a positive safe-integer amount in minor units',
        );
      }

      debitTotal += BigInt(posting.amountMinor);
      creditTotal += BigInt(posting.amountMinor);
    }

    // Each posting represents one debit and one credit of the same amount.
    // Therefore the journal balances by construction, including multi-line journals.
    if (debitTotal !== creditTotal) {
      throw new BadRequestException('Journal debits and credits must balance');
    }

    const accountIds = [...new Set(
      postings.flatMap((posting) => [
        posting.debitAccountId,
        posting.creditAccountId,
      ]),
    )];

    try {
      return await this.database.withTransaction(async (client: PoolClient) => {
        const currencyResult = await client.query(
          `SELECT code
           FROM finance_currencies
           WHERE code = $1 AND enabled = TRUE`,
          [currency],
        );

        if (currencyResult.rows.length !== 1) {
          throw new BadRequestException(
            'The journal currency must exist and be enabled',
          );
        }

        const accountsResult = await client.query(
          `SELECT id
           FROM finance_accounts
           WHERE id = ANY($1::uuid[])
             AND currency = $2
             AND enabled = TRUE
           FOR SHARE`,
          [accountIds, currency],
        );

        if (accountsResult.rows.length !== accountIds.length) {
          throw new BadRequestException(
            'Every account must exist, be enabled, and use the journal currency',
          );
        }

        const inserted = await client.query(
          `INSERT INTO finance_journals
             (reference, source_type, source_id, currency, status,
              description, created_by)
           VALUES ($1, $2, $3, $4, 'DRAFT', $5, $6)
           RETURNING *`,
          [reference, sourceType, sourceId, currency, description, actorId],
        );

        const journal = inserted.rows[0];
        const insertedPostings = [];

        for (const posting of postings) {
          const result = await client.query(
            `INSERT INTO finance_journal_postings
               (journal_id, currency, debit_account_id, credit_account_id,
                amount_minor, description)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
              journal.id,
              currency,
              posting.debitAccountId,
              posting.creditAccountId,
              String(posting.amountMinor),
              posting.description?.trim() || null,
            ],
          );
          insertedPostings.push(result.rows[0]);
        }

        const posted = await client.query(
          `UPDATE finance_journals
           SET status = 'POSTED', posted_at = now()
           WHERE id = $1 AND status = 'DRAFT'
           RETURNING *`,
          [journal.id],
        );

        if (posted.rows.length !== 1) {
          throw new ConflictException('Journal could not be posted');
        }

        await this.audit.record({
          actorId,
          action: 'FINANCE_JOURNAL_POSTED',
          resourceType: 'finance_journal',
          resourceId: journal.id,
          afterData: {
            journal: posted.rows[0],
            postings: insertedPostings,
          },
          reason: description,
        }, client);

        return {
          journal: posted.rows[0],
          postings: insertedPostings,
        };
      });
    } catch (error) {
      if ((error as { code?: string })?.code === '23505') {
        throw new ConflictException(
          'A journal with this reference or source event already exists',
        );
      }
      throw error;
    }
  }

  async reverseJournal(
    journalId: string,
    input: { reference: string; reason: string },
    actorId: string,
  ) {
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const reference = input?.reference?.trim();
    const reason = input?.reason?.trim();

    if (
      !uuidPattern.test(journalId ?? '') ||
      !reference || reference.length > 100 ||
      !reason || reason.length > 1000
    ) {
      throw new BadRequestException(
        'A valid journal UUID, reversal reference, and reason are required',
      );
    }

    try {
      return await this.database.withTransaction(async (client: PoolClient) => {
        const originalResult = await client.query(
          `SELECT *
           FROM finance_journals
           WHERE id = $1
           FOR UPDATE`,
          [journalId],
        );

        const original = originalResult.rows[0];

        if (!original || original.status !== 'POSTED') {
          throw new BadRequestException(
            'Only an existing POSTED journal can be reversed',
          );
        }

        const originalPostings = await client.query(
          `SELECT debit_account_id, credit_account_id, amount_minor, description
           FROM finance_journal_postings
           WHERE journal_id = $1
           ORDER BY created_at, id`,
          [journalId],
        );

        if (originalPostings.rows.length === 0) {
          throw new BadRequestException(
            'The original journal has no postings to reverse',
          );
        }

        const insertedReversal = await client.query(
          `INSERT INTO finance_journals
             (reference, source_type, source_id, currency, status,
              description, created_by, reversal_of)
           VALUES ($1, 'REVERSAL', $2, $3, 'DRAFT', $4, $5, $6)
           RETURNING *`,
          [
            reference,
            original.id,
            original.currency,
            'Reversal of ' + original.reference + ': ' + reason,
            actorId,
            original.id,
          ],
        );

        const reversal = insertedReversal.rows[0];
        const reversalPostings = [];

        for (const posting of originalPostings.rows) {
          const result = await client.query(
            `INSERT INTO finance_journal_postings
               (journal_id, currency, debit_account_id, credit_account_id,
                amount_minor, description)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
              reversal.id,
              original.currency,
              posting.credit_account_id,
              posting.debit_account_id,
              String(posting.amount_minor),
              'Reversal: ' + (posting.description ?? reason),
            ],
          );
          reversalPostings.push(result.rows[0]);
        }

        const postedReversal = await client.query(
          `UPDATE finance_journals
           SET status = 'POSTED', posted_at = now()
           WHERE id = $1 AND status = 'DRAFT'
           RETURNING *`,
          [reversal.id],
        );

        if (postedReversal.rows.length !== 1) {
          throw new ConflictException('Reversal journal could not be posted');
        }

        const reversedOriginal = await client.query(
          `UPDATE finance_journals
           SET status = 'REVERSED'
           WHERE id = $1 AND status = 'POSTED'
           RETURNING *`,
          [original.id],
        );

        if (reversedOriginal.rows.length !== 1) {
          throw new ConflictException(
            'Original journal could not be marked reversed',
          );
        }

        await this.audit.record({
          actorId,
          action: 'FINANCE_JOURNAL_REVERSED',
          resourceType: 'finance_journal',
          resourceId: original.id,
          beforeData: original,
          afterData: {
            original: reversedOriginal.rows[0],
            reversal: postedReversal.rows[0],
            postings: reversalPostings,
          },
          reason,
        }, client);

        return {
          journal: reversedOriginal.rows[0],
          reversal: postedReversal.rows[0],
          postings: reversalPostings,
        };
      });
    } catch (error) {
      if ((error as { code?: string })?.code === '23505') {
        throw new ConflictException(
          'A reversal already exists or the reversal reference is already in use',
        );
      }
      throw error;
    }
  }
}
