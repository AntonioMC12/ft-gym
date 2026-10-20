CREATE POLICY community_grants_manage_read ON centers.community_grants FOR SELECT TO centers_app USING(centers.community_manage(center_id));
ALTER TABLE centers.community_assignments NO FORCE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION centers.community_thread_access(cid text,tid text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT centers.community_access(cid) AND EXISTS(SELECT 1 FROM centers.community_threads t LEFT JOIN centers.community_assignments a ON a.center_id=t.center_id AND a.member_id=t.member_id WHERE t.center_id=cid AND t.id=tid AND
 (centers.is_platform() OR centers.community_member(cid,t.member_id,t.recipient_uid) OR
 (centers.community_staff_for(cid,centers.actor_uid()) AND EXISTS(SELECT 1 FROM centers.members m WHERE m.center_id=cid AND m.id=t.member_id AND m.account_uid=t.recipient_uid) AND
 (a.trainer_uid IS NULL OR a.trainer_uid=centers.actor_uid() OR NOT centers.community_staff_for(cid,a.trainer_uid) OR centers.community_manage(cid)))))
$$;
DROP POLICY community_messages_insert ON centers.community_messages;
CREATE POLICY community_messages_insert ON centers.community_messages FOR INSERT TO centers_app WITH CHECK(
 centers.community_thread_access(center_id,thread_id) AND author_uid=centers.actor_uid() AND NOT deleted AND version=1 AND EXISTS(
 SELECT 1 FROM centers.community_threads t WHERE t.center_id=community_messages.center_id AND t.id=thread_id AND
 ((side='member' AND t.recipient_uid=centers.actor_uid()) OR (side='team' AND t.recipient_uid<>centers.actor_uid() AND (centers.is_platform() OR centers.community_staff_for(t.center_id,centers.actor_uid()))))));
ALTER TABLE centers.community_messages ADD CONSTRAINT community_message_parent UNIQUE(center_id,thread_id,id);
ALTER TABLE centers.community_message_history ADD CONSTRAINT community_history_parent FOREIGN KEY(center_id,thread_id,message_id) REFERENCES centers.community_messages(center_id,thread_id,id);
CREATE INDEX community_commands_rate ON centers.community_commands(center_id,actor_uid,created_at DESC);
CREATE INDEX community_message_page ON centers.community_messages(center_id,thread_id,created_at DESC,id DESC);
CREATE INDEX community_notice_page ON centers.community_notices(center_id,pinned DESC,created_at DESC,id DESC);
CREATE INDEX community_publication_page ON centers.community_publications(center_id,created_at DESC,id DESC);
