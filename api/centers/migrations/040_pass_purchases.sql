-- Explicit terms; archiving never changes an already purchased pass.
CREATE TABLE centers.pass_products(
  id text PRIMARY KEY,center_id text NOT NULL REFERENCES centers.centers(id),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),
  kind text NOT NULL CHECK(kind IN ('paid','promotion')),credits integer NOT NULL CHECK(credits BETWEEN 1 AND 1000),valid_days integer NOT NULL CHECK(valid_days BETWEEN 1 AND 3650),
  price_minor bigint NOT NULL CHECK(price_minor>=0),price_includes_tax boolean NOT NULL,tax_basis_points integer NOT NULL CHECK(tax_basis_points BETWEEN 0 AND 10000),
  net_minor bigint NOT NULL CHECK(net_minor>=0),tax_minor bigint NOT NULL CHECK(tax_minor>=0),total_minor bigint NOT NULL CHECK(total_minor=net_minor+tax_minor AND total_minor<=999999999999999),
  archived boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1 CHECK(version>0),actor_uid text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(center_id,id),CHECK(kind='paid' AND total_minor>0 OR kind='promotion' AND total_minor=0)
);
CREATE INDEX pass_product_page ON centers.pass_products(center_id,created_at DESC,id DESC);
CREATE TABLE centers.pass_purchases(
  id text PRIMARY KEY,center_id text NOT NULL,member_id text NOT NULL,product_id text NOT NULL,
  starts_on date NOT NULL,ends_on date NOT NULL,receipt_id text,
  actor_uid text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(center_id,member_id) REFERENCES centers.members(center_id,id),FOREIGN KEY(center_id,product_id) REFERENCES centers.pass_products(center_id,id),
  UNIQUE(center_id,member_id,id),UNIQUE(center_id,id),UNIQUE(center_id,receipt_id),CHECK(ends_on>starts_on)
);
CREATE INDEX pass_purchase_page ON centers.pass_purchases(center_id,member_id,created_at DESC,id DESC);
ALTER TABLE centers.receipts ALTER COLUMN subscription_id DROP NOT NULL;
ALTER TABLE centers.receipts DROP CONSTRAINT receipts_concept_check;
ALTER TABLE centers.receipts ADD COLUMN pass_purchase_id text;
ALTER TABLE centers.receipts ADD CONSTRAINT receipt_kind CHECK(concept='membership' AND subscription_id IS NOT NULL AND pass_purchase_id IS NULL OR concept='pass' AND subscription_id IS NULL AND pass_purchase_id IS NOT NULL);
ALTER TABLE centers.receipts ADD CONSTRAINT receipt_pass_purchase FOREIGN KEY(center_id,member_id,pass_purchase_id) REFERENCES centers.pass_purchases(center_id,member_id,id);
CREATE UNIQUE INDEX receipt_pass_once ON centers.receipts(center_id,pass_purchase_id) WHERE pass_purchase_id IS NOT NULL;
ALTER TABLE centers.pass_purchases ADD CONSTRAINT pass_receipt FOREIGN KEY(center_id,member_id,receipt_id) REFERENCES centers.receipts(center_id,member_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE centers.pass_revocations(
  id text PRIMARY KEY,center_id text NOT NULL,member_id text NOT NULL,pass_id text NOT NULL,reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 250),
  actor_uid text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(center_id,member_id,pass_id) REFERENCES centers.pass_purchases(center_id,member_id,id),UNIQUE(center_id,pass_id)
);
ALTER TABLE centers.pass_products ENABLE ROW LEVEL SECURITY;ALTER TABLE centers.pass_products FORCE ROW LEVEL SECURITY;
ALTER TABLE centers.pass_purchases ENABLE ROW LEVEL SECURITY;ALTER TABLE centers.pass_purchases FORCE ROW LEVEL SECURITY;
ALTER TABLE centers.pass_revocations ENABLE ROW LEVEL SECURITY;ALTER TABLE centers.pass_revocations FORCE ROW LEVEL SECURITY;
CREATE POLICY pass_product_read ON centers.pass_products FOR SELECT TO centers_app USING(center_id=centers.selected_center() AND (centers.access_staff(center_id) OR EXISTS(SELECT 1 FROM centers.pass_purchases b WHERE b.center_id=pass_products.center_id AND b.product_id=pass_products.id AND centers.owns_member(b.center_id,b.member_id))));
CREATE POLICY pass_product_insert ON centers.pass_products FOR INSERT TO centers_app WITH CHECK(centers.access_staff(center_id) AND actor_uid=centers.actor_uid() AND NOT archived AND version=1);
CREATE POLICY pass_product_archive ON centers.pass_products FOR UPDATE TO centers_app USING(centers.access_staff(center_id)) WITH CHECK(centers.access_staff(center_id) AND archived);
CREATE POLICY pass_purchase_read ON centers.pass_purchases FOR SELECT TO centers_app USING(centers.access_staff(center_id) OR centers.owns_member(center_id,member_id));
CREATE POLICY pass_purchase_insert ON centers.pass_purchases FOR INSERT TO centers_app WITH CHECK(centers.access_staff(center_id) AND actor_uid=centers.actor_uid());
CREATE POLICY pass_revocation_read ON centers.pass_revocations FOR SELECT TO centers_app USING(centers.access_staff(center_id) OR centers.owns_member(center_id,member_id));
CREATE POLICY pass_revocation_insert ON centers.pass_revocations FOR INSERT TO centers_app WITH CHECK(centers.access_staff(center_id) AND actor_uid=centers.actor_uid());
GRANT SELECT,INSERT ON centers.pass_products,centers.pass_purchases,centers.pass_revocations TO centers_app;
GRANT UPDATE(archived,version) ON centers.pass_products TO centers_app;
CREATE FUNCTION centers.check_pass_purchase() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE product centers.pass_products; local_day date;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ft-gym-center:'||NEW.center_id));
  SELECT * INTO product FROM centers.pass_products WHERE center_id=NEW.center_id AND id=NEW.product_id;
  SELECT (clock_timestamp() AT TIME ZONE timezone)::date INTO local_day FROM centers.centers WHERE id=NEW.center_id AND state='active';
  IF product.id IS NULL OR product.archived OR local_day IS NULL OR NEW.starts_on<local_day OR NEW.ends_on<>NEW.starts_on+product.valid_days
    OR (product.kind='paid') IS DISTINCT FROM (NEW.receipt_id IS NOT NULL)
    OR NOT EXISTS(SELECT 1 FROM centers.member_profiles m WHERE m.center_id=NEW.center_id AND m.id=NEW.member_id AND m.state='active' AND m.joined_on<=local_day AND (m.ends_on IS NULL OR m.ends_on>local_day)) THEN
    RAISE EXCEPTION 'pass terms or membership changed' USING ERRCODE='23514';
  END IF;RETURN NEW;
END $$;
CREATE TRIGGER check_pass_purchase BEFORE INSERT ON centers.pass_purchases FOR EACH ROW EXECUTE FUNCTION centers.check_pass_purchase();
CREATE FUNCTION centers.check_pass_receipt() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.concept='pass' AND NOT EXISTS(SELECT 1 FROM centers.pass_purchases b JOIN centers.pass_products p ON (p.center_id,p.id)=(b.center_id,b.product_id)
    WHERE b.center_id=NEW.center_id AND b.member_id=NEW.member_id AND b.id=NEW.pass_purchase_id AND b.receipt_id=NEW.id AND p.kind='paid'
    AND (NEW.net_minor,NEW.tax_minor,NEW.total_minor)=(p.net_minor,p.tax_minor,p.total_minor) AND NEW.period_end=b.ends_on) THEN
    RAISE EXCEPTION 'pass receipt must match immutable purchase' USING ERRCODE='23514';
  END IF;RETURN NEW;
END $$;
CREATE TRIGGER check_pass_receipt BEFORE INSERT ON centers.receipts FOR EACH ROW EXECUTE FUNCTION centers.check_pass_receipt();
REVOKE ALL ON FUNCTION centers.check_pass_purchase(),centers.check_pass_receipt() FROM PUBLIC;

ALTER TABLE centers.access_policies ADD COLUMN allow_passes boolean NOT NULL DEFAULT false;
GRANT UPDATE(allow_passes) ON centers.access_policies TO centers_app;
ALTER TABLE centers.access_tokens ADD COLUMN pass_id text;
ALTER TABLE centers.access_tokens ADD CONSTRAINT access_token_pass FOREIGN KEY(center_id,member_id,pass_id) REFERENCES centers.pass_purchases(center_id,member_id,id);
CREATE TABLE centers.pass_consumptions(
  id text PRIMARY KEY,center_id text NOT NULL,member_id text NOT NULL,pass_id text NOT NULL,visit_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(center_id,member_id,pass_id) REFERENCES centers.pass_purchases(center_id,member_id,id),
  FOREIGN KEY(center_id,visit_id) REFERENCES centers.access_visits(center_id,id),UNIQUE(center_id,visit_id)
);
CREATE INDEX pass_consumption_count ON centers.pass_consumptions(center_id,pass_id);
ALTER TABLE centers.pass_consumptions ENABLE ROW LEVEL SECURITY;ALTER TABLE centers.pass_consumptions FORCE ROW LEVEL SECURITY;
CREATE POLICY pass_consumption_read ON centers.pass_consumptions FOR SELECT TO centers_app USING(centers.access_staff(center_id) OR centers.owns_member(center_id,member_id));
CREATE POLICY pass_consumption_insert ON centers.pass_consumptions FOR INSERT TO centers_app WITH CHECK(centers.access_staff(center_id));
GRANT SELECT,INSERT ON centers.pass_consumptions TO centers_app;
-- Invoker projection: normal member/financial RLS remains in force. No definer
-- counter or mutable balance: the append-only admissions ledger is authoritative.
CREATE FUNCTION centers.pass_available(target_center text,target_member text,target_pass text,local_day date) RETURNS boolean LANGUAGE sql SET search_path=pg_catalog AS $$
  SELECT target_center=centers.selected_center() AND EXISTS(
    SELECT 1 FROM centers.pass_purchases b JOIN centers.pass_products p ON (p.center_id,p.id)=(b.center_id,b.product_id)
    WHERE b.center_id=target_center AND b.member_id=target_member AND b.id=target_pass AND b.starts_on<=local_day AND b.ends_on>local_day
    AND NOT EXISTS(SELECT 1 FROM centers.pass_revocations v WHERE (v.center_id,v.pass_id)=(b.center_id,b.id))
    AND (SELECT count(*) FROM centers.pass_consumptions u WHERE (u.center_id,u.pass_id)=(b.center_id,b.id))<p.credits
    AND (p.kind='promotion' OR EXISTS(SELECT 1 FROM centers.receipts r WHERE r.center_id=b.center_id AND r.member_id=b.member_id AND r.id=b.receipt_id AND r.pass_purchase_id=b.id AND r.concept='pass'
      AND r.total_minor-coalesce((SELECT sum(a.amount_minor) FROM centers.payment_allocations a WHERE a.center_id=r.center_id AND a.receipt_id=r.id),0)
      +coalesce((SELECT sum(f.amount_minor) FROM centers.refunds f WHERE f.center_id=r.center_id AND f.receipt_id=r.id),0)=0))
  );
$$;
REVOKE ALL ON FUNCTION centers.pass_available(text,text,text,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION centers.pass_available(text,text,text,date) TO centers_app;
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
  IF selected_pass IS NULL AND policy.require_subscription AND NOT EXISTS(SELECT 1 FROM centers.subscriptions s WHERE s.center_id=target_center AND s.member_id=target_member AND s.canceled_at IS NULL AND s.starts_on<=local_day AND (s.ends_on IS NULL OR s.ends_on>local_day)) THEN RETURN 'no-current-subscription'; END IF;
  IF policy.deny_overdue AND EXISTS(SELECT 1 FROM centers.receipts r WHERE r.center_id=target_center AND r.member_id=target_member AND r.due_on<local_day-policy.grace_days
    AND r.total_minor-coalesce((SELECT sum(a.amount_minor) FROM centers.payment_allocations a WHERE a.center_id=r.center_id AND a.receipt_id=r.id),0)
      +coalesce((SELECT sum(f.amount_minor) FROM centers.refunds f WHERE f.center_id=r.center_id AND f.receipt_id=r.id),0)>0) THEN RETURN 'account-review'; END IF;
  RETURN 'allowed';
END $function$;
REVOKE ALL ON FUNCTION centers.access_decision(text,text,timestamptz,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION centers.access_decision(text,text,timestamptz,text) TO centers_app;
CREATE OR REPLACE FUNCTION centers.access_decision(target_center text,target_member text,at_time timestamptz DEFAULT clock_timestamp()) RETURNS text LANGUAGE sql SET search_path=pg_catalog AS $$
  SELECT centers.access_decision(target_center,target_member,at_time,NULL);
$$;
CREATE OR REPLACE FUNCTION centers.check_access_token() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ft-gym-center:'||NEW.center_id));
  IF TG_OP='INSERT' THEN
    IF centers.access_decision(NEW.center_id,NEW.member_id,clock_timestamp(),NEW.pass_id)<>'allowed' THEN RAISE EXCEPTION 'access token is not available' USING ERRCODE='23514'; END IF;
    NEW.issued_at=date_trunc('milliseconds',clock_timestamp());NEW.expires_at=NEW.issued_at+interval '45 seconds';RETURN NEW;
  END IF;
  IF OLD.consumed_at IS NOT NULL OR OLD.invalidated_at IS NOT NULL OR (NEW.consumed_at IS NOT NULL AND NEW.invalidated_at IS NOT NULL) THEN RAISE EXCEPTION 'access token is terminal' USING ERRCODE='23514'; END IF;
  IF NEW.consumed_at IS NOT NULL AND NOT centers.access_staff(NEW.center_id) THEN RAISE EXCEPTION 'reception required' USING ERRCODE='42501'; END IF;
  IF NEW.consumed_at IS NULL AND NEW.invalidated_at IS NULL THEN RAISE EXCEPTION 'access token transition required' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION centers.check_access_visit() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
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
    OR centers.access_decision(NEW.center_id,NEW.member_id,NEW.visited_at,token_row.pass_id)<>'allowed' THEN RAISE EXCEPTION 'access verification failed' USING ERRCODE='23514'; END IF;
  UPDATE centers.access_tokens SET consumed_at=NEW.visited_at,consumed_device_id=NEW.device_id WHERE center_id=NEW.center_id AND id=NEW.token_id;
  RETURN NEW;
END $$;

CREATE FUNCTION centers.consume_visit_pass() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE selected_pass text;
BEGIN
  SELECT pass_id INTO selected_pass FROM centers.access_tokens WHERE center_id=NEW.center_id AND id=NEW.token_id;
  IF selected_pass IS NOT NULL THEN INSERT INTO centers.pass_consumptions(id,center_id,member_id,pass_id,visit_id) VALUES(NEW.id,NEW.center_id,NEW.member_id,selected_pass,NEW.id); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER consume_visit_pass AFTER INSERT ON centers.access_visits FOR EACH ROW EXECUTE FUNCTION centers.consume_visit_pass();
CREATE FUNCTION centers.check_pass_consumption() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE local_day date;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ft-gym-center:'||NEW.center_id));
  SELECT (clock_timestamp() AT TIME ZONE timezone)::date INTO local_day FROM centers.centers WHERE id=NEW.center_id;
  IF NOT centers.pass_available(NEW.center_id,NEW.member_id,NEW.pass_id,local_day) OR NOT EXISTS(
    SELECT 1 FROM centers.access_visits v JOIN centers.access_tokens t ON (t.center_id,t.id)=(v.center_id,v.token_id)
    WHERE v.center_id=NEW.center_id AND v.id=NEW.visit_id AND v.member_id=NEW.member_id AND t.pass_id=NEW.pass_id AND t.consumed_at=v.visited_at
  ) THEN RAISE EXCEPTION 'pass consumption is not available' USING ERRCODE='23514'; END IF;
  NEW.created_at=clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER check_pass_consumption BEFORE INSERT ON centers.pass_consumptions FOR EACH ROW EXECUTE FUNCTION centers.check_pass_consumption();
REVOKE ALL ON FUNCTION centers.consume_visit_pass(),centers.check_pass_consumption() FROM PUBLIC;
