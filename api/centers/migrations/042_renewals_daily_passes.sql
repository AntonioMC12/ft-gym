-- Cash renewal ledger; contracts and the existing immutable receipt/payment ledger remain authoritative.
CREATE TABLE centers.renewals(
 id text PRIMARY KEY,center_id text NOT NULL,member_id text NOT NULL,subscription_id text NOT NULL,
 renewal_month date NOT NULL,period_start date NOT NULL,period_end date NOT NULL,receipt_id text,payment_id text,
 actor_uid text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(center_id,member_id,renewal_month),CHECK(period_end>period_start),CHECK(extract(day FROM renewal_month)=1),
 FOREIGN KEY(center_id,member_id,subscription_id) REFERENCES centers.subscriptions(center_id,member_id,id),
 FOREIGN KEY(center_id,member_id,receipt_id) REFERENCES centers.receipts(center_id,member_id,id),
 FOREIGN KEY(center_id,member_id,payment_id) REFERENCES centers.payments(center_id,member_id,id)
);
ALTER TABLE centers.renewals ENABLE ROW LEVEL SECURITY;ALTER TABLE centers.renewals FORCE ROW LEVEL SECURITY;
CREATE POLICY renewal_read ON centers.renewals FOR SELECT TO centers_app USING(centers.access_staff(center_id) OR centers.owns_member(center_id,member_id));
CREATE POLICY renewal_insert ON centers.renewals FOR INSERT TO centers_app WITH CHECK(centers.access_staff(center_id) AND actor_uid=centers.actor_uid());
GRANT SELECT,INSERT ON centers.renewals TO centers_app;
CREATE TRIGGER renewal_lock BEFORE INSERT ON centers.renewals FOR EACH ROW EXECUTE FUNCTION centers.ledger_lock();
-- Manual daily uses share the same append-only balance as QR admissions.
ALTER TABLE centers.pass_consumptions ALTER COLUMN visit_id DROP NOT NULL;
ALTER TABLE centers.pass_consumptions ADD COLUMN used_on date;
ALTER TABLE centers.pass_consumptions ADD COLUMN actor_uid text;
-- Migration owner bypass only inside this atomic migration; runtime RLS remains forced.
ALTER TABLE centers.pass_consumptions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE centers.access_visits NO FORCE ROW LEVEL SECURITY;
ALTER TABLE centers.centers NO FORCE ROW LEVEL SECURITY;
UPDATE centers.pass_consumptions u SET used_on=(u.created_at AT TIME ZONE c.timezone)::date,actor_uid=v.operator_uid
 FROM centers.centers c,centers.access_visits v WHERE c.id=u.center_id AND v.center_id=u.center_id AND v.id=u.visit_id;
ALTER TABLE centers.pass_consumptions FORCE ROW LEVEL SECURITY;
ALTER TABLE centers.access_visits FORCE ROW LEVEL SECURITY;
ALTER TABLE centers.centers FORCE ROW LEVEL SECURITY;
ALTER TABLE centers.pass_consumptions ALTER COLUMN actor_uid SET NOT NULL;
ALTER TABLE centers.pass_consumptions ALTER COLUMN used_on SET NOT NULL;
CREATE UNIQUE INDEX pass_manual_day_once ON centers.pass_consumptions(center_id,member_id,used_on) WHERE visit_id IS NULL;
CREATE INDEX pass_history_page ON centers.pass_purchases(center_id,created_at DESC,id DESC);
CREATE OR REPLACE FUNCTION centers.check_pass_consumption() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE local_day date;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('ft-gym-center:'||NEW.center_id));
 SELECT (clock_timestamp() AT TIME ZONE timezone)::date INTO local_day FROM centers.centers WHERE id=NEW.center_id AND state='active';
 IF local_day IS NULL OR NOT centers.pass_available(NEW.center_id,NEW.member_id,NEW.pass_id,local_day) THEN RAISE EXCEPTION 'pass unavailable' USING ERRCODE='23514'; END IF;
 IF NEW.visit_id IS NULL THEN
  IF NOT centers.access_staff(NEW.center_id) OR EXISTS(SELECT 1 FROM centers.subscriptions WHERE center_id=NEW.center_id AND member_id=NEW.member_id AND canceled_at IS NULL)
    OR NOT EXISTS(SELECT 1 FROM centers.member_profiles WHERE center_id=NEW.center_id AND id=NEW.member_id AND state='active' AND joined_on<=local_day AND (ends_on IS NULL OR ends_on>local_day))
    OR EXISTS(SELECT 1 FROM centers.pass_consumptions WHERE center_id=NEW.center_id AND member_id=NEW.member_id AND used_on=local_day)
  THEN RAISE EXCEPTION 'daily pass unavailable' USING ERRCODE='23514'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM centers.access_visits v JOIN centers.access_tokens t ON (t.center_id,t.id)=(v.center_id,v.token_id)
   WHERE v.center_id=NEW.center_id AND v.id=NEW.visit_id AND v.member_id=NEW.member_id AND t.pass_id=NEW.pass_id AND t.consumed_at=v.visited_at)
  THEN RAISE EXCEPTION 'pass admission mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 NEW.used_on=local_day;NEW.actor_uid=centers.actor_uid();NEW.created_at=clock_timestamp();RETURN NEW;
END $$;
-- Each renewal must point to its own fully settled receipt (or a genuine zero-price contract).
CREATE FUNCTION centers.check_renewal() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE local_day date; terms record; month_start date; expected_end date; expected_start date; offset_months integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('ft-gym-center:'||NEW.center_id));
 SELECT (clock_timestamp() AT TIME ZONE timezone)::date INTO local_day FROM centers.centers WHERE id=NEW.center_id AND state='active';
 SELECT s.*,v.interval_months INTO terms FROM centers.subscriptions s JOIN centers.membership_plan_versions v ON (v.center_id,v.id)=(s.center_id,s.price_version_id)
  WHERE s.center_id=NEW.center_id AND s.member_id=NEW.member_id AND s.id=NEW.subscription_id AND s.canceled_at IS NULL;
 IF terms.id IS NULL OR local_day IS NULL THEN RAISE EXCEPTION 'renewal contract required' USING ERRCODE='23514'; END IF;
 month_start=date_trunc('month',NEW.period_start)::date;
 expected_start=month_start+least(terms.billing_day,extract(day FROM month_start+interval '1 month'-interval '1 day')::integer)-1;
 month_start=(month_start+make_interval(months=>terms.interval_months))::date;
 expected_end=month_start+least(terms.billing_day,extract(day FROM month_start+interval '1 month'-interval '1 day')::integer)-1;
 offset_months=(extract(year FROM NEW.period_start)-extract(year FROM terms.anchor_on))*12+extract(month FROM NEW.period_start)-extract(month FROM terms.anchor_on);
 IF NEW.renewal_month<>date_trunc('month',local_day)::date OR NEW.period_start<>expected_start OR NEW.period_end<>expected_end OR NEW.period_start<terms.anchor_on OR offset_months%terms.interval_months<>0
   OR NEW.period_start>local_day OR NEW.period_end<=local_day OR terms.starts_on>local_day OR (terms.ends_on IS NOT NULL AND terms.ends_on<=local_day)
 THEN RAISE EXCEPTION 'renewal calendar changed' USING ERRCODE='23514'; END IF;
 IF NEW.payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM centers.payments p JOIN centers.payment_allocations a ON (a.center_id,a.payment_id)=(p.center_id,p.id) WHERE p.center_id=NEW.center_id AND p.member_id=NEW.member_id AND p.id=NEW.payment_id AND p.method='cash' AND p.paid_on=local_day AND a.receipt_id=NEW.receipt_id)
 THEN RAISE EXCEPTION 'renewal cash allocation required' USING ERRCODE='23514'; END IF;
 IF NEW.receipt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM centers.receipts r WHERE r.center_id=NEW.center_id AND r.member_id=NEW.member_id AND r.subscription_id=NEW.subscription_id AND r.id=NEW.receipt_id
   AND r.period_start=NEW.period_start AND r.period_end=NEW.period_end AND r.total_minor=coalesce((SELECT sum(a.amount_minor) FROM centers.payment_allocations a WHERE a.center_id=r.center_id AND a.receipt_id=r.id),0)-coalesce((SELECT sum(f.amount_minor) FROM centers.refunds f WHERE f.center_id=r.center_id AND f.receipt_id=r.id),0))
 THEN RAISE EXCEPTION 'renewal receipt must be settled' USING ERRCODE='23514'; END IF;
 IF NEW.receipt_id IS NULL AND NOT EXISTS(SELECT 1 FROM centers.subscriptions s JOIN centers.membership_plan_versions v ON (v.center_id,v.id)=(s.center_id,s.price_version_id) WHERE s.center_id=NEW.center_id AND s.member_id=NEW.member_id AND s.id=NEW.subscription_id AND (v.price_minor=0 OR s.discount_basis_points=10000))
 THEN RAISE EXCEPTION 'renewal receipt required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER check_renewal BEFORE INSERT ON centers.renewals FOR EACH ROW EXECUTE FUNCTION centers.check_renewal();
REVOKE ALL ON FUNCTION centers.check_renewal() FROM PUBLIC;
