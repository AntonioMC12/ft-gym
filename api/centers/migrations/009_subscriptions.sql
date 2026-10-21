-- Trusted extension; migrator has database CREATE, runtime retains no DDL privilege.
-- https://www.postgresql.org/docs/18/btree-gist.html
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA centers;
CREATE TABLE centers.subscriptions (
  id text PRIMARY KEY CHECK(id ~ '^[a-zA-Z0-9_-]{1,64}$'),
  center_id text NOT NULL, member_id text NOT NULL, plan_id text NOT NULL, price_version_id text NOT NULL,
  starts_on date NOT NULL, ends_on date,
  billing_day integer NOT NULL CHECK(billing_day BETWEEN 1 AND 31), anchor_on date NOT NULL, timezone text NOT NULL,
  discount_basis_points integer NOT NULL DEFAULT 0 CHECK(discount_basis_points BETWEEN 0 AND 10000),
  discount_reason text CHECK(length(btrim(discount_reason)) BETWEEN 1 AND 250),
  replaces_id text, previous_ends_on date, activation_id text,
  canceled_at timestamptz, canceled_by text, version integer NOT NULL DEFAULT 1 CHECK(version>0),
  actor_uid text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(center_id,member_id,id),
  FOREIGN KEY(center_id,member_id) REFERENCES centers.members(center_id,id),
  FOREIGN KEY(center_id,plan_id,price_version_id) REFERENCES centers.membership_plan_versions(center_id,plan_id,id),
  FOREIGN KEY(center_id,member_id,replaces_id) REFERENCES centers.subscriptions(center_id,member_id,id),
  FOREIGN KEY(center_id,member_id,activation_id) REFERENCES centers.membership_changes(center_id,member_id,id),
  CHECK(ends_on IS NULL OR ends_on>=starts_on), CHECK(anchor_on<=starts_on),
  CHECK(discount_basis_points=0 OR discount_reason IS NOT NULL),
  CHECK((canceled_at IS NULL)=(canceled_by IS NULL)),
  EXCLUDE USING gist (center_id centers.gist_text_ops WITH =,member_id centers.gist_text_ops WITH =,
    daterange(starts_on,ends_on,'[)') WITH &&) WHERE(canceled_at IS NULL)
);
CREATE INDEX subscription_member ON centers.subscriptions(center_id,member_id,starts_on DESC);
ALTER TABLE centers.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY subscription_read ON centers.subscriptions FOR SELECT TO centers_app USING(
  centers.is_platform() OR (center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY subscription_insert ON centers.subscriptions FOR INSERT TO centers_app WITH CHECK(
  actor_uid=centers.actor_uid() AND (centers.is_platform() OR (center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager']))));
CREATE POLICY subscription_update ON centers.subscriptions FOR UPDATE TO centers_app USING(
  centers.is_platform() OR (center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager'])))
  WITH CHECK(centers.is_platform() OR (center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager'])));
CREATE FUNCTION centers.check_subscription() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE local_day date; plan_record record;
BEGIN
  SELECT (CURRENT_TIMESTAMP AT TIME ZONE timezone)::date INTO local_day FROM centers.centers WHERE id=NEW.center_id;
  IF TG_OP='INSERT' THEN
    IF NEW.starts_on<local_day THEN RAISE EXCEPTION 'retroactive subscription' USING ERRCODE='23514'; END IF;
    SELECT p.archived_at,p.current_revision,v.revision INTO plan_record FROM centers.membership_plans p
      JOIN centers.membership_plan_versions v ON (v.center_id,v.plan_id)=(p.center_id,p.id)
      WHERE p.center_id=NEW.center_id AND p.id=NEW.plan_id AND v.id=NEW.price_version_id FOR SHARE OF p;
    IF plan_record.revision IS NULL OR plan_record.archived_at IS NOT NULL OR plan_record.revision<>plan_record.current_revision THEN
      RAISE EXCEPTION 'new subscriptions require an active current price version' USING ERRCODE='23514';
    END IF;
  ELSE
    IF OLD.canceled_at IS NOT NULL THEN RAISE EXCEPTION 'canceled subscription immutable' USING ERRCODE='23514'; END IF;
    IF NEW.canceled_at IS NOT NULL AND (OLD.starts_on<=local_day OR NEW.canceled_by IS DISTINCT FROM centers.actor_uid()) THEN
      RAISE EXCEPTION 'only future subscriptions can be canceled' USING ERRCODE='23514';
    END IF;
    IF NEW.ends_on IS DISTINCT FROM OLD.ends_on AND
      ((OLD.ends_on IS NOT NULL AND OLD.ends_on<=local_day) OR (NEW.ends_on IS NOT NULL AND NEW.ends_on<local_day)) THEN
      RAISE EXCEPTION 'historical periods immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER check_subscription BEFORE INSERT OR UPDATE ON centers.subscriptions FOR EACH ROW EXECUTE FUNCTION centers.check_subscription();
REVOKE ALL ON centers.subscriptions FROM PUBLIC;
REVOKE ALL ON FUNCTION centers.check_subscription() FROM PUBLIC;
GRANT SELECT,INSERT ON centers.subscriptions TO centers_app;
GRANT UPDATE(ends_on,canceled_at,canceled_by,version) ON centers.subscriptions TO centers_app;
-- Snapshot of terms/calendar/discount is never updated. A plan/discount change creates another row.
