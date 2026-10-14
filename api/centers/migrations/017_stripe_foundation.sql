-- Sandbox-only gateway foundation. HTTP/webhook execution is added only after
-- reconciliation is implemented; these records never contain card/customer data.
CREATE TABLE centers.stripe_attempts (
  id text PRIMARY KEY CHECK(id ~ '^[a-zA-Z0-9_-]{1,64}$'),
  center_id text NOT NULL, member_id text NOT NULL, receipt_id text NOT NULL,
  profile_id text NOT NULL, actor_uid text NOT NULL,
  amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 50 AND 99999999), currency text NOT NULL CHECK(currency='EUR'),
  audience text NOT NULL DEFAULT 'staff' CHECK(audience IN ('staff','own')),
  state text NOT NULL DEFAULT 'creating' CHECK(state IN ('creating','open','paid','expired','failed','review')),
  reserved_payment_id text NOT NULL UNIQUE CHECK(reserved_payment_id ~ '^[a-zA-Z0-9_-]{1,64}$'), session_id text, checkout_url text,
  payment_id text, payment_intent_id text, received_minor bigint CHECK(received_minor>=0), error_code text,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(center_id,member_id,receipt_id) REFERENCES centers.receipts(center_id,member_id,id),
  FOREIGN KEY(center_id,member_id,payment_id) REFERENCES centers.payments(center_id,member_id,id),
  UNIQUE(center_id,id), UNIQUE(profile_id,session_id), UNIQUE(profile_id,payment_intent_id),
  CHECK((state='paid')=(payment_id IS NOT NULL)), CHECK(expires_at>created_at),
  CHECK(session_id IS NULL OR session_id ~ '^cs_test_[a-zA-Z0-9_]{1,240}$'),
  CHECK(payment_intent_id IS NULL OR payment_intent_id ~ '^pi_[a-zA-Z0-9_]{1,240}$'),
  CHECK(payment_id IS NULL OR payment_id=reserved_payment_id),
  CHECK(state<>'paid' OR (received_minor IS NOT NULL AND received_minor=amount_minor AND payment_intent_id IS NOT NULL))
);
CREATE UNIQUE INDEX stripe_one_active_receipt ON centers.stripe_attempts(center_id,receipt_id) WHERE state IN ('creating','open','review');
CREATE INDEX stripe_daily_limit ON centers.stripe_attempts(center_id,created_at) WHERE state IN ('creating','open','paid','review');
CREATE TABLE centers.stripe_inbox (
  profile_id text NOT NULL, event_id text NOT NULL CHECK(event_id ~ '^evt_[a-zA-Z0-9_]{1,240}$'), center_id text NOT NULL, attempt_id text NOT NULL,
  body_hash text NOT NULL CHECK(body_hash ~ '^[a-f0-9]{64}$'), event_type text NOT NULL,
  projection jsonb NOT NULL CHECK(jsonb_typeof(projection)='object') CHECK(
    projection ?& ARRAY['eventId','eventType','created','attemptId','centerId','receiptId','sessionId','amountMinor','currency','paymentStatus','status','paymentIntentId']
    AND projection-ARRAY['eventId','eventType','created','attemptId','centerId','receiptId','sessionId','amountMinor','currency','paymentStatus','status','paymentIntentId']='{}'::jsonb),
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','done','review')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0), next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claim_token text, lease_until timestamptz, error_code text, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(profile_id,event_id), FOREIGN KEY(center_id,attempt_id) REFERENCES centers.stripe_attempts(center_id,id),
  CHECK((state='processing')=(claim_token IS NOT NULL AND lease_until IS NOT NULL))
);
ALTER TABLE centers.stripe_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.stripe_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE centers.stripe_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.stripe_inbox FORCE ROW LEVEL SECURITY;
CREATE POLICY stripe_attempt_read ON centers.stripe_attempts FOR SELECT TO centers_app USING(
  center_id=centers.selected_center() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager']) OR
    EXISTS(SELECT 1 FROM centers.members m WHERE m.center_id=stripe_attempts.center_id AND m.id=member_id AND m.account_uid=centers.actor_uid())));
CREATE POLICY stripe_attempt_insert ON centers.stripe_attempts FOR INSERT TO centers_app WITH CHECK(
  center_id=centers.selected_center() AND actor_uid=centers.actor_uid() AND state='creating' AND session_id IS NULL AND payment_id IS NULL AND received_minor IS NULL
  AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY stripe_attempt_update ON centers.stripe_attempts FOR UPDATE TO centers_app USING(center_id=centers.selected_center() AND centers.is_platform()) WITH CHECK(center_id=centers.selected_center() AND centers.is_platform());
CREATE POLICY stripe_inbox_read ON centers.stripe_inbox FOR SELECT TO centers_app USING(center_id=centers.selected_center() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY stripe_inbox_insert ON centers.stripe_inbox FOR INSERT TO centers_app WITH CHECK(center_id=centers.selected_center() AND centers.is_platform());
CREATE POLICY stripe_inbox_update ON centers.stripe_inbox FOR UPDATE TO centers_app USING(center_id=centers.selected_center() AND centers.is_platform()) WITH CHECK(center_id=centers.selected_center() AND centers.is_platform());
REVOKE ALL ON centers.stripe_attempts,centers.stripe_inbox FROM PUBLIC;
GRANT SELECT,INSERT ON centers.stripe_attempts TO centers_app;
GRANT UPDATE(state,session_id,checkout_url,payment_id,payment_intent_id,received_minor,error_code,updated_at) ON centers.stripe_attempts TO centers_app;
GRANT SELECT,INSERT ON centers.stripe_inbox TO centers_app;
GRANT UPDATE(state,attempts,next_attempt_at,claim_token,lease_until,error_code) ON centers.stripe_inbox TO centers_app;
CREATE FUNCTION centers.stripe_reservation_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ft-gym-center:'||NEW.center_id));
  IF EXISTS(SELECT 1 FROM centers.stripe_attempts a WHERE a.center_id=NEW.center_id AND a.receipt_id=NEW.receipt_id
    AND a.state IN ('creating','open','review') AND a.reserved_payment_id<>NEW.payment_id) THEN
    RAISE EXCEPTION 'receipt has an active gateway reservation' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER stripe_reservation_guard BEFORE INSERT ON centers.payment_allocations FOR EACH ROW EXECUTE FUNCTION centers.stripe_reservation_guard();
REVOKE ALL ON FUNCTION centers.stripe_reservation_guard() FROM PUBLIC;
