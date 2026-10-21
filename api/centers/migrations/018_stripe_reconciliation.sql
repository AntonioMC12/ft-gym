-- A late confirmed payment can require review while a newer checkout is open.
-- Keep all evidence instead of making that situation violate a unique index.
DROP INDEX centers.stripe_one_active_receipt;
CREATE UNIQUE INDEX stripe_one_active_receipt ON centers.stripe_attempts(center_id,receipt_id) WHERE state IN ('creating','open');
ALTER TABLE centers.stripe_attempts
  ADD COLUMN claim_token text,
  ADD COLUMN lease_until timestamptz,
  ADD COLUMN sync_attempts integer NOT NULL DEFAULT 0 CHECK(sync_attempts>=0),
  ADD COLUMN sync_next_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN provider_account_id text,
  ADD COLUMN return_origin text,
  ADD COLUMN api_version text,
  ADD COLUMN evidence jsonb CHECK(evidence IS NULL OR (jsonb_typeof(evidence)='object'
    AND evidence-ARRAY['sessionId','status','paymentStatus','paymentIntentId','receivedMinor','settledAtSeconds']='{}'::jsonb)),
  ADD COLUMN settled_at timestamptz,
  ADD CONSTRAINT stripe_claim_pair CHECK((claim_token IS NULL)=(lease_until IS NULL));
CREATE INDEX stripe_attempt_work ON centers.stripe_attempts(profile_id,sync_next_at,id) WHERE state IN ('creating','open');
CREATE INDEX stripe_inbox_work ON centers.stripe_inbox(center_id,attempt_id,next_attempt_at) WHERE state='pending';
GRANT UPDATE(claim_token,lease_until,sync_attempts,sync_next_at,settled_at,evidence) ON centers.stripe_attempts TO centers_app;
CREATE TABLE centers.stripe_scans(center_id text PRIMARY KEY REFERENCES centers.centers(id),scanned_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE centers.stripe_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.stripe_scans FORCE ROW LEVEL SECURITY;
CREATE POLICY stripe_scan_read ON centers.stripe_scans FOR SELECT TO centers_app USING(centers.is_platform());
CREATE POLICY stripe_scan_insert ON centers.stripe_scans FOR INSERT TO centers_app WITH CHECK(centers.is_platform() AND center_id=centers.selected_center());
CREATE POLICY stripe_scan_update ON centers.stripe_scans FOR UPDATE TO centers_app USING(centers.is_platform() AND center_id=centers.selected_center()) WITH CHECK(centers.is_platform() AND center_id=centers.selected_center());
REVOKE ALL ON centers.stripe_scans FROM PUBLIC;
GRANT SELECT,INSERT ON centers.stripe_scans TO centers_app;
GRANT UPDATE(scanned_at) ON centers.stripe_scans TO centers_app;
CREATE FUNCTION centers.stripe_attempt_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ft-gym-center:'||NEW.center_id));
  IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM centers.stripe_attempts a WHERE a.center_id=NEW.center_id
    AND a.receipt_id=NEW.receipt_id AND a.state IN ('creating','open','review')) THEN
    RAISE EXCEPTION 'receipt has an active gateway reservation' USING ERRCODE='23505';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.provider_account_id IS DISTINCT FROM OLD.provider_account_id OR NEW.return_origin IS DISTINCT FROM OLD.return_origin OR NEW.api_version IS DISTINCT FROM OLD.api_version THEN
      RAISE EXCEPTION 'gateway request configuration is immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.state='paid' AND (NEW.state<>'paid' OR NEW.payment_id IS DISTINCT FROM OLD.payment_id
      OR NEW.payment_intent_id IS DISTINCT FROM OLD.payment_intent_id OR NEW.received_minor IS DISTINCT FROM OLD.received_minor
      OR NEW.settled_at IS DISTINCT FROM OLD.settled_at OR NEW.session_id IS DISTINCT FROM OLD.session_id) THEN
      RAISE EXCEPTION 'confirmed payment is immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.session_id IS NOT NULL AND NEW.session_id IS DISTINCT FROM OLD.session_id THEN
      RAISE EXCEPTION 'gateway session identity is immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.payment_intent_id IS NOT NULL AND NEW.payment_intent_id IS DISTINCT FROM OLD.payment_intent_id THEN
      RAISE EXCEPTION 'gateway intent identity is immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER stripe_attempt_guard BEFORE INSERT OR UPDATE ON centers.stripe_attempts FOR EACH ROW EXECUTE FUNCTION centers.stripe_attempt_guard();
REVOKE ALL ON FUNCTION centers.stripe_attempt_guard() FROM PUBLIC;
