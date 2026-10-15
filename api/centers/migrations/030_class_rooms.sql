ALTER TABLE centers.classes ADD COLUMN room text CHECK(room IS NULL OR length(btrim(room)) BETWEEN 1 AND 120 AND room!~'[[:cntrl:]]');
ALTER TABLE centers.classes ADD COLUMN room_key text GENERATED ALWAYS AS (lower(btrim(regexp_replace(room,'[[:space:]]+',' ','g')))) STORED;
CREATE INDEX class_room_schedule ON centers.classes(center_id,room_key,starts_at,ends_at) WHERE state='scheduled' AND room_key IS NOT NULL;
CREATE FUNCTION centers.check_class_room() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.room IS DISTINCT FROM OLD.room THEN RAISE EXCEPTION 'class room is immutable' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ft-gym-center:'||NEW.center_id));
  IF NEW.room IS NOT NULL AND NEW.state='scheduled' AND EXISTS(
    SELECT 1 FROM centers.classes c WHERE c.center_id=NEW.center_id AND c.state='scheduled'
      AND c.room_key=lower(btrim(regexp_replace(NEW.room,'[[:space:]]+',' ','g')))
      AND c.starts_at<NEW.ends_at AND c.ends_at>NEW.starts_at)
    THEN RAISE EXCEPTION 'class room schedule conflict' USING ERRCODE='23514',CONSTRAINT='class_room_schedule'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION centers.check_class_room() FROM PUBLIC;
CREATE TRIGGER class_room_guard BEFORE INSERT OR UPDATE ON centers.classes FOR EACH ROW EXECUTE FUNCTION centers.check_class_room();
