-- Finite weekly batches, explicitly reviewed. No background recurrence worker.
CREATE TABLE centers.class_series(
  id text PRIMARY KEY CHECK(id ~ '^cs_[a-f0-9]{32}$'),center_id text NOT NULL REFERENCES centers.centers(id),
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),timezone text NOT NULL,
  total integer NOT NULL CHECK(total BETWEEN 1 AND 25),definition jsonb NOT NULL CHECK(jsonb_typeof(definition)='object' AND octet_length(definition::text)<=16384),
  actor_uid text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(center_id,id)
);
ALTER TABLE centers.class_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.class_series FORCE ROW LEVEL SECURITY;
CREATE POLICY class_series_read ON centers.class_series FOR SELECT TO centers_app USING(center_id=centers.selected_center() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY class_series_insert ON centers.class_series FOR INSERT TO centers_app WITH CHECK(center_id=centers.selected_center() AND actor_uid=centers.actor_uid() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY class_series_owner_read ON centers.class_series FOR SELECT TO centers_migrator USING(center_id=centers.selected_center());
CREATE INDEX class_series_page ON centers.class_series(center_id,created_at DESC,id DESC);
GRANT SELECT ON centers.class_series TO centers_app;
GRANT INSERT(id,center_id,name,timezone,total,definition,actor_uid) ON centers.class_series TO centers_app;
ALTER TABLE centers.classes ADD COLUMN series_id text,ADD COLUMN series_position integer;
ALTER TABLE centers.classes ADD CONSTRAINT class_series_member FOREIGN KEY(center_id,series_id) REFERENCES centers.class_series(center_id,id);
ALTER TABLE centers.classes ADD CONSTRAINT class_series_position CHECK(series_id IS NULL AND series_position IS NULL OR series_id IS NOT NULL AND series_position IS NOT NULL AND series_position BETWEEN 1 AND 25);
ALTER TABLE centers.classes ADD CONSTRAINT class_series_order UNIQUE(center_id,series_id,series_position);
ALTER TABLE centers.classes ADD CONSTRAINT class_series_date UNIQUE(center_id,series_id,class_on);
GRANT INSERT(series_id,series_position) ON centers.classes TO centers_app;
CREATE FUNCTION centers.check_class_series_link() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE expected integer;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF (NEW.series_id,NEW.series_position) IS DISTINCT FROM (OLD.series_id,OLD.series_position) THEN RAISE EXCEPTION 'series membership is immutable' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.series_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.center_id IS DISTINCT FROM centers.selected_center() THEN RAISE EXCEPTION 'selected center required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ft-gym-center:'||NEW.center_id));
  SELECT total INTO expected FROM centers.class_series WHERE center_id=NEW.center_id AND id=NEW.series_id;
  IF expected IS NULL OR NEW.series_position>expected OR NEW.starts_at<=clock_timestamp()
    THEN RAISE EXCEPTION 'class series review changed' USING ERRCODE='23514',CONSTRAINT='class_series_review'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION centers.check_class_series_link() FROM PUBLIC;
CREATE TRIGGER class_series_link_guard BEFORE INSERT OR UPDATE ON centers.classes FOR EACH ROW EXECUTE FUNCTION centers.check_class_series_link();
CREATE FUNCTION centers.require_complete_class_series() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target text; expected integer; actual integer;
BEGIN
  IF TG_TABLE_NAME='class_series' THEN target=NEW.id; ELSE target=NEW.series_id; END IF;
  IF target IS NULL THEN RETURN NULL; END IF;
  IF NEW.center_id IS DISTINCT FROM centers.selected_center() THEN RAISE EXCEPTION 'selected center required' USING ERRCODE='42501'; END IF;
  SELECT total INTO expected FROM centers.class_series WHERE center_id=NEW.center_id AND id=target;
  SELECT count(*) INTO actual FROM centers.classes WHERE center_id=NEW.center_id AND series_id=target;
  IF expected IS NULL OR actual<>expected THEN RAISE EXCEPTION 'class series must be complete' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION centers.require_complete_class_series() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER class_series_complete AFTER INSERT ON centers.class_series DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION centers.require_complete_class_series();
CREATE CONSTRAINT TRIGGER class_series_members_complete AFTER INSERT ON centers.classes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION centers.require_complete_class_series();
