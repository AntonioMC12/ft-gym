-- Row locking a manager assignment must not require runtime UPDATE on managers.
-- This trigger alone uses owner authority; runtime role-write permissions stay intact.
CREATE OR REPLACE FUNCTION centers.check_class_instructor() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE assignment centers.role_assignments;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF (NEW.instructor_assignment_id,NEW.instructor_uid,NEW.instructor_name) IS DISTINCT FROM (OLD.instructor_assignment_id,OLD.instructor_uid,OLD.instructor_name)
      THEN RAISE EXCEPTION 'class instructor is immutable' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.instructor_assignment_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.center_id IS DISTINCT FROM centers.selected_center() THEN RAISE EXCEPTION 'selected center required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ft-gym-center:'||NEW.center_id));
  IF NOT (centers.is_platform() OR centers.has_role(NEW.center_id,ARRAY['manager'])) THEN RAISE EXCEPTION 'class management required' USING ERRCODE='42501'; END IF;
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
