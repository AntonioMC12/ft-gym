-- Business dates follow the statement after lock acquisition, not BEGIN time.
-- Read projections stay consistent within one statement; row-trigger decisions
-- read the actual clock after the row/plan lock has been obtained.
CREATE OR REPLACE VIEW centers.member_profiles WITH (security_invoker=true,security_barrier=true) AS
SELECT m.id,m.center_id,m.account_uid,m.member_number,m.name,m.email,m.phone,m.national_document,
  coalesce(e.to_state,m.state) AS state,m.state AS base_state,m.joined_on,
  coalesce(ending.effective_on,m.ends_on) AS ends_on,m.version,m.created_at,m.updated_at,
  (statement_timestamp() AT TIME ZONE c.timezone)::date AS local_today
FROM centers.members m JOIN centers.centers c ON c.id=m.center_id
LEFT JOIN LATERAL (
  SELECT to_state FROM centers.membership_changes h WHERE h.center_id=m.center_id AND h.member_id=m.id
    AND h.canceled_at IS NULL AND h.effective_on<=(statement_timestamp() AT TIME ZONE c.timezone)::date
  ORDER BY h.effective_on DESC,h.sequence DESC LIMIT 1
) e ON true
LEFT JOIN LATERAL (
  SELECT effective_on FROM centers.membership_changes h WHERE h.center_id=m.center_id AND h.member_id=m.id
    AND h.canceled_at IS NULL AND h.action='end' ORDER BY h.sequence DESC LIMIT 1
) ending ON true;

CREATE OR REPLACE FUNCTION centers.check_membership_change() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE local_day date; parent centers.membership_changes;
BEGIN
  SELECT (clock_timestamp() AT TIME ZONE timezone)::date INTO local_day FROM centers.centers WHERE id=NEW.center_id;
  IF TG_OP='UPDATE' THEN
    IF OLD.canceled_at IS NOT NULL OR NEW.canceled_at IS NULL OR OLD.effective_on<=local_day THEN
      RAISE EXCEPTION 'only future unapplied changes can be canceled' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.parent_id IS NOT NULL THEN
    SELECT * INTO parent FROM centers.membership_changes WHERE center_id=NEW.center_id AND member_id=NEW.member_id AND id=NEW.parent_id;
    IF parent.id IS NULL OR parent.action<>'freeze' OR parent.parent_id IS NOT NULL OR parent.resume_on IS DISTINCT FROM NEW.effective_on OR parent.canceled_at IS NOT NULL
      THEN RAISE EXCEPTION 'invalid automatic resumption relation' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION centers.check_subscription() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE local_day date; plan_record record;
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT p.archived_at,p.current_revision,v.revision INTO plan_record FROM centers.membership_plans p
      JOIN centers.membership_plan_versions v ON (v.center_id,v.plan_id)=(p.center_id,p.id)
      WHERE p.center_id=NEW.center_id AND p.id=NEW.plan_id AND v.id=NEW.price_version_id FOR SHARE OF p;
    IF plan_record.revision IS NULL OR plan_record.archived_at IS NOT NULL OR plan_record.revision<>plan_record.current_revision
      THEN RAISE EXCEPTION 'new subscriptions require an active current price version' USING ERRCODE='23514'; END IF;
    SELECT (clock_timestamp() AT TIME ZONE timezone)::date INTO local_day FROM centers.centers WHERE id=NEW.center_id;
    IF NEW.starts_on<local_day THEN RAISE EXCEPTION 'retroactive subscription' USING ERRCODE='23514'; END IF;
  ELSE
    SELECT (clock_timestamp() AT TIME ZONE timezone)::date INTO local_day FROM centers.centers WHERE id=NEW.center_id;
    IF OLD.canceled_at IS NOT NULL THEN RAISE EXCEPTION 'canceled subscription immutable' USING ERRCODE='23514'; END IF;
    IF NEW.canceled_at IS NOT NULL AND (OLD.starts_on<=local_day OR NEW.canceled_by IS DISTINCT FROM centers.actor_uid())
      THEN RAISE EXCEPTION 'only future subscriptions can be canceled' USING ERRCODE='23514'; END IF;
    IF NEW.ends_on IS DISTINCT FROM OLD.ends_on AND ((OLD.ends_on IS NOT NULL AND OLD.ends_on<=local_day) OR (NEW.ends_on IS NOT NULL AND NEW.ends_on<local_day))
      THEN RAISE EXCEPTION 'historical periods immutable' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
