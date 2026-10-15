ALTER TABLE centers.classes ADD COLUMN instructor_assignment_id text;
ALTER TABLE centers.classes ADD COLUMN instructor_uid text;
ALTER TABLE centers.classes ADD COLUMN instructor_name text CHECK(instructor_name IS NULL OR length(btrim(instructor_name)) BETWEEN 1 AND 120 AND instructor_name!~'[[:cntrl:]]');
ALTER TABLE centers.classes ADD CONSTRAINT class_instructor_role FOREIGN KEY(center_id,instructor_assignment_id) REFERENCES centers.role_assignments(center_id,id);
ALTER TABLE centers.classes ADD CONSTRAINT class_instructor_snapshot CHECK(
  instructor_assignment_id IS NULL AND instructor_uid IS NULL AND instructor_name IS NULL
  OR instructor_assignment_id IS NOT NULL AND instructor_uid IS NOT NULL AND instructor_name IS NOT NULL);
CREATE INDEX class_instructor_schedule ON centers.classes(center_id,instructor_uid,starts_at,ends_at) WHERE state='scheduled' AND instructor_uid IS NOT NULL;
GRANT INSERT(instructor_assignment_id,instructor_name) ON centers.classes TO centers_app;
CREATE FUNCTION centers.check_class_instructor() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE assignment centers.role_assignments;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF (NEW.instructor_assignment_id,NEW.instructor_uid,NEW.instructor_name) IS DISTINCT FROM (OLD.instructor_assignment_id,OLD.instructor_uid,OLD.instructor_name)
      THEN RAISE EXCEPTION 'class instructor is immutable' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.instructor_assignment_id IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ft-gym-center:'||NEW.center_id));
  SELECT * INTO assignment FROM centers.role_assignments WHERE center_id=NEW.center_id AND id=NEW.instructor_assignment_id FOR SHARE;
  IF assignment.id IS NULL OR assignment.revoked_at IS NOT NULL OR assignment.valid_from>clock_timestamp()
    OR assignment.valid_until IS NOT NULL AND assignment.valid_until<NEW.ends_at
    THEN RAISE EXCEPTION 'instructor assignment unavailable' USING ERRCODE='23514',CONSTRAINT='class_instructor_available'; END IF;
  NEW.instructor_uid=assignment.account_uid;
  IF NEW.state='scheduled' AND EXISTS(SELECT 1 FROM centers.classes c WHERE c.center_id=NEW.center_id AND c.instructor_uid=NEW.instructor_uid
    AND c.state='scheduled' AND c.starts_at<NEW.ends_at AND c.ends_at>NEW.starts_at)
    THEN RAISE EXCEPTION 'instructor schedule conflict' USING ERRCODE='23514',CONSTRAINT='class_instructor_schedule'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION centers.check_class_instructor() FROM PUBLIC;
CREATE TRIGGER class_instructor_guard BEFORE INSERT OR UPDATE ON centers.classes FOR EACH ROW EXECUTE FUNCTION centers.check_class_instructor();
