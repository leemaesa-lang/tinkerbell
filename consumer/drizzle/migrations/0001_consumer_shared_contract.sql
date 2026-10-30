CREATE TYPE coupon_status AS ENUM ('ACTIVE','PAUSED','SOLD_OUT','EXPIRED');
CREATE TYPE usage_type AS ENUM ('VISIT','PICKUP','RESERVATION');
CREATE TYPE user_coupon_status AS ENUM ('ACTIVE','USED','EXPIRED','RETURNED');
CREATE TYPE order_status AS ENUM ('PENDING','CONFIRMED','REJECTED','COMPLETED');
CREATE TYPE deposit_ledger_type AS ENUM ('COUPON_USE_DEBIT','COUPON_ISSUE_LOCK','COUPON_REFUND');

CREATE TABLE users (
  id text PRIMARY KEY,
  phone text NOT NULL UNIQUE,
  name text NOT NULL,
  dong text NOT NULL,
  member_only boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX users_dong_idx ON users(dong);

CREATE TABLE merchants (
  id text PRIMARY KEY,
  name text NOT NULL,
  branch_name text NOT NULL,
  address text NOT NULL,
  phone text NOT NULL,
  business_hours jsonb NOT NULL,
  closed_day text NOT NULL,
  deposit_balance integer NOT NULL DEFAULT 0,
  locked_balance integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE coupons (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id),
  title text NOT NULL,
  original_price integer NOT NULL,
  discount_price integer NOT NULL,
  discount_rate numeric(5,2) NOT NULL,
  usage_type usage_type NOT NULL,
  target_radius_km numeric(4,2) NOT NULL,
  target_dongs jsonb NOT NULL,
  remaining_quantity integer NOT NULL,
  status coupon_status NOT NULL DEFAULT 'ACTIVE',
  member_only boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coupons_active_target_idx ON coupons(status, merchant_id);
CREATE INDEX coupons_usage_type_idx ON coupons(usage_type);

CREATE TABLE user_coupons (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  coupon_id text NOT NULL REFERENCES coupons(id),
  status user_coupon_status NOT NULL DEFAULT 'ACTIVE',
  visit_date text,
  pickup_time text,
  party_size integer,
  verification_pin_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_coupons_user_status_idx ON user_coupons(user_id, status);
CREATE INDEX user_coupons_monthly_claim_idx ON user_coupons(user_id, coupon_id, created_at);

CREATE TABLE orders (
  id text PRIMARY KEY,
  user_coupon_id text NOT NULL REFERENCES user_coupons(id),
  usage_type usage_type NOT NULL,
  status order_status NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_status_idx ON orders(status);

CREATE TABLE reservations (
  id text PRIMARY KEY,
  user_coupon_id text NOT NULL REFERENCES user_coupons(id),
  usage_type usage_type NOT NULL DEFAULT 'RESERVATION',
  visit_date text NOT NULL,
  visit_time text NOT NULL,
  party_size integer NOT NULL,
  status order_status NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE deposit_ledgers (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id),
  user_coupon_id text REFERENCES user_coupons(id),
  type deposit_ledger_type NOT NULL,
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deposit_ledgers_merchant_created_idx ON deposit_ledgers(merchant_id, created_at);

CREATE TABLE audit_logs (
  id text PRIMARY KEY,
  actor_user_id text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  metadata jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
