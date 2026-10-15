-- Keyset rotation lets a failing or busy center yield to later centers.
CREATE INDEX member_import_expiry_center ON centers.member_import_jobs(center_id,expires_at,id) WHERE state='prepared';
CREATE FUNCTION centers.expired_import_centers(max_centers integer,after_center text)
RETURNS TABLE(center_id text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NOT centers.is_platform() THEN RAISE EXCEPTION 'platform maintenance context required' USING ERRCODE='42501'; END IF;
  IF max_centers IS NULL OR max_centers NOT BETWEEN 1 AND 20 OR length(after_center)>64
    THEN RAISE EXCEPTION 'invalid maintenance bound' USING ERRCODE='22023'; END IF;
  RETURN QUERY SELECT DISTINCT m.center_id FROM centers.member_import_jobs m
    WHERE m.state='prepared' AND m.expires_at<=statement_timestamp() AND (after_center IS NULL OR m.center_id>after_center)
    ORDER BY m.center_id LIMIT max_centers;
END $$;
REVOKE ALL ON FUNCTION centers.expired_import_centers(integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION centers.expired_import_centers(integer,text) TO centers_app;
