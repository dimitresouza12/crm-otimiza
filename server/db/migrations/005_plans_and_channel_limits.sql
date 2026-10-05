ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS channel_limit integer,
  ADD COLUMN IF NOT EXISTS plan_price_cents integer;

UPDATE companies
SET channel_limit = CASE
  WHEN plan = 'essential' THEN 1
  WHEN plan IN ('pro', 'chatbot', 'automation') THEN 3
  ELSE 1
END
WHERE channel_limit IS NULL;

UPDATE companies
SET plan_price_cents = 0
WHERE plan_price_cents IS NULL;

ALTER TABLE companies
  ALTER COLUMN channel_limit SET DEFAULT 1,
  ALTER COLUMN channel_limit SET NOT NULL,
  ALTER COLUMN plan_price_cents SET DEFAULT 0,
  ALTER COLUMN plan_price_cents SET NOT NULL;

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_channel_limit_check;
ALTER TABLE companies ADD CONSTRAINT companies_channel_limit_check CHECK (channel_limit BETWEEN 1 AND 5);

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_plan_price_cents_check;
ALTER TABLE companies ADD CONSTRAINT companies_plan_price_cents_check CHECK (plan_price_cents >= 0);

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_plan_check;
ALTER TABLE companies ADD CONSTRAINT companies_plan_check CHECK (plan IN ('essential', 'pro', 'crm', 'chatbot', 'automation'));
