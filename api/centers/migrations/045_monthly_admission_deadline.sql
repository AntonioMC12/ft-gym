-- QR admission checks the same monthly deadline, preserving explicit pass admission and holds.
CREATE OR REPLACE FUNCTION centers.access_decision(target_center text, target_member text, at_time timestamp with time zone, selected_pass text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE policy centers.access_policies; center_row centers.centers; member_row record; local_time timestamp; local_day date;
  intervals jsonb; pair jsonb; from_min integer; to_min integer; last_end integer=0; current_min integer; opened boolean=false;
BEGIN
  IF target_center IS DISTINCT FROM centers.selected_center() THEN RETURN 'not-configured'; END IF;
  SELECT * INTO policy FROM centers.access_policies p WHERE p.center_id=target_center;
  IF policy.center_id IS NULL OR NOT policy.enabled THEN RETURN 'not-configured'; END IF;
  SELECT * INTO center_row FROM centers.centers c WHERE c.id=target_center;
  IF center_row.id IS NULL OR center_row.state<>'active' THEN RETURN 'center-inactive'; END IF;
  local_time=at_time AT TIME ZONE center_row.timezone;local_day=local_time::date;current_min=extract(hour FROM local_time)::integer*60+extract(minute FROM local_time)::integer;
  -- Resolve dated changes at this validation instant, not transaction-start now():
  -- a queued reception transaction may have crossed the center's local midnight.
  SELECT m.id,m.joined_on,coalesce(e.to_state,m.state) AS state,coalesce(ending.effective_on,m.ends_on) AS ends_on INTO member_row
    FROM centers.members m
    LEFT JOIN LATERAL(SELECT to_state FROM centers.membership_changes h WHERE h.center_id=m.center_id AND h.member_id=m.id AND h.canceled_at IS NULL AND h.effective_on<=local_day ORDER BY h.effective_on DESC,h.sequence DESC LIMIT 1) e ON true
    LEFT JOIN LATERAL(SELECT effective_on FROM centers.membership_changes h WHERE h.center_id=m.center_id AND h.member_id=m.id AND h.canceled_at IS NULL AND h.action='end' ORDER BY h.sequence DESC LIMIT 1) ending ON true
    WHERE m.center_id=target_center AND m.id=target_member;
  IF member_row.id IS NULL OR member_row.state<>'active' OR member_row.joined_on>local_day OR (member_row.ends_on IS NOT NULL AND member_row.ends_on<=local_day) THEN RETURN 'membership-inactive'; END IF;
  IF EXISTS(SELECT 1 FROM centers.access_holds h WHERE h.center_id=target_center AND h.member_id=target_member AND h.released_at IS NULL) THEN RETURN 'manual-hold'; END IF;
  intervals=center_row.opening_hours->extract(dow FROM local_time)::integer::text;
  IF jsonb_typeof(intervals) IS DISTINCT FROM 'array' THEN RETURN 'closed'; END IF;
  IF jsonb_array_length(intervals)>4 THEN RETURN 'closed'; END IF;
  FOR pair IN SELECT value FROM jsonb_array_elements(intervals) LOOP
    IF jsonb_typeof(pair) IS DISTINCT FROM 'array' THEN RETURN 'closed'; END IF;
    IF jsonb_array_length(pair)<>2 OR NOT coalesce((pair->>0) ~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$',false)
      OR NOT coalesce((pair->>1) ~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$',false) THEN RETURN 'closed'; END IF;
    from_min=split_part(pair->>0,':',1)::integer*60+split_part(pair->>0,':',2)::integer;
    to_min=split_part(pair->>1,':',1)::integer*60+split_part(pair->>1,':',2)::integer;
    IF from_min<last_end OR from_min>=to_min THEN RETURN 'closed'; END IF;
    IF current_min>=from_min AND current_min<to_min THEN opened=true; END IF;last_end=to_min;
  END LOOP;
  IF NOT opened THEN RETURN 'closed'; END IF;
  IF selected_pass IS NOT NULL AND (NOT policy.allow_passes OR NOT centers.pass_available(target_center,target_member,selected_pass,local_day)) THEN RETURN 'pass-unavailable'; END IF;
  IF selected_pass IS NULL AND policy.require_subscription AND NOT EXISTS(SELECT 1 FROM centers.subscriptions s JOIN centers.membership_plan_versions v ON (v.center_id,v.id)=(s.center_id,s.price_version_id)
    WHERE s.center_id=target_center AND s.member_id=target_member AND s.canceled_at IS NULL AND s.starts_on<=local_day AND (s.ends_on IS NULL OR s.ends_on>local_day)
    AND (v.interval_months<>1 OR local_day<=(greatest(date_trunc('month',s.starts_on)::date,
      (SELECT max(date_trunc('month',r.period_start)::date) FROM centers.receipts r WHERE r.center_id=s.center_id AND r.member_id=s.member_id AND r.subscription_id=s.id AND r.period_start<=local_day
        AND r.total_minor=coalesce((SELECT sum(a.amount_minor) FROM centers.payment_allocations a WHERE a.center_id=r.center_id AND a.receipt_id=r.id),0)-coalesce((SELECT sum(f.amount_minor) FROM centers.refunds f WHERE f.center_id=r.center_id AND f.receipt_id=r.id),0)),
      (SELECT max(date_trunc('month',n.period_start)::date) FROM centers.renewals n WHERE n.center_id=s.center_id AND n.member_id=s.member_id AND n.subscription_id=s.id AND n.receipt_id IS NULL AND n.period_start<=local_day)
    )+interval '1 month'+interval '4 days')::date)) THEN RETURN 'no-current-subscription'; END IF;
  IF policy.deny_overdue AND EXISTS(SELECT 1 FROM centers.receipts r WHERE r.center_id=target_center AND r.member_id=target_member AND r.due_on<local_day-policy.grace_days
    AND r.total_minor-coalesce((SELECT sum(a.amount_minor) FROM centers.payment_allocations a WHERE a.center_id=r.center_id AND a.receipt_id=r.id),0)
      +coalesce((SELECT sum(f.amount_minor) FROM centers.refunds f WHERE f.center_id=r.center_id AND f.receipt_id=r.id),0)>0) THEN RETURN 'account-review'; END IF;
  RETURN 'allowed';
END $function$;
