CREATE FUNCTION centers.owns_member(target_center text,target_member text) RETURNS boolean LANGUAGE sql STABLE
  SET search_path=pg_catalog AS $$
  SELECT target_center=centers.selected_center() AND EXISTS(SELECT 1 FROM centers.members m
    WHERE m.center_id=target_center AND m.id=target_member AND m.account_uid=centers.actor_uid())
$$;
CREATE POLICY subscription_own_read ON centers.subscriptions FOR SELECT TO centers_app USING(centers.owns_member(center_id,member_id));
CREATE POLICY receipt_own_read ON centers.receipts FOR SELECT TO centers_app USING(centers.owns_member(center_id,member_id));
CREATE POLICY payment_own_read ON centers.payments FOR SELECT TO centers_app USING(centers.owns_member(center_id,member_id));
CREATE POLICY allocation_own_read ON centers.payment_allocations FOR SELECT TO centers_app USING(centers.owns_member(center_id,member_id));
CREATE POLICY refund_own_read ON centers.refunds FOR SELECT TO centers_app USING(centers.owns_member(center_id,member_id));
-- Only contracted prices, no administrative catalog browsing.
CREATE POLICY price_own_read ON centers.membership_plan_versions FOR SELECT TO centers_app USING(
  center_id=centers.selected_center() AND EXISTS(SELECT 1 FROM centers.subscriptions s
    WHERE s.center_id=membership_plan_versions.center_id AND s.price_version_id=membership_plan_versions.id AND centers.owns_member(s.center_id,s.member_id)));
REVOKE ALL ON FUNCTION centers.owns_member(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION centers.owns_member(text,text) TO centers_app;
-- Existing write policies stay administrative. Ended/inactive history remains readable.
