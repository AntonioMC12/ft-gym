-- Runtime managers can manage trainers, never manager assignments or global privileges.
ALTER TABLE centers.role_assignments ADD CONSTRAINT trainer_has_no_extra_grants
  CHECK(role = 'manager' OR cardinality(extra_capabilities) = 0);
CREATE POLICY trainer_insert ON centers.role_assignments FOR INSERT TO centers_app
  WITH CHECK(role = 'trainer' AND cardinality(extra_capabilities) = 0
    AND center_id = centers.selected_center() AND centers.has_role(center_id, ARRAY['manager']));
CREATE POLICY trainer_update ON centers.role_assignments FOR UPDATE TO centers_app
  USING(role = 'trainer' AND center_id = centers.selected_center() AND centers.has_role(center_id, ARRAY['manager']))
  WITH CHECK(role = 'trainer' AND cardinality(extra_capabilities) = 0
    AND center_id = centers.selected_center() AND centers.has_role(center_id, ARRAY['manager']));

-- The constraint owner reads only center metadata under FORCE RLS. It is not an API role.
CREATE POLICY center_constraint_read ON centers.centers FOR SELECT TO centers_migrator USING(true);
CREATE FUNCTION centers.require_active_manager(target_center text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM centers.centers WHERE id = target_center AND state = 'active')
    AND NOT EXISTS(SELECT 1 FROM centers.role_assignments WHERE center_id = target_center AND role = 'manager'
      AND revoked_at IS NULL AND valid_from <= CURRENT_TIMESTAMP
      AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP)) THEN
    RAISE EXCEPTION 'active center requires a current manager' USING ERRCODE = '23514';
  END IF;
END $$;
CREATE FUNCTION centers.manager_invariant() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog AS $$
BEGIN
  IF TG_ARGV[0] = 'center' THEN
    PERFORM centers.require_active_manager(NEW.id);
  ELSE
    IF TG_OP <> 'INSERT' THEN PERFORM centers.require_active_manager(OLD.center_id); END IF;
    IF TG_OP <> 'DELETE' THEN PERFORM centers.require_active_manager(NEW.center_id); END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER active_manager_center AFTER INSERT OR UPDATE ON centers.centers
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION centers.manager_invariant('center');
CREATE CONSTRAINT TRIGGER active_manager_role AFTER INSERT OR UPDATE OR DELETE ON centers.role_assignments
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION centers.manager_invariant('role');
REVOKE ALL ON FUNCTION centers.require_active_manager(text), centers.manager_invariant() FROM PUBLIC;

CREATE FUNCTION centers.manager_centers_for_account(target_uid text)
  RETURNS TABLE(center_id text, manager_uids text[]) LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog AS $$
  SELECT r.center_id, array_agg(r.account_uid ORDER BY r.account_uid)
    FROM centers.role_assignments r JOIN centers.centers c ON c.id=r.center_id
    WHERE c.state='active' AND r.role='manager' AND r.revoked_at IS NULL
      AND r.valid_from<=CURRENT_TIMESTAMP AND (r.valid_until IS NULL OR r.valid_until>CURRENT_TIMESTAMP)
    GROUP BY r.center_id HAVING bool_or(r.account_uid=target_uid)
$$;
REVOKE ALL ON FUNCTION centers.manager_centers_for_account(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION centers.manager_centers_for_account(text) TO centers_app;
