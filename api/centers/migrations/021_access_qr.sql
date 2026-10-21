-- Online access, opt-in per center. No door hardware or offline grant is implied.
CREATE TABLE centers.access_policies(
  center_id text PRIMARY KEY REFERENCES centers.centers(id),enabled boolean NOT NULL DEFAULT false,
  require_subscription boolean NOT NULL DEFAULT true,deny_overdue boolean NOT NULL DEFAULT false,
  grace_days integer NOT NULL DEFAULT 15 CHECK(grace_days BETWEEN 0 AND 365),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),actor_uid text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE centers.access_devices(
  id text PRIMARY KEY CHECK(id ~ '^ad_[a-f0-9]{32}$'),center_id text NOT NULL REFERENCES centers.centers(id),
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 80),key_hash text NOT NULL CHECK(key_hash ~ '^[a-f0-9]{64}$'),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),actor_uid text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),rotated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,revoked_at timestamptz,
  UNIQUE(center_id,id),CHECK(expires_at>rotated_at AND expires_at<=rotated_at+interval '30 days'),
  CHECK(rotated_at>=created_at),CHECK(revoked_at IS NULL OR revoked_at>=created_at));
CREATE TABLE centers.access_holds(
  id text PRIMARY KEY CHECK(id ~ '^ah_[a-f0-9]{32}$'),center_id text NOT NULL,member_id text NOT NULL,
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 250),actor_uid text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1 CHECK(version>0),released_at timestamptz,released_by text,
  UNIQUE(center_id,id),FOREIGN KEY(center_id,member_id) REFERENCES centers.members(center_id,id),
  CHECK((released_at IS NULL)=(released_by IS NULL)),CHECK(released_at IS NULL OR released_at>=created_at));
CREATE UNIQUE INDEX access_one_manual_hold ON centers.access_holds(center_id,member_id) WHERE released_at IS NULL;
CREATE TABLE centers.access_tokens(
  id text PRIMARY KEY CHECK(id ~ '^at_[a-f0-9]{32}$'),center_id text NOT NULL,member_id text NOT NULL,account_uid text NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  issued_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,consumed_at timestamptz,consumed_device_id text,invalidated_at timestamptz,
  UNIQUE(center_id,id,member_id,account_uid),FOREIGN KEY(center_id,member_id) REFERENCES centers.members(center_id,id),
  FOREIGN KEY(center_id,consumed_device_id) REFERENCES centers.access_devices(center_id,id),
  CHECK(expires_at=issued_at+interval '45 seconds'),CHECK((consumed_at IS NULL)=(consumed_device_id IS NULL)),
  CHECK(consumed_at IS NULL OR (consumed_at>=issued_at AND consumed_at<expires_at)),CHECK(invalidated_at IS NULL OR invalidated_at>=issued_at));
CREATE UNIQUE INDEX access_one_live_token ON centers.access_tokens(center_id,member_id) WHERE consumed_at IS NULL AND invalidated_at IS NULL;
CREATE INDEX access_token_rate ON centers.access_tokens(center_id,account_uid,issued_at DESC);
CREATE TABLE centers.access_visits(
  id text PRIMARY KEY CHECK(id ~ '^av_[a-f0-9]{32}$'),center_id text NOT NULL,member_id text NOT NULL,account_uid text NOT NULL,
  token_id text NOT NULL UNIQUE,device_id text NOT NULL,operator_uid text NOT NULL,visited_at timestamptz NOT NULL,
  UNIQUE(center_id,id),FOREIGN KEY(center_id,token_id,member_id,account_uid) REFERENCES centers.access_tokens(center_id,id,member_id,account_uid),
  FOREIGN KEY(center_id,device_id) REFERENCES centers.access_devices(center_id,id));
CREATE INDEX access_visit_member ON centers.access_visits(center_id,member_id,visited_at DESC,id DESC);
CREATE TABLE centers.access_scans(
  center_id text NOT NULL,device_id text NOT NULL,operator_uid text NOT NULL,request_id text NOT NULL CHECK(request_id ~ '^[a-zA-Z0-9_-]{8,128}$'),
  body_hash text NOT NULL CHECK(body_hash ~ '^[a-f0-9]{64}$'),result text NOT NULL CHECK(result IN ('admitted','denied','used','expired','unknown')),
  visit_id text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(center_id,device_id,operator_uid,request_id),
  FOREIGN KEY(center_id,device_id) REFERENCES centers.access_devices(center_id,id),FOREIGN KEY(center_id,visit_id) REFERENCES centers.access_visits(center_id,id),
  CHECK((result='admitted')=(visit_id IS NOT NULL)));
CREATE INDEX access_scan_rate ON centers.access_scans(center_id,device_id,created_at DESC);

CREATE FUNCTION centers.access_staff(target_center text) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
  SELECT target_center=centers.selected_center() AND (centers.is_platform() OR centers.has_role(target_center,ARRAY['manager'])) $$;
ALTER TABLE centers.access_policies ENABLE ROW LEVEL SECURITY;ALTER TABLE centers.access_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY access_policy_read ON centers.access_policies FOR SELECT TO centers_app USING(
  centers.access_staff(center_id) OR (center_id=centers.selected_center() AND EXISTS(SELECT 1 FROM centers.members m WHERE m.center_id=access_policies.center_id AND m.account_uid=centers.actor_uid())));
CREATE POLICY access_policy_insert ON centers.access_policies FOR INSERT TO centers_app WITH CHECK(centers.access_staff(center_id) AND actor_uid=centers.actor_uid());
CREATE POLICY access_policy_update ON centers.access_policies FOR UPDATE TO centers_app USING(centers.access_staff(center_id)) WITH CHECK(centers.access_staff(center_id) AND actor_uid=centers.actor_uid());
ALTER TABLE centers.access_devices ENABLE ROW LEVEL SECURITY;ALTER TABLE centers.access_devices FORCE ROW LEVEL SECURITY;
CREATE POLICY access_device_read ON centers.access_devices FOR SELECT TO centers_app USING(centers.access_staff(center_id));
CREATE POLICY access_device_insert ON centers.access_devices FOR INSERT TO centers_app WITH CHECK(centers.access_staff(center_id) AND actor_uid=centers.actor_uid());
CREATE POLICY access_device_update ON centers.access_devices FOR UPDATE TO centers_app USING(centers.access_staff(center_id)) WITH CHECK(centers.access_staff(center_id));
ALTER TABLE centers.access_holds ENABLE ROW LEVEL SECURITY;ALTER TABLE centers.access_holds FORCE ROW LEVEL SECURITY;
CREATE POLICY access_hold_read ON centers.access_holds FOR SELECT TO centers_app USING(centers.access_staff(center_id) OR centers.owns_member(center_id,member_id));
CREATE POLICY access_hold_insert ON centers.access_holds FOR INSERT TO centers_app WITH CHECK(centers.access_staff(center_id) AND actor_uid=centers.actor_uid() AND released_at IS NULL AND released_by IS NULL AND version=1);
CREATE POLICY access_hold_update ON centers.access_holds FOR UPDATE TO centers_app USING(centers.access_staff(center_id)) WITH CHECK(centers.access_staff(center_id) AND released_by=centers.actor_uid());
ALTER TABLE centers.access_tokens ENABLE ROW LEVEL SECURITY;ALTER TABLE centers.access_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY access_token_read ON centers.access_tokens FOR SELECT TO centers_app USING(centers.access_staff(center_id) OR (account_uid=centers.actor_uid() AND centers.owns_member(center_id,member_id)));
CREATE POLICY access_token_insert ON centers.access_tokens FOR INSERT TO centers_app WITH CHECK(account_uid=centers.actor_uid() AND centers.owns_member(center_id,member_id) AND consumed_at IS NULL AND consumed_device_id IS NULL AND invalidated_at IS NULL);
CREATE POLICY access_token_update ON centers.access_tokens FOR UPDATE TO centers_app USING(centers.access_staff(center_id) OR (account_uid=centers.actor_uid() AND centers.owns_member(center_id,member_id))) WITH CHECK(centers.access_staff(center_id) OR (account_uid=centers.actor_uid() AND centers.owns_member(center_id,member_id)));
ALTER TABLE centers.access_visits ENABLE ROW LEVEL SECURITY;ALTER TABLE centers.access_visits FORCE ROW LEVEL SECURITY;
CREATE POLICY access_visit_read ON centers.access_visits FOR SELECT TO centers_app USING(centers.access_staff(center_id) OR (account_uid=centers.actor_uid() AND centers.owns_member(center_id,member_id)));
CREATE POLICY access_visit_insert ON centers.access_visits FOR INSERT TO centers_app WITH CHECK(centers.access_staff(center_id) AND operator_uid=centers.actor_uid());
ALTER TABLE centers.access_scans ENABLE ROW LEVEL SECURITY;ALTER TABLE centers.access_scans FORCE ROW LEVEL SECURITY;
CREATE POLICY access_scan_read ON centers.access_scans FOR SELECT TO centers_app USING(centers.access_staff(center_id));
CREATE POLICY access_scan_insert ON centers.access_scans FOR INSERT TO centers_app WITH CHECK(centers.access_staff(center_id) AND operator_uid=centers.actor_uid());

-- Invoker rights preserve selected-center RLS for both own status and reception.
-- The parameter exists for deterministic parity tests; HTTP never accepts a clock.
CREATE FUNCTION centers.access_decision(target_center text,target_member text,at_time timestamptz DEFAULT clock_timestamp()) RETURNS text LANGUAGE plpgsql SET search_path=pg_catalog AS $$
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
  IF policy.require_subscription AND NOT EXISTS(SELECT 1 FROM centers.subscriptions s WHERE s.center_id=target_center AND s.member_id=target_member AND s.canceled_at IS NULL AND s.starts_on<=local_day AND (s.ends_on IS NULL OR s.ends_on>local_day)) THEN RETURN 'no-current-subscription'; END IF;
  IF policy.deny_overdue AND EXISTS(SELECT 1 FROM centers.receipts r WHERE r.center_id=target_center AND r.member_id=target_member AND r.due_on<local_day-policy.grace_days
    AND r.total_minor-coalesce((SELECT sum(a.amount_minor) FROM centers.payment_allocations a WHERE a.center_id=r.center_id AND a.receipt_id=r.id),0)
      +coalesce((SELECT sum(f.amount_minor) FROM centers.refunds f WHERE f.center_id=r.center_id AND f.receipt_id=r.id),0)>0) THEN RETURN 'account-review'; END IF;
  RETURN 'allowed';
END $$;

CREATE FUNCTION centers.check_access_token() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ft-gym-center:'||NEW.center_id));
  IF TG_OP='INSERT' THEN
    IF centers.access_decision(NEW.center_id,NEW.member_id)<>'allowed' THEN RAISE EXCEPTION 'access token is not available' USING ERRCODE='23514'; END IF;
    NEW.issued_at=date_trunc('milliseconds',clock_timestamp());NEW.expires_at=NEW.issued_at+interval '45 seconds';RETURN NEW;
  END IF;
  IF OLD.consumed_at IS NOT NULL OR OLD.invalidated_at IS NOT NULL OR (NEW.consumed_at IS NOT NULL AND NEW.invalidated_at IS NOT NULL) THEN RAISE EXCEPTION 'access token is terminal' USING ERRCODE='23514'; END IF;
  IF NEW.consumed_at IS NOT NULL AND NOT centers.access_staff(NEW.center_id) THEN RAISE EXCEPTION 'reception required' USING ERRCODE='42501'; END IF;
  IF NEW.consumed_at IS NULL AND NEW.invalidated_at IS NULL THEN RAISE EXCEPTION 'access token transition required' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER check_access_token BEFORE INSERT OR UPDATE ON centers.access_tokens FOR EACH ROW EXECUTE FUNCTION centers.check_access_token();
CREATE FUNCTION centers.check_access_visit() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE token_row centers.access_tokens; device_row centers.access_devices; member_uid text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ft-gym-center:'||NEW.center_id));
  SELECT * INTO token_row FROM centers.access_tokens t WHERE t.center_id=NEW.center_id AND t.id=NEW.token_id FOR UPDATE;
  SELECT * INTO device_row FROM centers.access_devices d WHERE d.center_id=NEW.center_id AND d.id=NEW.device_id;
  SELECT account_uid INTO member_uid FROM centers.members WHERE center_id=NEW.center_id AND id=NEW.member_id;
  NEW.visited_at=date_trunc('milliseconds',clock_timestamp());
  IF token_row.id IS NULL OR device_row.id IS NULL OR device_row.revoked_at IS NOT NULL OR device_row.expires_at<=clock_timestamp()
    OR token_row.member_id IS DISTINCT FROM NEW.member_id OR token_row.account_uid IS DISTINCT FROM NEW.account_uid OR member_uid IS DISTINCT FROM NEW.account_uid
    OR token_row.consumed_at IS NOT NULL OR token_row.invalidated_at IS NOT NULL OR token_row.issued_at>NEW.visited_at OR token_row.expires_at<=clock_timestamp()
    OR centers.access_decision(NEW.center_id,NEW.member_id,NEW.visited_at)<>'allowed' THEN RAISE EXCEPTION 'access verification failed' USING ERRCODE='23514'; END IF;
  UPDATE centers.access_tokens SET consumed_at=NEW.visited_at,consumed_device_id=NEW.device_id WHERE center_id=NEW.center_id AND id=NEW.token_id;
  RETURN NEW;
END $$;
CREATE TRIGGER check_access_visit BEFORE INSERT ON centers.access_visits FOR EACH ROW EXECUTE FUNCTION centers.check_access_visit();
CREATE FUNCTION centers.check_access_device_update() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ft-gym-center:'||NEW.center_id));
  IF OLD.revoked_at IS NOT NULL OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'device changed or revoked' USING ERRCODE='23514'; END IF;
  IF NEW.revoked_at IS NOT NULL THEN
    IF NEW.key_hash IS DISTINCT FROM OLD.key_hash OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.rotated_at IS DISTINCT FROM OLD.rotated_at THEN RAISE EXCEPTION 'revocation does not rotate credentials' USING ERRCODE='23514'; END IF;
    NEW.revoked_at=clock_timestamp();
  ELSE
    IF NEW.key_hash=OLD.key_hash THEN RAISE EXCEPTION 'credential rotation required' USING ERRCODE='23514'; END IF;
    NEW.rotated_at=clock_timestamp();NEW.expires_at=NEW.rotated_at+interval '30 days';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER check_access_device_update BEFORE UPDATE ON centers.access_devices FOR EACH ROW EXECUTE FUNCTION centers.check_access_device_update();
CREATE FUNCTION centers.check_access_hold_release() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ft-gym-center:'||NEW.center_id));
  IF OLD.released_at IS NOT NULL OR NEW.released_at IS NULL OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'manual hold can only be explicitly released once' USING ERRCODE='23514'; END IF;
  NEW.released_at=clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER check_access_hold_release BEFORE UPDATE ON centers.access_holds FOR EACH ROW EXECUTE FUNCTION centers.check_access_hold_release();
CREATE POLICY access_own_audit ON centers.business_audit FOR INSERT TO centers_app WITH CHECK(
  center_id=centers.selected_center() AND actor_uid=centers.actor_uid() AND action='access.token.issue'
  AND EXISTS(SELECT 1 FROM centers.access_tokens t WHERE t.center_id=business_audit.center_id AND t.id=business_audit.target_id AND t.account_uid=centers.actor_uid() AND centers.owns_member(t.center_id,t.member_id)));
REVOKE ALL ON centers.access_policies,centers.access_devices,centers.access_holds,centers.access_tokens,centers.access_visits,centers.access_scans FROM PUBLIC;
REVOKE ALL ON FUNCTION centers.access_staff(text),centers.access_decision(text,text,timestamptz),centers.check_access_token(),centers.check_access_visit(),centers.check_access_device_update(),centers.check_access_hold_release() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION centers.access_staff(text),centers.access_decision(text,text,timestamptz) TO centers_app;
GRANT SELECT,INSERT ON centers.access_policies,centers.access_devices,centers.access_holds,centers.access_tokens,centers.access_visits,centers.access_scans TO centers_app;
GRANT UPDATE(enabled,require_subscription,deny_overdue,grace_days,version,actor_uid,updated_at) ON centers.access_policies TO centers_app;
GRANT UPDATE(key_hash,version,rotated_at,expires_at,revoked_at) ON centers.access_devices TO centers_app;
GRANT UPDATE(released_at,released_by,version) ON centers.access_holds TO centers_app;
GRANT UPDATE(consumed_at,consumed_device_id,invalidated_at) ON centers.access_tokens TO centers_app;
