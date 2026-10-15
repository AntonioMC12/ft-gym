-- Role validity follows the permission-check statement after lock acquisition,
-- rather than a transaction timestamp captured before the request queued.
CREATE OR REPLACE FUNCTION centers.has_role(target_center text,roles text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM centers.role_assignments r WHERE r.center_id=target_center AND r.account_uid=centers.actor_uid()
    AND r.role=ANY(roles) AND r.revoked_at IS NULL AND r.valid_from<=statement_timestamp()
    AND (r.valid_until IS NULL OR r.valid_until>statement_timestamp()))
$$;
CREATE OR REPLACE FUNCTION centers.lock_my_roles(target_center text) RETURNS SETOF text LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path=pg_catalog AS $$
  SELECT r.id FROM centers.role_assignments r WHERE r.center_id=target_center AND r.account_uid=centers.actor_uid()
    AND r.revoked_at IS NULL AND r.valid_from<=statement_timestamp() AND (r.valid_until IS NULL OR r.valid_until>statement_timestamp()) FOR SHARE
$$;
CREATE OR REPLACE FUNCTION centers.require_active_manager(target_center text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
  SET search_path=pg_catalog AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM centers.centers WHERE id=target_center AND state='active')
    AND NOT EXISTS(SELECT 1 FROM centers.role_assignments WHERE center_id=target_center AND role='manager'
      AND revoked_at IS NULL AND valid_from<=statement_timestamp() AND (valid_until IS NULL OR valid_until>statement_timestamp())) THEN
    RAISE EXCEPTION 'active center requires a current manager' USING ERRCODE='23514';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION centers.manager_centers_for_account(target_uid text)
  RETURNS TABLE(center_id text,manager_uids text[]) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT r.center_id,array_agg(r.account_uid ORDER BY r.account_uid) FROM centers.role_assignments r JOIN centers.centers c ON c.id=r.center_id
    WHERE c.state='active' AND r.role='manager' AND r.revoked_at IS NULL
      AND r.valid_from<=statement_timestamp() AND (r.valid_until IS NULL OR r.valid_until>statement_timestamp())
    GROUP BY r.center_id HAVING bool_or(r.account_uid=target_uid)
$$;
CREATE OR REPLACE FUNCTION centers.can_refund(target_center text) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
  SELECT target_center=centers.selected_center() AND EXISTS(SELECT 1 FROM centers.role_assignments r
    WHERE r.center_id=target_center AND r.account_uid=centers.actor_uid() AND r.role='manager'
      AND 'payments.refund'=ANY(r.extra_capabilities) AND r.revoked_at IS NULL
      AND r.valid_from<=statement_timestamp() AND (r.valid_until IS NULL OR r.valid_until>statement_timestamp()))
$$;
