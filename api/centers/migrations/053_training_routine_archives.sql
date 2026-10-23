-- Routine assignment lifecycle is separate from immutable acceptance and workout history.
CREATE TABLE centers.training_routine_archives(
 center_id text NOT NULL,version_id text NOT NULL,member_id text NOT NULL,recipient_uid text NOT NULL,
 routine_id text NOT NULL CHECK(routine_id ~ '^cr_[a-f0-9]{32}$'),
 reason text NOT NULL CHECK(reason IN ('member','platform')),actor_uid text NOT NULL,
 active boolean NOT NULL DEFAULT true,changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(version_id,routine_id,reason),
 FOREIGN KEY(center_id,version_id,member_id,recipient_uid) REFERENCES centers.training_acceptances(center_id,version_id,member_id,recipient_uid));
ALTER TABLE centers.training_routine_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.training_routine_archives FORCE ROW LEVEL SECURITY;
CREATE POLICY training_archive_read ON centers.training_routine_archives FOR SELECT TO centers_app USING(
 centers.training_staff(center_id) OR centers.training_recipient(center_id,member_id,recipient_uid));
CREATE POLICY training_archive_insert ON centers.training_routine_archives FOR INSERT TO centers_app WITH CHECK(
 center_id=centers.selected_center() AND actor_uid=centers.actor_uid() AND
 ((reason='platform' AND active AND centers.is_platform()) OR (reason='member' AND centers.training_recipient(center_id,member_id,recipient_uid))));
CREATE POLICY training_archive_update ON centers.training_routine_archives FOR UPDATE TO centers_app USING(
 reason='member' AND centers.training_recipient(center_id,member_id,recipient_uid)) WITH CHECK(
 reason='member' AND actor_uid=centers.actor_uid() AND centers.training_recipient(center_id,member_id,recipient_uid));
CREATE FUNCTION centers.check_training_archive() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM centers.training_versions v WHERE v.center_id=NEW.center_id AND v.id=NEW.version_id
 AND EXISTS(SELECT 1 FROM jsonb_each_text(v.routine_ids) e WHERE e.value=NEW.routine_id)) THEN
 RAISE EXCEPTION 'routine does not belong to accepted version' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_archive_scope BEFORE INSERT OR UPDATE ON centers.training_routine_archives FOR EACH ROW EXECUTE FUNCTION centers.check_training_archive();
CREATE POLICY training_lifecycle_audit ON centers.business_audit FOR INSERT TO centers_app WITH CHECK(
 center_id=centers.selected_center() AND actor_uid=centers.actor_uid() AND action='training.lifecycle'
 AND EXISTS(SELECT 1 FROM centers.training_acceptances a WHERE a.center_id=business_audit.center_id AND a.version_id=business_audit.target_id AND centers.training_recipient(a.center_id,a.member_id,a.recipient_uid)));
REVOKE ALL ON centers.training_routine_archives FROM PUBLIC;
REVOKE ALL ON FUNCTION centers.check_training_archive() FROM PUBLIC;
GRANT SELECT,INSERT ON centers.training_routine_archives TO centers_app;
GRANT UPDATE(active,changed_at) ON centers.training_routine_archives TO centers_app;
