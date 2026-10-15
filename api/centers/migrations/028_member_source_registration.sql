-- Historical CSV information, separate from operational identity and consent.
-- Existing member RLS continues to protect these private administrative fields.
CREATE FUNCTION centers.valid_source_registration(value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT jsonb_typeof(value)='object' AND octet_length(value::text)<=80000
    AND value-ARRAY['subscriberNumber','address','birthDate','submittedAt','conditionsText','conditionsResponse']='{}'::jsonb
    AND NOT EXISTS(SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(value)='object' THEN value ELSE '{}'::jsonb END) e
      WHERE jsonb_typeof(e.value) NOT IN ('string','null'))
$$;
REVOKE ALL ON FUNCTION centers.valid_source_registration(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION centers.valid_source_registration(jsonb) TO centers_app;
ALTER TABLE centers.members ADD COLUMN source_registration jsonb
  CHECK(source_registration IS NULL OR centers.valid_source_registration(source_registration));

CREATE OR REPLACE VIEW centers.member_profiles WITH (security_invoker=true,security_barrier=true) AS
SELECT m.id,m.center_id,m.account_uid,m.member_number,m.name,m.email,m.phone,m.national_document,
  coalesce(e.to_state,m.state) AS state,m.state AS base_state,m.joined_on,
  coalesce(ending.effective_on,m.ends_on) AS ends_on,m.version,m.created_at,m.updated_at,
  (statement_timestamp() AT TIME ZONE c.timezone)::date AS local_today,m.source_registration
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
