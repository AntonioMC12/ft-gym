CREATE TABLE centers.receipts (
  id text PRIMARY KEY CHECK(id ~ '^[a-zA-Z0-9_-]{1,64}$'),
  center_id text NOT NULL, member_id text NOT NULL, subscription_id text NOT NULL,
  concept text NOT NULL DEFAULT 'membership' CHECK(concept='membership'),
  period_start date NOT NULL, period_end date NOT NULL, due_on date NOT NULL,
  currency text NOT NULL CHECK(currency='EUR'),
  net_minor bigint NOT NULL CHECK(net_minor>=0), tax_minor bigint NOT NULL CHECK(tax_minor>=0),
  total_minor bigint NOT NULL CHECK(total_minor>0 AND total_minor=net_minor+tax_minor),
  snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
  actor_uid text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(center_id,member_id,subscription_id) REFERENCES centers.subscriptions(center_id,member_id,id),
  UNIQUE(center_id,id), UNIQUE(center_id,subscription_id,period_start,concept),
  CHECK(period_end>period_start), CHECK(due_on>=period_start)
);
CREATE INDEX receipt_member_page ON centers.receipts(center_id,member_id,created_at DESC,id DESC);
ALTER TABLE centers.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY receipt_read ON centers.receipts FOR SELECT TO centers_app USING(
  centers.is_platform() OR (center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY receipt_insert ON centers.receipts FOR INSERT TO centers_app WITH CHECK(
  actor_uid=centers.actor_uid() AND (centers.is_platform() OR (center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager']))));
REVOKE ALL ON centers.receipts FROM PUBLIC;
GRANT SELECT,INSERT ON centers.receipts TO centers_app;
-- No paid flag, UPDATE or DELETE. Applications/refunds will be separate append-only entries (C20).
