-- Pending access is center scoped; credentials remain in the existing account store.
ALTER TABLE centers.member_import_jobs DROP CONSTRAINT member_import_jobs_records_check;
ALTER TABLE centers.member_import_jobs ADD CONSTRAINT member_import_jobs_records_check CHECK(records IS NULL OR jsonb_typeof(records)='array' AND jsonb_array_length(records) BETWEEN 1 AND 1000);

CREATE POLICY center_registration_owner ON centers.centers FOR SELECT TO centers_migrator USING(true);
CREATE FUNCTION centers.registration_center(target text) RETURNS TABLE(id text,name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT c.id,c.name FROM centers.centers c WHERE c.id=target AND c.state='active'
$$;
REVOKE ALL ON FUNCTION centers.registration_center(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION centers.registration_center(text) TO centers_app;

CREATE TABLE centers.activation_requests(
 id text PRIMARY KEY,center_id text NOT NULL REFERENCES centers.centers(id),account_uid text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 member_id text,version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),decided_at timestamptz,decided_by text,
 UNIQUE(center_id,account_uid),FOREIGN KEY(center_id,member_id) REFERENCES centers.members(center_id,id),
 CHECK((status='pending' AND member_id IS NULL AND decided_at IS NULL AND decided_by IS NULL) OR
       (status='approved' AND member_id IS NOT NULL AND decided_at IS NOT NULL AND decided_by IS NOT NULL) OR
       (status='rejected' AND member_id IS NULL AND decided_at IS NOT NULL AND decided_by IS NOT NULL))
);
CREATE INDEX activation_queue ON centers.activation_requests(center_id,status,created_at DESC,id DESC);
ALTER TABLE centers.activation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.activation_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY activation_read ON centers.activation_requests FOR SELECT TO centers_app USING(
 account_uid=centers.actor_uid() OR centers.is_platform() OR (center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY activation_insert ON centers.activation_requests FOR INSERT TO centers_app WITH CHECK(
 account_uid=centers.actor_uid() AND status='pending' AND version=1 AND member_id IS NULL AND
 EXISTS(SELECT 1 FROM centers.registration_center(center_id)));
CREATE POLICY activation_update ON centers.activation_requests FOR UPDATE TO centers_app USING(
 centers.is_platform() OR (center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager']))) WITH CHECK(
 centers.is_platform() OR (center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager'])));
REVOKE ALL ON centers.activation_requests FROM PUBLIC;
GRANT SELECT,INSERT ON centers.activation_requests TO centers_app;
GRANT UPDATE(status,member_id,version,decided_at,decided_by) ON centers.activation_requests TO centers_app;
ALTER TABLE centers.account_references DROP CONSTRAINT account_references_source_check;
ALTER TABLE centers.account_references ADD CONSTRAINT account_references_source_check CHECK(source IN ('role','member','invite','activation'));
CREATE FUNCTION centers.activation_reference() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 DELETE FROM centers.account_references WHERE source='activation' AND record_id=NEW.id;
 IF NEW.status='pending' THEN INSERT INTO centers.account_references(center_id,account_uid,source,record_id) VALUES(NEW.center_id,NEW.account_uid,'activation',NEW.id); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION centers.activation_reference() FROM PUBLIC;
CREATE TRIGGER activation_reference AFTER INSERT OR UPDATE ON centers.activation_requests FOR EACH ROW EXECUTE FUNCTION centers.activation_reference();
