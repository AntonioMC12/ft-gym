CREATE TABLE centers.membership_changes (
  id text PRIMARY KEY CHECK(id ~ '^[a-zA-Z0-9_-]{1,64}$'),
  center_id text NOT NULL, member_id text NOT NULL,
  sequence integer NOT NULL CHECK(sequence>0),
  action text NOT NULL CHECK(action IN ('end','freeze','resume','activate')),
  from_state text NOT NULL, to_state text NOT NULL,
  effective_on date NOT NULL, resume_on date, reason text,
  parent_id text, actor_uid text NOT NULL,
  canceled_at timestamptz, canceled_by text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(center_id,member_id,id), UNIQUE(center_id,member_id,sequence),
  FOREIGN KEY(center_id,member_id) REFERENCES centers.members(center_id,id),
  FOREIGN KEY(center_id,member_id,parent_id) REFERENCES centers.membership_changes(center_id,member_id,id),
  CHECK((action='end' AND from_state IN ('preactive','active','frozen') AND to_state='ended') OR
        (action='freeze' AND from_state='active' AND to_state='frozen') OR
        (action='resume' AND from_state='frozen' AND to_state='active') OR
        (action='activate' AND from_state='preactive' AND to_state='active')),
  CHECK(reason IS NULL OR length(btrim(reason)) BETWEEN 1 AND 250),
  CHECK(action NOT IN ('end','freeze') OR reason IS NOT NULL),
  CHECK(resume_on IS NULL OR (action='freeze' AND resume_on>effective_on)),
  CHECK(parent_id IS NULL OR action='resume'),
  CHECK((canceled_at IS NULL)=(canceled_by IS NULL))
);
CREATE INDEX membership_effective ON centers.membership_changes(center_id,member_id,effective_on DESC,sequence DESC) WHERE canceled_at IS NULL;
ALTER TABLE centers.membership_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.membership_changes FORCE ROW LEVEL SECURITY;
CREATE POLICY membership_changes_read ON centers.membership_changes FOR SELECT TO centers_app USING(
  centers.is_platform() OR (center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager','trainer'])) OR
  EXISTS(SELECT 1 FROM centers.members m WHERE m.center_id=membership_changes.center_id AND m.id=member_id AND m.account_uid=centers.actor_uid())
);
CREATE POLICY membership_changes_insert ON centers.membership_changes FOR INSERT TO centers_app WITH CHECK(
  actor_uid=centers.actor_uid() AND (centers.is_platform() OR
    (center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager'])))
);
CREATE POLICY membership_changes_cancel ON centers.membership_changes FOR UPDATE TO centers_app USING(
  centers.is_platform() OR (center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager']))
) WITH CHECK(canceled_by=centers.actor_uid() AND (centers.is_platform() OR
  (center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager']))));

CREATE FUNCTION centers.check_membership_change() RETURNS trigger LANGUAGE plpgsql
  SET search_path=pg_catalog AS $$
DECLARE local_day date; parent centers.membership_changes;
BEGIN
  SELECT (CURRENT_TIMESTAMP AT TIME ZONE timezone)::date INTO local_day FROM centers.centers WHERE id=NEW.center_id;
  IF TG_OP='UPDATE' THEN
    IF OLD.canceled_at IS NOT NULL OR NEW.canceled_at IS NULL OR OLD.effective_on<=local_day THEN
      RAISE EXCEPTION 'only future unapplied changes can be canceled' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.parent_id IS NOT NULL THEN
    SELECT * INTO parent FROM centers.membership_changes
      WHERE center_id=NEW.center_id AND member_id=NEW.member_id AND id=NEW.parent_id;
    IF parent.id IS NULL OR parent.action<>'freeze' OR parent.parent_id IS NOT NULL OR
      parent.resume_on IS DISTINCT FROM NEW.effective_on OR parent.canceled_at IS NOT NULL THEN
      RAISE EXCEPTION 'invalid automatic resumption relation' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER check_membership_change BEFORE INSERT OR UPDATE ON centers.membership_changes
  FOR EACH ROW EXECUTE FUNCTION centers.check_membership_change();
REVOKE ALL ON centers.membership_changes FROM PUBLIC;
REVOKE ALL ON FUNCTION centers.check_membership_change() FROM PUBLIC;
GRANT SELECT,INSERT ON centers.membership_changes TO centers_app;
GRANT UPDATE(canceled_at,canceled_by) ON centers.membership_changes TO centers_app;

-- Read-time projection means dates become effective even while background jobs are stopped.
-- Invoker rights preserve the caller's base-table RLS instead of inheriting the view owner.
CREATE VIEW centers.member_profiles WITH (security_invoker=true,security_barrier=true) AS
SELECT m.id,m.center_id,m.account_uid,m.member_number,m.name,m.email,m.phone,m.national_document,
  COALESCE(e.to_state,m.state) AS state,m.state AS base_state,m.joined_on,
  COALESCE(ending.effective_on,m.ends_on) AS ends_on,m.version,m.created_at,m.updated_at,
  (CURRENT_TIMESTAMP AT TIME ZONE c.timezone)::date AS local_today
FROM centers.members m JOIN centers.centers c ON c.id=m.center_id
LEFT JOIN LATERAL (
  SELECT to_state FROM centers.membership_changes h WHERE h.center_id=m.center_id AND h.member_id=m.id
    AND h.canceled_at IS NULL AND h.effective_on<=(CURRENT_TIMESTAMP AT TIME ZONE c.timezone)::date
  ORDER BY h.effective_on DESC,h.sequence DESC LIMIT 1
) e ON true
LEFT JOIN LATERAL (
  SELECT effective_on FROM centers.membership_changes h WHERE h.center_id=m.center_id AND h.member_id=m.id
    AND h.canceled_at IS NULL AND h.action='end' ORDER BY h.sequence DESC LIMIT 1
) ending ON true;
REVOKE ALL ON centers.member_profiles FROM PUBLIC;
GRANT SELECT ON centers.member_profiles TO centers_app;
