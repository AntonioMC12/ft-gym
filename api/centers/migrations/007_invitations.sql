CREATE TABLE centers.invitations (
  id text PRIMARY KEY CHECK(id ~ '^[a-zA-Z0-9_-]{1,64}$'),
  center_id text NOT NULL REFERENCES centers.centers(id),
  kind text NOT NULL CHECK(kind IN ('member','manager','trainer')),
  member_id text, account_uid text NOT NULL, issuer_uid text NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','revoked')),
  expires_at timestamptz NOT NULL, accepted_at timestamptz, revoked_at timestamptz,
  target_record_id text, version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(center_id,member_id) REFERENCES centers.members(center_id,id),
  CHECK((kind='member')=(member_id IS NOT NULL)),
  CHECK((status='accepted')=(accepted_at IS NOT NULL)),
  CHECK((status='revoked')=(revoked_at IS NOT NULL)),
  CHECK(status<>'accepted' OR target_record_id IS NOT NULL),
  CHECK(expires_at>created_at)
);
CREATE UNIQUE INDEX pending_member_invitation ON centers.invitations(center_id,member_id) WHERE status='pending' AND kind='member';
CREATE UNIQUE INDEX pending_staff_invitation ON centers.invitations(center_id,account_uid,kind) WHERE status='pending' AND kind<>'member';
CREATE INDEX invitation_target ON centers.invitations(account_uid,status);
ALTER TABLE centers.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY invitations_read ON centers.invitations FOR SELECT TO centers_app USING(
  centers.is_platform() OR account_uid=centers.actor_uid() OR
  (center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager']))
);
CREATE POLICY invitations_insert ON centers.invitations FOR INSERT TO centers_app WITH CHECK(
  issuer_uid=centers.actor_uid() AND (centers.is_platform() OR
    (kind IN ('member','trainer') AND center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager'])))
);
CREATE POLICY invitations_update ON centers.invitations FOR UPDATE TO centers_app USING(
  centers.is_platform() OR (kind IN ('member','trainer') AND center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager']))
) WITH CHECK(centers.is_platform() OR
  (kind IN ('member','trainer') AND center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager'])));
-- Trusted migration owner reads only to support the narrow reference-check function below.
CREATE POLICY invitations_reference_owner ON centers.invitations FOR SELECT TO centers_migrator USING(true);
REVOKE ALL ON centers.invitations FROM PUBLIC;
GRANT SELECT,INSERT ON centers.invitations TO centers_app;
GRANT UPDATE(status,accepted_at,revoked_at,target_record_id,version) ON centers.invitations TO centers_app;

ALTER TABLE centers.account_references DROP CONSTRAINT account_references_source_check;
ALTER TABLE centers.account_references ADD CONSTRAINT account_references_source_check CHECK(source IN ('role','member','invite'));
CREATE TRIGGER invitation_reference AFTER INSERT OR UPDATE ON centers.invitations
  FOR EACH ROW EXECUTE FUNCTION centers.track_account_reference('invite');
CREATE OR REPLACE FUNCTION centers.has_account_references(target_uid text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM centers.account_references r WHERE r.account_uid=target_uid AND
    (r.source<>'invite' OR EXISTS(SELECT 1 FROM centers.invitations i WHERE i.id=r.record_id
      AND i.status='pending' AND i.expires_at>statement_timestamp())))
$$;
