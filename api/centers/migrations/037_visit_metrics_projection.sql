-- Aggregate-only global projection. Do not broaden runtime access to visit identities.
CREATE POLICY visit_metrics_owner_read ON centers.access_visits FOR SELECT TO centers_migrator
  USING(centers.is_platform() OR center_id=centers.selected_center());
CREATE FUNCTION centers.visit_metrics(target_center text,period_from date,period_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
  IF target_center IS NULL THEN
    IF NOT centers.is_platform() THEN RAISE EXCEPTION 'platform metrics required' USING ERRCODE='42501'; END IF;
  ELSIF target_center IS DISTINCT FROM centers.selected_center() OR NOT (centers.is_platform() OR centers.has_role(target_center,ARRAY['manager'])) THEN
    RAISE EXCEPTION 'selected center metrics required' USING ERRCODE='42501';
  END IF;
  IF period_from IS NULL OR period_to IS NULL OR period_from>period_to OR period_to-period_from>365 THEN
    RAISE EXCEPTION 'bounded metrics period required' USING ERRCODE='22023';
  END IF;
  WITH selected_centers AS(
    SELECT id,timezone,(statement_timestamp() AT TIME ZONE timezone)::date AS today FROM centers.centers WHERE target_center IS NULL OR id=target_center
  ),visits AS(
    SELECT v.center_id,v.member_id,(v.visited_at AT TIME ZONE c.timezone)::date AS day,extract(hour FROM v.visited_at AT TIME ZONE c.timezone)::integer AS hour
    FROM centers.access_visits v JOIN selected_centers c ON c.id=v.center_id
    WHERE v.visited_at>=period_from::timestamp AT TIME ZONE c.timezone
      AND v.visited_at<(least(period_to,c.today)+1)::timestamp AT TIME ZONE c.timezone AND v.visited_at<=statement_timestamp()
  ),days AS(
    SELECT day,count(*)::text AS admissions,count(DISTINCT (center_id,member_id))::text AS memberships FROM visits GROUP BY day
  ),hours AS(
    SELECT h.hour,count(v.hour)::text AS admissions FROM generate_series(0,23)h(hour) LEFT JOIN visits v ON v.hour=h.hour GROUP BY h.hour
  ) SELECT jsonb_build_object(
    'admissions',(SELECT count(*)::text FROM visits),
    'visitingMemberships',(SELECT count(DISTINCT (center_id,member_id))::text FROM visits),
    'memberDays',(SELECT count(DISTINCT (center_id,member_id,day))::text FROM visits),
    'centerDaysWithVisits',(SELECT count(DISTINCT (center_id,day))::text FROM visits),
    'days',(SELECT coalesce(jsonb_agg(jsonb_build_object('date',day::text,'admissions',admissions,'memberships',memberships) ORDER BY day),'[]'::jsonb) FROM days),
    'hours',(SELECT jsonb_agg(jsonb_build_object('hour',hour,'admissions',admissions) ORDER BY hour) FROM hours)
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION centers.visit_metrics(text,date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION centers.visit_metrics(text,date,date) TO centers_app;
