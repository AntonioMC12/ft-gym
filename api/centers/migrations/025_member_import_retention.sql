-- Keep replay metadata; remove personal review payloads after their existing 24h TTL.
ALTER TABLE centers.member_import_jobs DROP CONSTRAINT member_import_jobs_state_check;
ALTER TABLE centers.member_import_jobs ADD CONSTRAINT member_import_jobs_state_check CHECK(state IN ('prepared','completed','expired'));
ALTER TABLE centers.member_import_jobs DROP CONSTRAINT member_import_jobs_check1;
ALTER TABLE centers.member_import_jobs ADD CONSTRAINT member_import_payload_state CHECK(
  state='prepared' AND records IS NOT NULL AND result IS NULL AND review_hash IS NULL AND completed_at IS NULL
  OR state='completed' AND records IS NULL AND result IS NOT NULL AND review_hash IS NOT NULL AND completed_at IS NOT NULL
  OR state='expired' AND records IS NULL AND result IS NULL AND review_hash IS NULL AND completed_at IS NULL);
CREATE INDEX member_import_expiry ON centers.member_import_jobs(expires_at,center_id,id) WHERE state='prepared';
CREATE OR REPLACE FUNCTION centers.check_member_import_completion() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ft-gym-center:'||NEW.center_id));
  IF OLD.state<>'prepared' OR NEW.records IS NOT NULL THEN RAISE EXCEPTION 'invalid member import transition' USING ERRCODE='23514'; END IF;
  IF NEW.state='expired' AND OLD.expires_at<=clock_timestamp() AND NEW.result IS NULL AND NEW.review_hash IS NULL AND NEW.completed_at IS NULL THEN RETURN NEW; END IF;
  IF NEW.state<>'completed' OR OLD.expires_at<=clock_timestamp() OR NEW.result IS NULL OR NEW.review_hash IS NULL
    THEN RAISE EXCEPTION 'invalid member import transition' USING ERRCODE='23514'; END IF;
  NEW.completed_at=clock_timestamp();RETURN NEW;
END $$;
-- The owner can touch payloads only from the narrow SECURITY DEFINER functions.
CREATE POLICY import_retention_owner_read ON centers.member_import_jobs FOR SELECT TO centers_migrator USING(centers.is_platform());
CREATE POLICY import_retention_owner_update ON centers.member_import_jobs FOR UPDATE TO centers_migrator USING(centers.is_platform()) WITH CHECK(centers.is_platform());
CREATE FUNCTION centers.expired_import_centers(max_centers integer) RETURNS TABLE(center_id text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NOT centers.is_platform() THEN RAISE EXCEPTION 'platform maintenance context required' USING ERRCODE='42501'; END IF;
  IF max_centers IS NULL OR max_centers NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'invalid maintenance bound' USING ERRCODE='22023'; END IF;
  RETURN QUERY SELECT j.center_id FROM (SELECT m.center_id,m.expires_at FROM centers.member_import_jobs m
    WHERE m.state='prepared' AND m.expires_at<=statement_timestamp() ORDER BY m.expires_at,m.center_id,m.id LIMIT max_centers*100)j
    GROUP BY j.center_id ORDER BY min(j.expires_at),j.center_id LIMIT max_centers;
END $$;
CREATE FUNCTION centers.expire_member_imports(target_center text,max_jobs integer) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE affected integer;
BEGIN
  IF NOT centers.is_platform() OR target_center IS DISTINCT FROM centers.selected_center()
    THEN RAISE EXCEPTION 'selected platform maintenance context required' USING ERRCODE='42501'; END IF;
  IF max_jobs IS NULL OR max_jobs NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'invalid maintenance bound' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ft-gym-center:'||target_center));
  UPDATE centers.member_import_jobs SET state='expired',records=NULL WHERE center_id=target_center AND id IN(
    SELECT j.id FROM centers.member_import_jobs j WHERE j.center_id=target_center AND j.state='prepared' AND j.expires_at<=clock_timestamp()
    ORDER BY j.expires_at,j.id LIMIT max_jobs FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS affected=ROW_COUNT;RETURN affected;
END $$;
REVOKE ALL ON FUNCTION centers.expired_import_centers(integer),centers.expire_member_imports(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION centers.expired_import_centers(integer),centers.expire_member_imports(text,integer) TO centers_app;
