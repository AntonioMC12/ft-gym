CREATE TABLE centers.billing_automation (
  center_id text PRIMARY KEY REFERENCES centers.centers(id),
  enabled boolean NOT NULL DEFAULT false, from_on date NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  scan_after text NOT NULL DEFAULT '', scanned_at timestamptz,
  actor_uid text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE centers.job_runs (
  id text PRIMARY KEY, center_id text NOT NULL, member_id text NOT NULL,
  subscription_id text NOT NULL, period_start date NOT NULL, due_on date NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','done','skipped','blocked')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(), error_code text,
  receipt_id text, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  FOREIGN KEY(center_id,member_id,subscription_id) REFERENCES centers.subscriptions(center_id,member_id,id),
  FOREIGN KEY(center_id,receipt_id) REFERENCES centers.receipts(center_id,id),
  UNIQUE(center_id,subscription_id,period_start), CHECK(due_on>=period_start),
  CHECK((state IN ('done','skipped'))=(finished_at IS NOT NULL)),
  CHECK(state<>'done' OR receipt_id IS NOT NULL)
);
CREATE INDEX job_ready ON centers.job_runs(center_id,next_attempt_at,id) WHERE state='pending';
CREATE TABLE centers.outbox (
  id text PRIMARY KEY, center_id text NOT NULL, receipt_id text NOT NULL,
  kind text NOT NULL CHECK(kind='receipt.created'),
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sent','blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(center_id,receipt_id) REFERENCES centers.receipts(center_id,id),
  UNIQUE(center_id,kind,receipt_id)
);
ALTER TABLE centers.billing_automation ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.billing_automation FORCE ROW LEVEL SECURITY;
ALTER TABLE centers.job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.job_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE centers.outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY automation_read ON centers.billing_automation FOR SELECT TO centers_app USING(
  center_id=centers.selected_center() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY automation_insert ON centers.billing_automation FOR INSERT TO centers_app WITH CHECK(
  center_id=centers.selected_center() AND centers.is_platform());
CREATE POLICY automation_update ON centers.billing_automation FOR UPDATE TO centers_app USING(
  centers.is_platform() AND (center_id=centers.selected_center() OR centers.selected_center() IS NULL))
  WITH CHECK(centers.is_platform() AND center_id=centers.selected_center());
-- The internal scheduler can discover enabled centers; HTTP services still select a center.
CREATE POLICY automation_discovery ON centers.billing_automation FOR SELECT TO centers_app USING(centers.is_platform());
CREATE POLICY job_read ON centers.job_runs FOR SELECT TO centers_app USING(
  center_id=centers.selected_center() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY job_insert ON centers.job_runs FOR INSERT TO centers_app WITH CHECK(center_id=centers.selected_center() AND centers.is_platform());
CREATE POLICY job_update ON centers.job_runs FOR UPDATE TO centers_app USING(center_id=centers.selected_center() AND centers.is_platform()) WITH CHECK(center_id=centers.selected_center() AND centers.is_platform());
CREATE POLICY outbox_read ON centers.outbox FOR SELECT TO centers_app USING(
  center_id=centers.selected_center() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY outbox_insert ON centers.outbox FOR INSERT TO centers_app WITH CHECK(
  center_id=centers.selected_center() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])));
REVOKE ALL ON centers.billing_automation,centers.job_runs,centers.outbox FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON centers.billing_automation,centers.job_runs TO centers_app;
GRANT SELECT,INSERT ON centers.outbox TO centers_app;
-- No DELETE, no outbox delivery before C26, and no global account suspension.
