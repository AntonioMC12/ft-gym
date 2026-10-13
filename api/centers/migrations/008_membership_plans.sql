CREATE TABLE centers.membership_plans (
  id text PRIMARY KEY CHECK(id ~ '^[a-zA-Z0-9_-]{1,64}$'),
  center_id text NOT NULL REFERENCES centers.centers(id),
  current_revision integer NOT NULL DEFAULT 1 CHECK(current_revision>0),
  archived_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(center_id,id)
);
CREATE TABLE centers.membership_plan_versions (
  id text PRIMARY KEY CHECK(id ~ '^[a-zA-Z0-9_-]{1,64}$'),
  center_id text NOT NULL, plan_id text NOT NULL, revision integer NOT NULL CHECK(revision>0),
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),
  price_minor bigint NOT NULL CHECK(price_minor BETWEEN 0 AND 1000000000000),
  currency text NOT NULL CHECK(currency='EUR'),
  interval_months integer NOT NULL CHECK(interval_months IN (1,3,6,12)),
  price_includes_tax boolean, tax_basis_points integer CHECK(tax_basis_points BETWEEN 0 AND 10000),
  proration text CHECK(proration IN ('none','actual-days')),
  created_at timestamptz NOT NULL DEFAULT now(), actor_uid text NOT NULL,
  FOREIGN KEY(center_id,plan_id) REFERENCES centers.membership_plans(center_id,id),
  UNIQUE(center_id,plan_id,revision), UNIQUE(center_id,id), UNIQUE(center_id,plan_id,id),
  CHECK((price_includes_tax IS NULL)=(tax_basis_points IS NULL))
);
ALTER TABLE centers.membership_plans ADD CONSTRAINT plan_current_revision
  FOREIGN KEY(center_id,id,current_revision) REFERENCES centers.membership_plan_versions(center_id,plan_id,revision)
  DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX plans_center_page ON centers.membership_plans(center_id,created_at DESC,id DESC);
ALTER TABLE centers.membership_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.membership_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE centers.membership_plan_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.membership_plan_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY plans_read ON centers.membership_plans FOR SELECT TO centers_app USING(
  centers.is_platform() OR (center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY plans_insert ON centers.membership_plans FOR INSERT TO centers_app WITH CHECK(
  centers.is_platform() OR (center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY plans_archive ON centers.membership_plans FOR UPDATE TO centers_app USING(
  centers.is_platform() OR (center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager'])))
  WITH CHECK(centers.is_platform() OR (center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY plan_versions_read ON centers.membership_plan_versions FOR SELECT TO centers_app USING(
  centers.is_platform() OR (center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY plan_versions_insert ON centers.membership_plan_versions FOR INSERT TO centers_app WITH CHECK(
  actor_uid=centers.actor_uid() AND (centers.is_platform() OR (center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager']))));
REVOKE ALL ON centers.membership_plans,centers.membership_plan_versions FROM PUBLIC;
GRANT SELECT,INSERT ON centers.membership_plans,centers.membership_plan_versions TO centers_app;
GRANT UPDATE(current_revision,archived_at,version) ON centers.membership_plans TO centers_app;
-- Price/conditions versions are immutable even before first use. No UPDATE or DELETE grant.
