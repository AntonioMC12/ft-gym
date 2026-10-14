-- Own contact verification must be able to check whether the selected center
-- accepts notices. Policy contains no credentials, addresses or message bodies.
CREATE POLICY notification_policy_own_read ON centers.notification_policies FOR SELECT TO centers_app USING(
  center_id=centers.selected_center() AND EXISTS(
    SELECT 1 FROM centers.members m WHERE m.center_id=notification_policies.center_id AND m.account_uid=centers.actor_uid()
  )
);
