-- Assignment metadata follows the selected center and current community delegation too.
DROP POLICY community_assignments_read ON centers.community_assignments;
CREATE POLICY community_assignments_read ON centers.community_assignments FOR SELECT TO centers_app USING(center_id=centers.selected_center() AND centers.community_access(center_id) AND (centers.community_manage(center_id) OR centers.community_member(center_id,member_id,centers.actor_uid()) OR (trainer_uid=centers.actor_uid() AND centers.community_staff_for(center_id,centers.actor_uid()))));
