-- Initial PostgreSQL schema for the Nigerian VTU platform.
-- Apply with: psql "$DATABASE_URL" -f database/migrations/0001_initial_schema.sql
-- Monetary values are integer minor units (kobo/cents), never floating point.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE user_status AS ENUM ('PENDING','ACTIVE','SUSPENDED','DEACTIVATED');
CREATE TYPE role_code AS ENUM ('CUSTOMER','AGENT','VENDOR','ADMIN','SUPER_ADMIN','FINANCE_ADMIN','OPERATIONS_ADMIN','SUPPORT_ADMIN','AUDITOR');
CREATE TYPE currency_code AS ENUM ('NGN','USD');
CREATE TYPE upgrade_type AS ENUM ('AGENT','VENDOR');
CREATE TYPE review_status AS ENUM ('PENDING','APPROVED','REJECTED','CANCELLED');
CREATE TYPE wallet_status AS ENUM ('ACTIVE','FROZEN','CLOSED');
CREATE TYPE ledger_entry_type AS ENUM ('DEBIT','CREDIT');
CREATE TYPE wallet_operation AS ENUM ('DEPOSIT','WITHDRAWAL','TRANSFER','SERVICE_PURCHASE','REFUND','COMMISSION','ADJUSTMENT','HOLD','RELEASE');
CREATE TYPE transaction_state AS ENUM ('CREATED','VALIDATING','FUNDS_HELD','SUBMITTED','PROCESSING','SUCCESSFUL','FAILED','UNKNOWN','REQUIRES_VERIFICATION','REFUND_PENDING','REFUNDED','CANCELLED');
CREATE TYPE service_code AS ENUM ('AIRTIME','DATA','ELECTRICITY','TV_SUBSCRIPTION','BETTING','AIRTIME_TO_MONEY','VOUCHER','DATA_PRINTING','ECOMMERCE');
CREATE TYPE provider_status AS ENUM ('ACTIVE','DEGRADED','MAINTENANCE','DISABLED','UNHEALTHY');
CREATE TYPE provider_attempt_state AS ENUM ('NOT_SENT','SENT','PROCESSING','SUCCESS','FAILED','UNKNOWN');
CREATE TYPE payment_state AS ENUM ('PENDING','AUTHORIZED','SUCCESSFUL','FAILED','REFUNDED','CANCELLED','UNKNOWN');
CREATE TYPE order_state AS ENUM ('DRAFT','PENDING_PAYMENT','PAID','PROCESSING','FULFILLED','CANCELLED','REFUNDED');
CREATE TYPE notification_channel AS ENUM ('IN_APP','EMAIL','SMS','PUSH');
CREATE TYPE notification_state AS ENUM ('PENDING','SENT','DELIVERED','FAILED','READ');
CREATE TYPE reconciliation_state AS ENUM ('OPEN','IN_REVIEW','RESOLVED','IGNORED');
CREATE TYPE batch_state AS ENUM ('CREATED','PROCESSING','COMPLETED','PARTIAL','FAILED','CANCELLED');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email citext UNIQUE, phone varchar(32) UNIQUE,
  password_hash text, status user_status NOT NULL DEFAULT 'PENDING', email_verified_at timestamptz,
  phone_verified_at timestamptz, last_login_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE TABLE roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code role_code UNIQUE NOT NULL, name varchar(100) NOT NULL, description text);
CREATE TABLE permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code varchar(150) UNIQUE NOT NULL, description text);
CREATE TABLE user_roles (user_id uuid REFERENCES users(id) ON DELETE CASCADE, role_id uuid REFERENCES roles(id) ON DELETE CASCADE, granted_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id, role_id));
CREATE TABLE role_permissions (role_id uuid REFERENCES roles(id) ON DELETE CASCADE, permission_id uuid REFERENCES permissions(id) ON DELETE CASCADE, PRIMARY KEY(role_id, permission_id));
CREATE TABLE customer_profiles (user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, display_name varchar(160), date_of_birth date, address text, kyc_level smallint NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE agent_profiles (user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, business_name varchar(200), pricing_enabled boolean NOT NULL DEFAULT false, api_enabled boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE vendor_profiles (user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, business_name varchar(200), pricing_enabled boolean NOT NULL DEFAULT false, api_enabled boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE admin_profiles (user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, department varchar(120), mfa_required boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE upgrade_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), requested_type upgrade_type NOT NULL, status review_status NOT NULL DEFAULT 'PENDING', reviewed_by uuid REFERENCES users(id), reason text, submitted_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz);
CREATE INDEX upgrade_requests_status_idx ON upgrade_requests(status, submitted_at);

CREATE TABLE wallets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), currency currency_code NOT NULL, status wallet_status NOT NULL DEFAULT 'ACTIVE', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,currency));
CREATE TABLE wallet_balances (wallet_id uuid PRIMARY KEY REFERENCES wallets(id) ON DELETE CASCADE, available_minor bigint NOT NULL DEFAULT 0 CHECK (available_minor >= 0), held_minor bigint NOT NULL DEFAULT 0 CHECK (held_minor >= 0), version bigint NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE ledger_transactions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference varchar(80) UNIQUE NOT NULL, operation wallet_operation NOT NULL, currency currency_code NOT NULL, source_type varchar(80), source_id uuid, description text, created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE ledger_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ledger_transaction_id uuid NOT NULL REFERENCES ledger_transactions(id), wallet_id uuid NOT NULL REFERENCES wallets(id), entry_type ledger_entry_type NOT NULL, amount_minor bigint NOT NULL CHECK (amount_minor > 0), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(ledger_transaction_id,wallet_id,entry_type));
CREATE INDEX ledger_entries_wallet_idx ON ledger_entries(wallet_id, created_at);
CREATE TABLE wallet_holds (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), wallet_id uuid NOT NULL REFERENCES wallets(id), transaction_id uuid, amount_minor bigint NOT NULL CHECK (amount_minor > 0), released_at timestamptz, captured_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX wallet_holds_open_idx ON wallet_holds(wallet_id) WHERE released_at IS NULL AND captured_at IS NULL;
CREATE TABLE deposits (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), wallet_id uuid NOT NULL REFERENCES wallets(id), reference varchar(80) UNIQUE NOT NULL, amount_minor bigint NOT NULL CHECK(amount_minor > 0), currency currency_code NOT NULL, state payment_state NOT NULL DEFAULT 'PENDING', external_reference varchar(160), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE withdrawals (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), wallet_id uuid NOT NULL REFERENCES wallets(id), reference varchar(80) UNIQUE NOT NULL, amount_minor bigint NOT NULL CHECK(amount_minor > 0), fee_minor bigint NOT NULL DEFAULT 0 CHECK(fee_minor >= 0), currency currency_code NOT NULL, state payment_state NOT NULL DEFAULT 'PENDING', destination jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE transfers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference varchar(80) UNIQUE NOT NULL, from_wallet_id uuid NOT NULL REFERENCES wallets(id), to_wallet_id uuid NOT NULL REFERENCES wallets(id), amount_minor bigint NOT NULL CHECK(amount_minor > 0), fee_minor bigint NOT NULL DEFAULT 0 CHECK(fee_minor >= 0), currency currency_code NOT NULL, state transaction_state NOT NULL DEFAULT 'CREATED', created_at timestamptz NOT NULL DEFAULT now(), CHECK(from_wallet_id <> to_wallet_id));

CREATE TABLE services (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code service_code UNIQUE NOT NULL, name varchar(120) NOT NULL, description text, enabled boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE service_configurations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_id uuid UNIQUE NOT NULL REFERENCES services(id) ON DELETE CASCADE, config jsonb NOT NULL DEFAULT '{}', min_amount_minor bigint, max_amount_minor bigint, updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(), CHECK(min_amount_minor IS NULL OR min_amount_minor >= 0), CHECK(max_amount_minor IS NULL OR max_amount_minor >= min_amount_minor));
CREATE TABLE feature_toggles (key varchar(100) PRIMARY KEY, enabled boolean NOT NULL DEFAULT false, metadata jsonb NOT NULL DEFAULT '{}', updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE api_providers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(160) UNIQUE NOT NULL, status provider_status NOT NULL DEFAULT 'ACTIVE', base_url text, capabilities jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE provider_configurations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid NOT NULL REFERENCES api_providers(id) ON DELETE CASCADE, service_id uuid REFERENCES services(id), config jsonb NOT NULL DEFAULT '{}', secret_ref text NOT NULL, priority smallint NOT NULL DEFAULT 100, is_primary boolean NOT NULL DEFAULT false, is_backup boolean NOT NULL DEFAULT false, enabled boolean NOT NULL DEFAULT true, updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(provider_id,service_id));
CREATE UNIQUE INDEX provider_primary_route_idx ON provider_configurations(service_id) WHERE is_primary AND enabled;
CREATE TABLE provider_health (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid NOT NULL REFERENCES api_providers(id) ON DELETE CASCADE, service_id uuid REFERENCES services(id), status provider_status NOT NULL, success_rate numeric(5,2), timeout_rate numeric(5,2), average_latency_ms integer, checked_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX provider_health_latest_idx ON provider_health(provider_id, service_id, checked_at DESC);

CREATE TABLE transactions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference varchar(80) UNIQUE NOT NULL, user_id uuid NOT NULL REFERENCES users(id), service_id uuid NOT NULL REFERENCES services(id), currency currency_code NOT NULL, amount_minor bigint NOT NULL CHECK(amount_minor > 0), fee_minor bigint NOT NULL DEFAULT 0 CHECK(fee_minor >= 0), commission_minor bigint NOT NULL DEFAULT 0 CHECK(commission_minor >= 0), state transaction_state NOT NULL DEFAULT 'CREATED', idempotency_key varchar(160) NOT NULL, request_hash varchar(128) NOT NULL, provider_reference varchar(180), failure_code varchar(100), failure_message text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,idempotency_key));
CREATE INDEX transactions_user_idx ON transactions(user_id, created_at DESC);
CREATE INDEX transactions_state_idx ON transactions(state, updated_at);
CREATE INDEX transactions_provider_ref_idx ON transactions(provider_reference) WHERE provider_reference IS NOT NULL;
CREATE TABLE transaction_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE, item_type varchar(80) NOT NULL, quantity integer NOT NULL DEFAULT 1 CHECK(quantity > 0), unit_amount_minor bigint NOT NULL CHECK(unit_amount_minor >= 0), metadata jsonb NOT NULL DEFAULT '{}');
CREATE TABLE transaction_state_history (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE, from_state transaction_state, to_state transaction_state NOT NULL, reason text, changed_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE provider_attempts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE, provider_id uuid NOT NULL REFERENCES api_providers(id), attempt_no integer NOT NULL CHECK(attempt_no > 0), state provider_attempt_state NOT NULL DEFAULT 'NOT_SENT', request_reference varchar(180) NOT NULL, provider_reference varchar(180), request_payload jsonb, response_metadata jsonb, error_code varchar(100), submitted_at timestamptz, completed_at timestamptz, UNIQUE(transaction_id,attempt_no), UNIQUE(provider_id,request_reference));

CREATE TABLE pricing_rules (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_id uuid NOT NULL REFERENCES services(id), role_code role_code, provider_id uuid REFERENCES api_providers(id), currency currency_code NOT NULL, fixed_fee_minor bigint NOT NULL DEFAULT 0, percentage_bps integer NOT NULL DEFAULT 0 CHECK(percentage_bps >= 0), min_amount_minor bigint, max_amount_minor bigint, effective_from timestamptz NOT NULL, effective_to timestamptz, enabled boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1, created_by uuid REFERENCES users(id));
CREATE INDEX pricing_rules_lookup_idx ON pricing_rules(service_id, role_code, currency, enabled, effective_from DESC);
CREATE TABLE commissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id uuid NOT NULL REFERENCES transactions(id), beneficiary_user_id uuid NOT NULL REFERENCES users(id), amount_minor bigint NOT NULL CHECK(amount_minor >= 0), currency currency_code NOT NULL, rule_snapshot jsonb NOT NULL, state transaction_state NOT NULL DEFAULT 'CREATED', created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE airtime_transactions (transaction_id uuid PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE, network varchar(80) NOT NULL, phone_number varchar(32) NOT NULL, amount_minor bigint NOT NULL CHECK(amount_minor > 0));
CREATE TABLE data_transactions (transaction_id uuid PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE, network varchar(80) NOT NULL, phone_number varchar(32) NOT NULL, plan_code varchar(120) NOT NULL, plan_name varchar(180));
CREATE TABLE electricity_transactions (transaction_id uuid PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE, disco varchar(100) NOT NULL, meter_number varchar(100) NOT NULL, meter_type varchar(40) NOT NULL, customer_name varchar(200), token text); 
CREATE TABLE tv_transactions (transaction_id uuid PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE, provider varchar(100) NOT NULL, smartcard_number varchar(100) NOT NULL, package_code varchar(120) NOT NULL, package_name varchar(180));
CREATE TABLE betting_transactions (transaction_id uuid PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE, bookmaker varchar(100) NOT NULL, customer_reference varchar(160) NOT NULL);
CREATE TABLE airtime_to_money_transactions (transaction_id uuid PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE, network varchar(80) NOT NULL, source_phone_number varchar(32) NOT NULL, destination_wallet_id uuid REFERENCES wallets(id), amount_minor bigint NOT NULL CHECK(amount_minor > 0));
CREATE TABLE voucher_products (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_id uuid NOT NULL REFERENCES services(id), provider_id uuid REFERENCES api_providers(id), name varchar(180) NOT NULL, product_code varchar(120) NOT NULL, face_value_minor bigint NOT NULL CHECK(face_value_minor > 0), selling_price_minor bigint NOT NULL CHECK(selling_price_minor > 0), currency currency_code NOT NULL, enabled boolean NOT NULL DEFAULT false, UNIQUE(provider_id,product_code));
CREATE TABLE voucher_transactions (transaction_id uuid PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE, product_id uuid NOT NULL REFERENCES voucher_products(id), delivery_state transaction_state NOT NULL DEFAULT 'CREATED', encrypted_value text, revealed_at timestamptz, revealed_by uuid REFERENCES users(id));
CREATE TABLE data_printing_transactions (transaction_id uuid PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE, customer_name varchar(180), customer_phone varchar(32), print_count integer NOT NULL DEFAULT 1 CHECK(print_count > 0), receipt_object_key text);
CREATE TABLE bulk_transactions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), submitted_by uuid NOT NULL REFERENCES users(id), service_id uuid NOT NULL REFERENCES services(id), reference varchar(80) UNIQUE NOT NULL, total_items integer NOT NULL CHECK(total_items > 0), successful_items integer NOT NULL DEFAULT 0, failed_items integer NOT NULL DEFAULT 0, state batch_state NOT NULL DEFAULT 'CREATED', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE bulk_transaction_items (bulk_id uuid REFERENCES bulk_transactions(id) ON DELETE CASCADE, transaction_id uuid UNIQUE NOT NULL REFERENCES transactions(id), item_no integer NOT NULL, PRIMARY KEY(bulk_id,item_no));

CREATE TABLE ecommerce_products (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sku varchar(100) UNIQUE NOT NULL, name varchar(200) NOT NULL, description text, price_minor bigint NOT NULL CHECK(price_minor >= 0), currency currency_code NOT NULL, stock_quantity integer NOT NULL DEFAULT 0 CHECK(stock_quantity >= 0), enabled boolean NOT NULL DEFAULT false, metadata jsonb NOT NULL DEFAULT '{}');
CREATE TABLE orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference varchar(80) UNIQUE NOT NULL, user_id uuid NOT NULL REFERENCES users(id), state order_state NOT NULL DEFAULT 'DRAFT', currency currency_code NOT NULL, subtotal_minor bigint NOT NULL DEFAULT 0, total_minor bigint NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE order_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE, product_id uuid NOT NULL REFERENCES ecommerce_products(id), quantity integer NOT NULL CHECK(quantity > 0), unit_price_minor bigint NOT NULL CHECK(unit_price_minor >= 0));
CREATE TABLE payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference varchar(80) UNIQUE NOT NULL, user_id uuid NOT NULL REFERENCES users(id), order_id uuid REFERENCES orders(id), deposit_id uuid REFERENCES deposits(id), amount_minor bigint NOT NULL CHECK(amount_minor > 0), currency currency_code NOT NULL, state payment_state NOT NULL DEFAULT 'PENDING', provider_reference varchar(180), idempotency_key varchar(160) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,idempotency_key));

CREATE TABLE notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, channel notification_channel NOT NULL, subject varchar(200), body text NOT NULL, state notification_state NOT NULL DEFAULT 'PENDING', data jsonb NOT NULL DEFAULT '{}', sent_at timestamptz, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX notifications_user_idx ON notifications(user_id, state, created_at DESC);
CREATE TABLE audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES users(id), action varchar(120) NOT NULL, resource_type varchar(100) NOT NULL, resource_id uuid, before_data jsonb, after_data jsonb, reason text, ip_address inet, user_agent text, correlation_id varchar(100), created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX audit_logs_resource_idx ON audit_logs(resource_type, resource_id, created_at DESC);
CREATE TABLE api_keys (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, key_id varchar(80) UNIQUE NOT NULL, secret_hash text NOT NULL, scopes text[] NOT NULL DEFAULT '{}', expires_at timestamptz, revoked_at timestamptz, last_used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE webhooks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid NOT NULL REFERENCES api_providers(id), event_id varchar(180) NOT NULL, event_type varchar(120), payload jsonb NOT NULL, signature_valid boolean NOT NULL DEFAULT false, processed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(provider_id,event_id));
CREATE TABLE reconciliation_records (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id uuid REFERENCES transactions(id), provider_id uuid REFERENCES api_providers(id), external_reference varchar(180), expected_state transaction_state, observed_state transaction_state, state reconciliation_state NOT NULL DEFAULT 'OPEN', notes text, resolved_by uuid REFERENCES users(id), resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX reconciliation_open_idx ON reconciliation_records(state, created_at) WHERE state IN ('OPEN','IN_REVIEW');

CREATE INDEX transactions_created_idx ON transactions(created_at DESC);
CREATE INDEX provider_attempts_status_idx ON provider_attempts(state, submitted_at);
CREATE INDEX ledger_transactions_source_idx ON ledger_transactions(source_type, source_id);
CREATE INDEX orders_user_idx ON orders(user_id, created_at DESC);
CREATE INDEX webhook_unprocessed_idx ON webhooks(provider_id, created_at) WHERE processed_at IS NULL;

INSERT INTO roles(code,name) VALUES
 ('CUSTOMER','Customer'),('AGENT','Agent'),('VENDOR','Vendor'),('ADMIN','Administrator'),('SUPER_ADMIN','Super Administrator'),('FINANCE_ADMIN','Finance Administrator'),('OPERATIONS_ADMIN','Operations Administrator'),('SUPPORT_ADMIN','Support Administrator'),('AUDITOR','Auditor')
ON CONFLICT (code) DO NOTHING;
INSERT INTO services(code,name,enabled) VALUES
 ('AIRTIME','Airtime',false),('DATA','Data',false),('ELECTRICITY','Electricity',false),('TV_SUBSCRIPTION','TV subscription',false),('BETTING','Betting',false),('AIRTIME_TO_MONEY','Airtime to Money',false),('VOUCHER','PIN and Voucher',false),('DATA_PRINTING','Data Printing',false),('ECOMMERCE','E-commerce',false)
ON CONFLICT (code) DO NOTHING;
