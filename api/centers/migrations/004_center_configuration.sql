ALTER TABLE centers.centers ADD COLUMN capacity integer CHECK(capacity IS NULL OR capacity BETWEEN 1 AND 100000);
ALTER TABLE centers.centers ADD COLUMN opening_hours jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(opening_hours)='object');
ALTER TABLE centers.centers ADD COLUMN billing_day integer NOT NULL DEFAULT 1 CHECK(billing_day BETWEEN 1 AND 31);
