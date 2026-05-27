CREATE TYPE "stock_health_status" AS ENUM (
  'HEALTHY',
  'LOW',
  'CRITICAL',
  'STOCKOUT'
);

CREATE TYPE "import_status" AS ENUM (
  'PENDING',
  'SUCCESS',
  'PARTIAL',
  'FAILED',
  'SKIPPED'
);

CREATE TYPE "confidence_flag" AS ENUM (
  'RECENT_STOCKOUT',
  'LEADING_ZEROS',
  'HIGH_VOLATILITY',
  'DECLINING_TREND',
  'VELOCITY_DIVERGENCE',
  'SPARSE_DATA',
  'MOQ_OVERSHOOT'
);

CREATE TYPE "ai_action_type" AS ENUM (
  'ORDER_NOW',
  'ORDER_SOON',
  'WAIT',
  'INVESTIGATE',
  'DISCONTINUE'
);

CREATE TYPE "scenario_kind" AS ENUM (
  'BASELINE',
  'CUSTOM'
);

CREATE TABLE "categories" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "code" varchar(50) UNIQUE NOT NULL,
  "name" varchar(100) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "suppliers" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "name" varchar(200) UNIQUE NOT NULL,
  "production_lead_days" integer NOT NULL,
  "shipping_days" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "skus" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "sku_code" varchar(50) UNIQUE NOT NULL,
  "name" varchar(255) NOT NULL,
  "category_id" uuid NOT NULL,
  "supplier_id" uuid NOT NULL,
  "cost_per_unit_usd" numeric(10,2) NOT NULL,
  "retail_price_usd" numeric(10,2) NOT NULL,
  "moq" integer NOT NULL,
  "current_stock" integer NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "sku_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "sku_id" uuid NOT NULL,
  "snapshot_date" date NOT NULL,
  "current_stock" integer NOT NULL,
  "cost_per_unit_usd" numeric(10,2) NOT NULL,
  "retail_price_usd" numeric(10,2) NOT NULL,
  "moq" integer NOT NULL,
  "confidence_flags" jsonb NOT NULL DEFAULT ('[]'::jsonb),
  "import_run_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "sku_sales_daily" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "sku_id" uuid NOT NULL,
  "sale_date" date NOT NULL,
  "units_sold" integer NOT NULL,
  "import_run_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "import_runs" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "file_checksum" varchar(64) UNIQUE NOT NULL,
  "source_filename" varchar(255) NOT NULL,
  "data_date" date NOT NULL,
  "status" import_status NOT NULL DEFAULT 'PENDING',
  "skus_created" integer NOT NULL DEFAULT 0,
  "skus_updated" integer NOT NULL DEFAULT 0,
  "snapshots_created" integer NOT NULL DEFAULT 0,
  "sales_rows_inserted" integer NOT NULL DEFAULT 0,
  "sales_rows_skipped" integer NOT NULL DEFAULT 0,
  "error_log" jsonb,
  "started_at" timestamptz NOT NULL DEFAULT (now()),
  "finished_at" timestamptz
);

CREATE TABLE "app_config" (
  "id" varchar(20) PRIMARY KEY DEFAULT ('active'),
  "shipping_buffer_days" integer NOT NULL DEFAULT 7,
  "forecast_window_days" integer NOT NULL DEFAULT 60,
  "growth_pct" numeric(5,2) NOT NULL DEFAULT 0,
  "critical_multiplier" numeric(4,2) NOT NULL DEFAULT 1,
  "low_multiplier" numeric(4,2) NOT NULL DEFAULT 1.5,
  "velocity_window_short" integer NOT NULL DEFAULT 7,
  "velocity_window_long" integer NOT NULL DEFAULT 14,
  "volatility_cv_threshold" numeric(4,2) NOT NULL DEFAULT 0.5,
  "velocity_divergence_threshold" numeric(4,2) NOT NULL DEFAULT 0.5,
  "sparse_data_min_days" integer NOT NULL DEFAULT 14,
  "moq_overshoot_multiplier" numeric(4,2) NOT NULL DEFAULT 2,
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_by" varchar(100)
);

CREATE TABLE "saved_scenarios" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "name" varchar(100) UNIQUE NOT NULL,
  "kind" scenario_kind NOT NULL DEFAULT 'CUSTOM',
  "description" text,
  "shipping_buffer_days" integer NOT NULL,
  "forecast_window_days" integer NOT NULL,
  "growth_pct" numeric(5,2) NOT NULL,
  "critical_multiplier" numeric(4,2) NOT NULL,
  "low_multiplier" numeric(4,2) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "ai_suggestions" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "sku_id" uuid NOT NULL,
  "context_hash" varchar(64) NOT NULL,
  "context_snapshot" jsonb NOT NULL,
  "action_type" ai_action_type NOT NULL,
  "urgency" integer NOT NULL,
  "reasoning" text NOT NULL,
  "suggested_po_qty" integer,
  "warnings" jsonb NOT NULL DEFAULT ('[]'::jsonb),
  "model_name" varchar(100) NOT NULL,
  "tokens_input" integer,
  "tokens_output" integer,
  "generated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE UNIQUE INDEX ON "categories" ("code");

CREATE UNIQUE INDEX ON "suppliers" ("name");

CREATE UNIQUE INDEX ON "skus" ("sku_code");

CREATE INDEX ON "skus" ("category_id");

CREATE INDEX ON "skus" ("supplier_id");

CREATE INDEX ON "skus" ("is_active");

CREATE UNIQUE INDEX ON "sku_snapshots" ("sku_id", "snapshot_date");

CREATE INDEX ON "sku_snapshots" ("sku_id");

CREATE INDEX ON "sku_snapshots" ("snapshot_date");

CREATE INDEX ON "sku_snapshots" ("import_run_id");

CREATE UNIQUE INDEX ON "sku_sales_daily" ("sku_id", "sale_date");

CREATE INDEX ON "sku_sales_daily" ("sku_id");

CREATE INDEX ON "sku_sales_daily" ("sale_date");

CREATE INDEX "idx_sku_sales_lookup" ON "sku_sales_daily" ("sku_id", "sale_date");

CREATE UNIQUE INDEX ON "import_runs" ("file_checksum");

CREATE INDEX ON "import_runs" ("status");

CREATE INDEX ON "import_runs" ("started_at");

CREATE UNIQUE INDEX ON "saved_scenarios" ("name");

CREATE INDEX ON "saved_scenarios" ("kind");

CREATE UNIQUE INDEX "uq_ai_cache_key" ON "ai_suggestions" ("sku_id", "context_hash");

CREATE INDEX ON "ai_suggestions" ("sku_id");

CREATE INDEX ON "ai_suggestions" ("context_hash");

CREATE INDEX ON "ai_suggestions" ("generated_at");

CREATE INDEX "idx_sku_history" ON "ai_suggestions" ("sku_id", "generated_at");

COMMENT ON COLUMN "suppliers"."production_lead_days" IS 'default production lead time';

COMMENT ON COLUMN "suppliers"."shipping_days" IS 'default shipping time';

COMMENT ON TABLE "skus" IS 'current_stock is denormalized from latest sku_snapshot for query speed. Trigger or app-level keeps in sync.';

COMMENT ON COLUMN "skus"."sku_code" IS 'business key from JSON: GLW-001 etc.';

COMMENT ON COLUMN "skus"."moq" IS 'minimum order quantity';

COMMENT ON COLUMN "skus"."current_stock" IS 'mirrors latest snapshot for fast queries';

COMMENT ON TABLE "sku_snapshots" IS 'unique(sku_id, snapshot_date) забезпечує дедуп: повторний імпорт того ж дня не плодить рядки';

COMMENT ON COLUMN "sku_snapshots"."snapshot_date" IS 'data date from import (config.today), NOT wall clock';

COMMENT ON COLUMN "sku_snapshots"."confidence_flags" IS 'array of confidence_flag values for this snapshot';

COMMENT ON TABLE "sku_sales_daily" IS 'INSERT ON CONFLICT (sku_id, sale_date) DO NOTHING — основний дедуп при імпорті';

COMMENT ON TABLE "import_runs" IS 'Алгоритм: 1) compute checksum, 2) lookup → якщо є SUCCESS → SKIPPED, 3) інакше створюємо row, виконуємо upserts, фіналізуємо status';

COMMENT ON COLUMN "import_runs"."file_checksum" IS 'sha256 of input file';

COMMENT ON COLUMN "import_runs"."data_date" IS 'config.today з імпортованого файлу';

COMMENT ON COLUMN "import_runs"."sales_rows_skipped" IS 'через ON CONFLICT';

COMMENT ON COLUMN "import_runs"."error_log" IS 'array of error objects per SKU';

COMMENT ON COLUMN "app_config"."id" IS 'completes singleton via CHECK';

COMMENT ON COLUMN "app_config"."growth_pct" IS '0..1000, e.g. 20.00 = +20%';

COMMENT ON COLUMN "app_config"."critical_multiplier" IS 'days_of_stock < lead * this → CRITICAL';

COMMENT ON COLUMN "app_config"."low_multiplier" IS 'days_of_stock < lead * this → LOW';

COMMENT ON COLUMN "app_config"."updated_by" IS 'optional: user identifier';

COMMENT ON TABLE "saved_scenarios" IS 'Snapshot конфігу на момент створення. Не FK на app_config бо це повний knapshot.';

COMMENT ON TABLE "ai_suggestions" IS 'Cache hit: SELECT WHERE context_hash = ? — повертаємо найновіший. На зміні context (нові продажі / новий config) hash змінюється → новий call.';

COMMENT ON COLUMN "ai_suggestions"."context_hash" IS 'sha256 of (sku state + config) — cache key';

COMMENT ON COLUMN "ai_suggestions"."context_snapshot" IS 'все що було передано в LLM';

COMMENT ON COLUMN "ai_suggestions"."urgency" IS '1..5';

COMMENT ON COLUMN "ai_suggestions"."suggested_po_qty" IS 'nullable: тільки для ORDER actions';

COMMENT ON COLUMN "ai_suggestions"."warnings" IS 'array of warning strings';

ALTER TABLE "skus" ADD FOREIGN KEY ("category_id") REFERENCES "categories" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "skus" ADD FOREIGN KEY ("supplier_id") REFERENCES "suppliers" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sku_snapshots" ADD FOREIGN KEY ("sku_id") REFERENCES "skus" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sku_snapshots" ADD FOREIGN KEY ("import_run_id") REFERENCES "import_runs" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sku_sales_daily" ADD FOREIGN KEY ("sku_id") REFERENCES "skus" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sku_sales_daily" ADD FOREIGN KEY ("import_run_id") REFERENCES "import_runs" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "ai_suggestions" ADD FOREIGN KEY ("sku_id") REFERENCES "skus" ("id") DEFERRABLE INITIALLY IMMEDIATE;
