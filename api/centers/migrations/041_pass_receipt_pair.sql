-- A paid purchase must end its transaction paired with its own pass receipt,
-- never merely pointing at another existing receipt for the same membership.
CREATE FUNCTION centers.check_pass_receipt_pair() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.receipt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM centers.receipts r
    WHERE r.center_id=NEW.center_id AND r.member_id=NEW.member_id AND r.id=NEW.receipt_id AND r.concept='pass' AND r.pass_purchase_id=NEW.id) THEN
    RAISE EXCEPTION 'paid pass requires its own receipt' USING ERRCODE='23514';
  END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER check_pass_receipt_pair AFTER INSERT ON centers.pass_purchases DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION centers.check_pass_receipt_pair();
REVOKE ALL ON FUNCTION centers.check_pass_receipt_pair() FROM PUBLIC;
