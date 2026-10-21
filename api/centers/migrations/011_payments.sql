-- Manual ledger. No bank action, mutable paid flag, or unallocated credit in this version.
ALTER TABLE centers.receipts ADD CONSTRAINT receipt_member_identity UNIQUE(center_id,member_id,id);
CREATE TABLE centers.payments (
  id text PRIMARY KEY CHECK(id ~ '^[a-zA-Z0-9_-]{1,64}$'),
  center_id text NOT NULL, member_id text NOT NULL,
  amount_minor bigint NOT NULL CHECK(amount_minor>0 AND amount_minor<=999999999999999),
  currency text NOT NULL CHECK(currency='EUR'), paid_on date NOT NULL,
  method text NOT NULL CHECK(method IN ('cash','bank-transfer','card','other')),
  reference text CHECK(length(reference)<=120), actor_uid text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(center_id,member_id) REFERENCES centers.members(center_id,id),
  UNIQUE(center_id,member_id,id)
);
CREATE INDEX payment_member_page ON centers.payments(center_id,member_id,created_at DESC,id DESC);
CREATE TABLE centers.payment_allocations (
  center_id text NOT NULL, member_id text NOT NULL, payment_id text NOT NULL, receipt_id text NOT NULL,
  amount_minor bigint NOT NULL CHECK(amount_minor>0), actor_uid text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(center_id,payment_id,receipt_id),
  FOREIGN KEY(center_id,member_id,payment_id) REFERENCES centers.payments(center_id,member_id,id),
  FOREIGN KEY(center_id,member_id,receipt_id) REFERENCES centers.receipts(center_id,member_id,id)
);
CREATE INDEX allocation_receipt ON centers.payment_allocations(center_id,receipt_id);
CREATE TABLE centers.refunds (
  id text PRIMARY KEY CHECK(id ~ '^[a-zA-Z0-9_-]{1,64}$'),
  center_id text NOT NULL, member_id text NOT NULL, payment_id text NOT NULL, receipt_id text NOT NULL,
  amount_minor bigint NOT NULL CHECK(amount_minor>0), refunded_on date NOT NULL,
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 500), actor_uid text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(center_id,payment_id,receipt_id) REFERENCES centers.payment_allocations(center_id,payment_id,receipt_id),
  FOREIGN KEY(center_id,member_id,payment_id) REFERENCES centers.payments(center_id,member_id,id)
);
CREATE INDEX refund_allocation ON centers.refunds(center_id,payment_id,receipt_id);
CREATE FUNCTION centers.can_refund(target_center text) RETURNS boolean LANGUAGE sql STABLE
  SET search_path=pg_catalog AS $$
  SELECT target_center=centers.selected_center() AND EXISTS(
    SELECT 1 FROM centers.role_assignments r WHERE r.center_id=target_center AND r.account_uid=centers.actor_uid()
    AND r.role='manager' AND 'payments.refund'=ANY(r.extra_capabilities) AND r.revoked_at IS NULL
    AND r.valid_from<=CURRENT_TIMESTAMP AND (r.valid_until IS NULL OR r.valid_until>CURRENT_TIMESTAMP))
$$;
CREATE FUNCTION centers.ledger_lock() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ft-gym-center:' || NEW.center_id));
  RETURN NEW;
END $$;
-- Deferred checks enforce atomic full allocation even for a direct SQL INSERT.
-- The same center lock serializes ledger writes across API actors and SQL callers.
CREATE FUNCTION centers.ledger_check() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE target_payment text; allocated numeric; original numeric; returned numeric; receipt_total numeric; received numeric;
BEGIN
  IF TG_TABLE_NAME='payments' THEN target_payment := NEW.id; ELSE target_payment := NEW.payment_id; END IF;
  SELECT p.amount_minor INTO original FROM centers.payments p WHERE p.center_id=NEW.center_id AND p.id=target_payment;
  SELECT coalesce(sum(a.amount_minor),0) INTO allocated FROM centers.payment_allocations a WHERE a.center_id=NEW.center_id AND a.payment_id=target_payment;
  IF allocated<>original THEN RAISE EXCEPTION 'payment must be fully allocated' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='payment_allocations' THEN
    SELECT r.total_minor INTO receipt_total FROM centers.receipts r WHERE r.center_id=NEW.center_id AND r.id=NEW.receipt_id;
    SELECT coalesce(sum(a.amount_minor),0) INTO received FROM centers.payment_allocations a WHERE a.center_id=NEW.center_id AND a.receipt_id=NEW.receipt_id;
    SELECT coalesce(sum(f.amount_minor),0) INTO returned FROM centers.refunds f WHERE f.center_id=NEW.center_id AND f.receipt_id=NEW.receipt_id;
    IF received-returned>receipt_total THEN RAISE EXCEPTION 'receipt overpayment' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='refunds' THEN
    SELECT a.amount_minor INTO allocated FROM centers.payment_allocations a WHERE a.center_id=NEW.center_id AND a.payment_id=NEW.payment_id AND a.receipt_id=NEW.receipt_id;
    SELECT coalesce(sum(f.amount_minor),0) INTO returned FROM centers.refunds f WHERE f.center_id=NEW.center_id AND f.payment_id=NEW.payment_id AND f.receipt_id=NEW.receipt_id;
    IF returned>allocated OR NEW.refunded_on<(SELECT p.paid_on FROM centers.payments p WHERE p.center_id=NEW.center_id AND p.id=NEW.payment_id)
    THEN RAISE EXCEPTION 'invalid refund' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NULL;
END $$;
ALTER TABLE centers.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.payments FORCE ROW LEVEL SECURITY;
ALTER TABLE centers.payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.payment_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE centers.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.refunds FORCE ROW LEVEL SECURITY;
CREATE POLICY payment_read ON centers.payments FOR SELECT TO centers_app USING(
  centers.is_platform() OR (center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY allocation_read ON centers.payment_allocations FOR SELECT TO centers_app USING(
  centers.is_platform() OR (center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY refund_read ON centers.refunds FOR SELECT TO centers_app USING(
  centers.is_platform() OR (center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY payment_insert ON centers.payments FOR INSERT TO centers_app WITH CHECK(
  actor_uid=centers.actor_uid() AND (centers.is_platform() OR (center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager']))));
CREATE POLICY allocation_insert ON centers.payment_allocations FOR INSERT TO centers_app WITH CHECK(
  actor_uid=centers.actor_uid() AND (centers.is_platform() OR (center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager']))));
CREATE POLICY refund_insert ON centers.refunds FOR INSERT TO centers_app WITH CHECK(
  actor_uid=centers.actor_uid() AND (centers.is_platform() OR centers.can_refund(center_id)));
CREATE TRIGGER payment_lock BEFORE INSERT ON centers.payments FOR EACH ROW EXECUTE FUNCTION centers.ledger_lock();
CREATE TRIGGER allocation_lock BEFORE INSERT ON centers.payment_allocations FOR EACH ROW EXECUTE FUNCTION centers.ledger_lock();
CREATE TRIGGER refund_lock BEFORE INSERT ON centers.refunds FOR EACH ROW EXECUTE FUNCTION centers.ledger_lock();
CREATE CONSTRAINT TRIGGER payment_integrity AFTER INSERT ON centers.payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION centers.ledger_check();
CREATE CONSTRAINT TRIGGER allocation_integrity AFTER INSERT ON centers.payment_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION centers.ledger_check();
CREATE CONSTRAINT TRIGGER refund_integrity AFTER INSERT ON centers.refunds DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION centers.ledger_check();
REVOKE ALL ON centers.payments,centers.payment_allocations,centers.refunds FROM PUBLIC;
GRANT SELECT,INSERT ON centers.payments,centers.payment_allocations,centers.refunds TO centers_app;
REVOKE ALL ON FUNCTION centers.can_refund(text),centers.ledger_lock(),centers.ledger_check() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION centers.can_refund(text) TO centers_app;
