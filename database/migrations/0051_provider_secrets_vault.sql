CREATE TABLE IF NOT EXISTS provider_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES api_providers(id) ON DELETE CASCADE,
    secret_name VARCHAR(80) NOT NULL,
    encrypted_value TEXT NOT NULL,
    encryption_version SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID NULL,
    CONSTRAINT uq_provider_secrets_provider_name
        UNIQUE (provider_id, secret_name),
    CONSTRAINT chk_provider_secrets_name
        CHECK (secret_name ~ '^[a-z][a-z0-9_]{1,79}$'),
    CONSTRAINT chk_provider_secrets_ciphertext
        CHECK (length(encrypted_value) > 0)
);

CREATE INDEX IF NOT EXISTS idx_provider_secrets_provider
    ON provider_secrets(provider_id);
