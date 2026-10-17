-- Monthly renewals use calendar months, independent of the stored historical billing day.
-- Historical subscriptions, receipts, payments and renewals are not rewritten.
CREATE OR REPLACE FUNCTION centers.check_renewal() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE local_day date; terms record; month_start date; expected_end date; expected_start date; offset_months integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('ft-gym-center:'||NEW.center_id));
 SELECT (clock_timestamp() AT TIME ZONE timezone)::date INTO local_day FROM centers.centers WHERE id=NEW.center_id AND state='active';
 SELECT s.*,v.interval_months INTO terms FROM centers.subscriptions s JOIN centers.membership_plan_versions v ON (v.center_id,v.id)=(s.center_id,s.price_version_id)
  WHERE s.center_id=NEW.center_id AND s.member_id=NEW.member_id AND s.id=NEW.subscription_id AND s.canceled_at IS NULL;
 IF terms.id IS NULL OR local_day IS NULL THEN RAISE EXCEPTION 'renewal contract required' USING ERRCODE='23514'; END IF;
 IF terms.interval_months=1 THEN terms.billing_day=1;terms.anchor_on=date_trunc('month',terms.anchor_on)::date; END IF;
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
