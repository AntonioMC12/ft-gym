-- C57: private center conversations, official notices and opt-in achievement publications.
CREATE TABLE centers.community_grants(center_id text NOT NULL REFERENCES centers.centers(id),account_uid text NOT NULL,
 respond boolean NOT NULL DEFAULT true,manage boolean NOT NULL DEFAULT false,valid_until timestamptz,revoked boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),PRIMARY KEY(center_id,account_uid));
-- Like role metadata, the owner may read permission rows only through the narrow definer function.
ALTER TABLE centers.community_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_grants_read ON centers.community_grants FOR SELECT TO centers_app USING(center_id=centers.selected_center() AND (centers.is_platform() OR account_uid=centers.actor_uid()));
CREATE POLICY community_grants_write ON centers.community_grants FOR ALL TO centers_app USING(centers.is_platform() AND center_id=centers.selected_center()) WITH CHECK(centers.is_platform() AND center_id=centers.selected_center());
GRANT SELECT,INSERT,UPDATE ON centers.community_grants TO centers_app;
CREATE FUNCTION centers.community_staff_for(cid text,uid text,management boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT cid=centers.selected_center() AND EXISTS(SELECT 1 FROM centers.community_grants g JOIN centers.role_assignments r ON r.center_id=g.center_id AND r.account_uid=g.account_uid
 WHERE g.center_id=cid AND g.account_uid=uid AND NOT g.revoked AND (g.valid_until IS NULL OR g.valid_until>statement_timestamp())
 AND (CASE WHEN management THEN g.manage ELSE g.respond OR g.manage END) AND r.role IN ('manager','trainer') AND r.revoked_at IS NULL
 AND r.valid_from<=statement_timestamp() AND (r.valid_until IS NULL OR r.valid_until>statement_timestamp()))
$$;
REVOKE ALL ON FUNCTION centers.community_staff_for(text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION centers.community_staff_for(text,text,boolean) TO centers_app;
CREATE FUNCTION centers.community_member(cid text,mid text,uid text) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT cid=centers.selected_center() AND uid=centers.actor_uid() AND EXISTS(SELECT 1 FROM centers.members m WHERE m.center_id=cid AND m.id=mid AND m.account_uid=uid AND m.state<>'ended')
$$;
CREATE FUNCTION centers.community_access(cid text) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT cid=centers.selected_center() AND EXISTS(SELECT 1 FROM centers.centers c WHERE c.id=cid AND c.state='active') AND
 (centers.is_platform() OR centers.community_staff_for(cid,centers.actor_uid()) OR EXISTS(SELECT 1 FROM centers.members m WHERE m.center_id=cid AND centers.community_member(cid,m.id,centers.actor_uid())))
$$;
CREATE FUNCTION centers.community_manage(cid text) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT centers.community_access(cid) AND (centers.is_platform() OR centers.community_staff_for(cid,centers.actor_uid(),true))
$$;
CREATE TABLE centers.community_assignments(center_id text NOT NULL,member_id text NOT NULL,trainer_uid text,version integer NOT NULL DEFAULT 1 CHECK(version>0),
 PRIMARY KEY(center_id,member_id),FOREIGN KEY(center_id,member_id) REFERENCES centers.members(center_id,id),FOREIGN KEY(center_id,trainer_uid) REFERENCES centers.community_grants(center_id,account_uid));
CREATE TABLE centers.community_threads(id text PRIMARY KEY,center_id text NOT NULL,member_id text NOT NULL,recipient_uid text NOT NULL,trainer_uid text,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 120),state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','answered','closed')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),last_seq integer NOT NULL DEFAULT 0 CHECK(last_seq>=0),context jsonb NOT NULL DEFAULT '{}' CHECK(octet_length(context::text)<=32768),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(center_id,id),FOREIGN KEY(center_id,member_id) REFERENCES centers.members(center_id,id),FOREIGN KEY(center_id,trainer_uid) REFERENCES centers.community_grants(center_id,account_uid));
CREATE INDEX community_thread_page ON centers.community_threads(center_id,updated_at DESC,id DESC);
CREATE FUNCTION centers.community_thread_access(cid text,tid text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT centers.community_access(cid) AND EXISTS(SELECT 1 FROM centers.community_threads t WHERE t.center_id=cid AND t.id=tid AND
 (centers.is_platform() OR centers.community_member(cid,t.member_id,t.recipient_uid) OR
 (centers.community_staff_for(cid,centers.actor_uid()) AND EXISTS(SELECT 1 FROM centers.members m WHERE m.center_id=cid AND m.id=t.member_id AND m.account_uid=t.recipient_uid) AND
 (t.trainer_uid IS NULL OR t.trainer_uid=centers.actor_uid() OR NOT centers.community_staff_for(cid,t.trainer_uid) OR centers.community_manage(cid)))))
$$;
-- Permission lookup must not recurse through the thread RLS policy. The owner has only this narrowly scoped lookup.
ALTER TABLE centers.community_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_thread_read ON centers.community_threads FOR SELECT TO centers_app USING(centers.community_thread_access(center_id,id));
CREATE POLICY community_thread_insert ON centers.community_threads FOR INSERT TO centers_app WITH CHECK(centers.community_access(center_id) AND centers.community_member(center_id,member_id,recipient_uid) AND state='pending' AND version=1 AND last_seq=0);
CREATE POLICY community_thread_update ON centers.community_threads FOR UPDATE TO centers_app USING(centers.community_thread_access(center_id,id)) WITH CHECK(centers.community_thread_access(center_id,id));
GRANT SELECT,INSERT ON centers.community_threads TO centers_app;
GRANT UPDATE(state,version,last_seq,updated_at) ON centers.community_threads TO centers_app;
CREATE TABLE centers.community_messages(id text PRIMARY KEY,center_id text NOT NULL,thread_id text NOT NULL,author_uid text NOT NULL,side text NOT NULL CHECK(side IN ('member','team')),
 seq integer NOT NULL CHECK(seq>0),body text NOT NULL CHECK(length(body)<=1000),deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(center_id,id),UNIQUE(thread_id,seq),FOREIGN KEY(center_id,thread_id) REFERENCES centers.community_threads(center_id,id));
CREATE TABLE centers.community_message_history(id text PRIMARY KEY,center_id text NOT NULL,thread_id text NOT NULL,message_id text NOT NULL,actor_uid text NOT NULL,version integer NOT NULL,body text NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(center_id,message_id) REFERENCES centers.community_messages(center_id,id),FOREIGN KEY(center_id,thread_id) REFERENCES centers.community_threads(center_id,id));
CREATE TABLE centers.community_reads(center_id text NOT NULL,thread_id text NOT NULL,account_uid text NOT NULL,last_seq integer NOT NULL DEFAULT 0 CHECK(last_seq>=0),PRIMARY KEY(thread_id,account_uid),FOREIGN KEY(center_id,thread_id) REFERENCES centers.community_threads(center_id,id));
CREATE TABLE centers.community_notices(id text PRIMARY KEY,center_id text NOT NULL REFERENCES centers.centers(id),author_uid text NOT NULL,title text NOT NULL CHECK(length(title) BETWEEN 1 AND 120),body text NOT NULL CHECK(length(body) BETWEEN 1 AND 3000),
 state text NOT NULL CHECK(state IN ('draft','published','archived')),pinned boolean NOT NULL DEFAULT false,starts_on date NOT NULL,ends_on date,CHECK(ends_on IS NULL OR ends_on>=starts_on),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(center_id,id));
CREATE TABLE centers.community_notice_reads(center_id text NOT NULL,notice_id text NOT NULL,account_uid text NOT NULL,version integer NOT NULL CHECK(version>0),PRIMARY KEY(notice_id,account_uid),FOREIGN KEY(center_id,notice_id) REFERENCES centers.community_notices(center_id,id));
CREATE TABLE centers.community_preferences(center_id text NOT NULL,member_id text NOT NULL,recipient_uid text NOT NULL,enabled boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1 CHECK(version>0),PRIMARY KEY(center_id,recipient_uid),UNIQUE(center_id,member_id,recipient_uid),FOREIGN KEY(center_id,member_id) REFERENCES centers.members(center_id,id));
CREATE TABLE centers.community_achievements(id text PRIMARY KEY,center_id text NOT NULL,member_id text NOT NULL,recipient_uid text NOT NULL,badge text NOT NULL CHECK(badge IN ('first-session','ten-sessions','four-weeks','first-record')),definition integer NOT NULL DEFAULT 1 CHECK(definition=1),
 active boolean NOT NULL DEFAULT true,earned_on date NOT NULL,version integer NOT NULL DEFAULT 1 CHECK(version>0),source_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(center_id,id),UNIQUE(center_id,id,member_id,recipient_uid),UNIQUE(center_id,recipient_uid,badge),FOREIGN KEY(center_id,member_id) REFERENCES centers.members(center_id,id));
CREATE TABLE centers.community_publications(id text PRIMARY KEY,center_id text NOT NULL,achievement_id text NOT NULL,member_id text NOT NULL,recipient_uid text NOT NULL,nickname text NOT NULL CHECK(length(nickname) BETWEEN 1 AND 40),
 active boolean NOT NULL DEFAULT true,removed boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(center_id,id),UNIQUE(achievement_id),FOREIGN KEY(center_id,achievement_id,member_id,recipient_uid) REFERENCES centers.community_achievements(center_id,id,member_id,recipient_uid),FOREIGN KEY(center_id,member_id) REFERENCES centers.members(center_id,id));
CREATE FUNCTION centers.community_public(cid text,pid text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT centers.community_access(cid) AND EXISTS(SELECT 1 FROM centers.community_publications p JOIN centers.community_achievements a ON a.center_id=p.center_id AND a.id=p.achievement_id
 JOIN centers.community_preferences f ON f.center_id=p.center_id AND f.member_id=p.member_id AND f.recipient_uid=p.recipient_uid
 JOIN centers.members m ON m.center_id=p.center_id AND m.id=p.member_id AND m.account_uid=p.recipient_uid
 WHERE p.center_id=cid AND p.id=pid AND p.active AND NOT p.removed AND a.active AND f.enabled AND m.state<>'ended')
$$;
CREATE TABLE centers.community_reactions(center_id text NOT NULL,publication_id text NOT NULL,account_uid text NOT NULL,kind text NOT NULL CHECK(kind IN ('clap','strength','fire','party','heart')),active boolean NOT NULL DEFAULT true,PRIMARY KEY(publication_id,account_uid,kind),FOREIGN KEY(center_id,publication_id) REFERENCES centers.community_publications(center_id,id));
CREATE TABLE centers.community_hidden(center_id text NOT NULL,publication_id text NOT NULL,account_uid text NOT NULL,hidden boolean NOT NULL DEFAULT true,PRIMARY KEY(publication_id,account_uid),FOREIGN KEY(center_id,publication_id) REFERENCES centers.community_publications(center_id,id));
CREATE TABLE centers.community_congratulations(id text PRIMARY KEY,center_id text NOT NULL,publication_id text NOT NULL,account_uid text NOT NULL,body text NOT NULL CHECK(length(body) BETWEEN 1 AND 280),deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(center_id,publication_id) REFERENCES centers.community_publications(center_id,id));
CREATE TABLE centers.community_commands(center_id text NOT NULL REFERENCES centers.centers(id),actor_uid text NOT NULL,request_id text NOT NULL,body_hash text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(center_id,actor_uid,request_id));
CREATE TABLE centers.community_audit(id text PRIMARY KEY,center_id text NOT NULL REFERENCES centers.centers(id),actor_uid text NOT NULL,action text NOT NULL,target_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE centers.community_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.community_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY community_assignments_read ON centers.community_assignments FOR SELECT TO centers_app USING(centers.community_manage(center_id) OR centers.community_member(center_id,member_id,centers.actor_uid()) OR trainer_uid=centers.actor_uid());
CREATE POLICY community_assignments_insert ON centers.community_assignments FOR INSERT TO centers_app WITH CHECK(centers.community_manage(center_id));
GRANT SELECT,INSERT ON centers.community_assignments TO centers_app;
CREATE POLICY community_assignments_update ON centers.community_assignments FOR UPDATE TO centers_app USING(centers.community_manage(center_id)) WITH CHECK(centers.community_manage(center_id));
GRANT UPDATE(trainer_uid,version) ON centers.community_assignments TO centers_app;
ALTER TABLE centers.community_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.community_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY community_messages_read ON centers.community_messages FOR SELECT TO centers_app USING(centers.community_thread_access(center_id,thread_id));
CREATE POLICY community_messages_insert ON centers.community_messages FOR INSERT TO centers_app WITH CHECK(centers.community_thread_access(center_id,thread_id) AND author_uid=centers.actor_uid() AND NOT deleted AND version=1);
GRANT SELECT,INSERT ON centers.community_messages TO centers_app;
CREATE POLICY community_messages_update ON centers.community_messages FOR UPDATE TO centers_app USING(centers.community_thread_access(center_id,thread_id) AND (author_uid=centers.actor_uid() OR centers.community_manage(center_id))) WITH CHECK(centers.community_thread_access(center_id,thread_id) AND (author_uid=centers.actor_uid() OR centers.community_manage(center_id)));
GRANT UPDATE(body,deleted,version) ON centers.community_messages TO centers_app;
ALTER TABLE centers.community_message_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.community_message_history FORCE ROW LEVEL SECURITY;
CREATE POLICY community_message_history_read ON centers.community_message_history FOR SELECT TO centers_app USING(centers.community_thread_access(center_id,thread_id));
CREATE POLICY community_message_history_insert ON centers.community_message_history FOR INSERT TO centers_app WITH CHECK(centers.community_thread_access(center_id,thread_id) AND actor_uid=centers.actor_uid());
GRANT SELECT,INSERT ON centers.community_message_history TO centers_app;
ALTER TABLE centers.community_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.community_reads FORCE ROW LEVEL SECURITY;
CREATE POLICY community_reads_read ON centers.community_reads FOR SELECT TO centers_app USING(centers.community_thread_access(center_id,thread_id) AND account_uid=centers.actor_uid());
CREATE POLICY community_reads_insert ON centers.community_reads FOR INSERT TO centers_app WITH CHECK(centers.community_thread_access(center_id,thread_id) AND account_uid=centers.actor_uid());
GRANT SELECT,INSERT ON centers.community_reads TO centers_app;
CREATE POLICY community_reads_update ON centers.community_reads FOR UPDATE TO centers_app USING(centers.community_thread_access(center_id,thread_id) AND account_uid=centers.actor_uid()) WITH CHECK(centers.community_thread_access(center_id,thread_id) AND account_uid=centers.actor_uid());
GRANT UPDATE(last_seq) ON centers.community_reads TO centers_app;
ALTER TABLE centers.community_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.community_notices FORCE ROW LEVEL SECURITY;
CREATE POLICY community_notices_read ON centers.community_notices FOR SELECT TO centers_app USING(centers.community_access(center_id) AND (centers.community_manage(center_id) OR (state='published' AND starts_on<=(statement_timestamp() AT TIME ZONE (SELECT timezone FROM centers.centers WHERE id=center_id))::date AND (ends_on IS NULL OR ends_on>=(statement_timestamp() AT TIME ZONE (SELECT timezone FROM centers.centers WHERE id=center_id))::date))));
CREATE POLICY community_notices_insert ON centers.community_notices FOR INSERT TO centers_app WITH CHECK(centers.community_manage(center_id) AND author_uid=centers.actor_uid());
GRANT SELECT,INSERT ON centers.community_notices TO centers_app;
CREATE POLICY community_notices_update ON centers.community_notices FOR UPDATE TO centers_app USING(centers.community_manage(center_id)) WITH CHECK(centers.community_manage(center_id));
GRANT UPDATE(title,body,state,pinned,starts_on,ends_on,version) ON centers.community_notices TO centers_app;
ALTER TABLE centers.community_notice_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.community_notice_reads FORCE ROW LEVEL SECURITY;
CREATE POLICY community_notice_reads_read ON centers.community_notice_reads FOR SELECT TO centers_app USING(centers.community_access(center_id) AND account_uid=centers.actor_uid());
CREATE POLICY community_notice_reads_insert ON centers.community_notice_reads FOR INSERT TO centers_app WITH CHECK(centers.community_access(center_id) AND account_uid=centers.actor_uid());
GRANT SELECT,INSERT ON centers.community_notice_reads TO centers_app;
CREATE POLICY community_notice_reads_update ON centers.community_notice_reads FOR UPDATE TO centers_app USING(centers.community_access(center_id) AND account_uid=centers.actor_uid()) WITH CHECK(centers.community_access(center_id) AND account_uid=centers.actor_uid());
GRANT UPDATE(version) ON centers.community_notice_reads TO centers_app;
ALTER TABLE centers.community_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY community_preferences_read ON centers.community_preferences FOR SELECT TO centers_app USING(centers.community_access(center_id) AND centers.community_member(center_id,member_id,recipient_uid));
CREATE POLICY community_preferences_insert ON centers.community_preferences FOR INSERT TO centers_app WITH CHECK(centers.community_access(center_id) AND centers.community_member(center_id,member_id,recipient_uid));
GRANT SELECT,INSERT ON centers.community_preferences TO centers_app;
CREATE POLICY community_preferences_update ON centers.community_preferences FOR UPDATE TO centers_app USING(centers.community_access(center_id) AND centers.community_member(center_id,member_id,recipient_uid)) WITH CHECK(centers.community_access(center_id) AND centers.community_member(center_id,member_id,recipient_uid));
GRANT UPDATE(enabled,version) ON centers.community_preferences TO centers_app;
ALTER TABLE centers.community_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY community_achievements_read ON centers.community_achievements FOR SELECT TO centers_app USING(centers.community_access(center_id) AND centers.community_member(center_id,member_id,recipient_uid));
CREATE POLICY community_achievements_insert ON centers.community_achievements FOR INSERT TO centers_app WITH CHECK(centers.community_access(center_id) AND centers.community_member(center_id,member_id,recipient_uid));
GRANT SELECT,INSERT ON centers.community_achievements TO centers_app;
CREATE POLICY community_achievements_update ON centers.community_achievements FOR UPDATE TO centers_app USING(centers.community_access(center_id) AND centers.community_member(center_id,member_id,recipient_uid)) WITH CHECK(centers.community_access(center_id) AND centers.community_member(center_id,member_id,recipient_uid));
GRANT UPDATE(active,earned_on,source_hash,version) ON centers.community_achievements TO centers_app;
ALTER TABLE centers.community_publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_publications_read ON centers.community_publications FOR SELECT TO centers_app USING(centers.community_access(center_id) AND (centers.community_member(center_id,member_id,recipient_uid) OR centers.community_manage(center_id) OR centers.community_public(center_id,id)));
CREATE POLICY community_publications_insert ON centers.community_publications FOR INSERT TO centers_app WITH CHECK(centers.community_access(center_id) AND centers.community_member(center_id,member_id,recipient_uid));
GRANT SELECT,INSERT ON centers.community_publications TO centers_app;
CREATE POLICY community_publications_update ON centers.community_publications FOR UPDATE TO centers_app USING(centers.community_access(center_id) AND (centers.community_member(center_id,member_id,recipient_uid) OR centers.community_manage(center_id))) WITH CHECK(centers.community_access(center_id) AND (centers.community_member(center_id,member_id,recipient_uid) OR centers.community_manage(center_id)));
GRANT UPDATE(active,removed,version) ON centers.community_publications TO centers_app;
ALTER TABLE centers.community_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.community_reactions FORCE ROW LEVEL SECURITY;
CREATE POLICY community_reactions_read ON centers.community_reactions FOR SELECT TO centers_app USING(centers.community_public(center_id,publication_id));
CREATE POLICY community_reactions_insert ON centers.community_reactions FOR INSERT TO centers_app WITH CHECK(centers.community_public(center_id,publication_id) AND account_uid=centers.actor_uid());
GRANT SELECT,INSERT ON centers.community_reactions TO centers_app;
CREATE POLICY community_reactions_update ON centers.community_reactions FOR UPDATE TO centers_app USING(centers.community_public(center_id,publication_id) AND account_uid=centers.actor_uid()) WITH CHECK(centers.community_public(center_id,publication_id) AND account_uid=centers.actor_uid());
GRANT UPDATE(active) ON centers.community_reactions TO centers_app;
ALTER TABLE centers.community_hidden ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.community_hidden FORCE ROW LEVEL SECURITY;
CREATE POLICY community_hidden_read ON centers.community_hidden FOR SELECT TO centers_app USING(centers.community_public(center_id,publication_id) AND account_uid=centers.actor_uid());
CREATE POLICY community_hidden_insert ON centers.community_hidden FOR INSERT TO centers_app WITH CHECK(centers.community_public(center_id,publication_id) AND account_uid=centers.actor_uid());
GRANT SELECT,INSERT ON centers.community_hidden TO centers_app;
CREATE POLICY community_hidden_update ON centers.community_hidden FOR UPDATE TO centers_app USING(centers.community_access(center_id) AND account_uid=centers.actor_uid()) WITH CHECK(centers.community_access(center_id) AND account_uid=centers.actor_uid());
GRANT UPDATE(hidden) ON centers.community_hidden TO centers_app;
ALTER TABLE centers.community_congratulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.community_congratulations FORCE ROW LEVEL SECURITY;
CREATE POLICY community_congratulations_read ON centers.community_congratulations FOR SELECT TO centers_app USING(centers.community_public(center_id,publication_id));
CREATE POLICY community_congratulations_insert ON centers.community_congratulations FOR INSERT TO centers_app WITH CHECK(centers.community_public(center_id,publication_id) AND account_uid=centers.actor_uid());
GRANT SELECT,INSERT ON centers.community_congratulations TO centers_app;
CREATE POLICY community_congratulations_update ON centers.community_congratulations FOR UPDATE TO centers_app USING(centers.community_public(center_id,publication_id) AND (account_uid=centers.actor_uid() OR centers.community_manage(center_id))) WITH CHECK(centers.community_public(center_id,publication_id) AND (account_uid=centers.actor_uid() OR centers.community_manage(center_id)));
GRANT UPDATE(deleted,version) ON centers.community_congratulations TO centers_app;
ALTER TABLE centers.community_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.community_commands FORCE ROW LEVEL SECURITY;
CREATE POLICY community_commands_read ON centers.community_commands FOR SELECT TO centers_app USING(centers.community_access(center_id) AND actor_uid=centers.actor_uid());
CREATE POLICY community_commands_insert ON centers.community_commands FOR INSERT TO centers_app WITH CHECK(centers.community_access(center_id) AND actor_uid=centers.actor_uid());
GRANT SELECT,INSERT ON centers.community_commands TO centers_app;
ALTER TABLE centers.community_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.community_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY community_audit_read ON centers.community_audit FOR SELECT TO centers_app USING(centers.community_access(center_id) AND (centers.community_manage(center_id) OR actor_uid=centers.actor_uid()));
CREATE POLICY community_audit_insert ON centers.community_audit FOR INSERT TO centers_app WITH CHECK(centers.community_access(center_id) AND actor_uid=centers.actor_uid());
GRANT SELECT,INSERT ON centers.community_audit TO centers_app;
REVOKE ALL ON FUNCTION centers.community_member(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION centers.community_member(text,text,text) TO centers_app;
REVOKE ALL ON FUNCTION centers.community_access(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION centers.community_access(text) TO centers_app;
REVOKE ALL ON FUNCTION centers.community_manage(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION centers.community_manage(text) TO centers_app;
REVOKE ALL ON FUNCTION centers.community_thread_access(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION centers.community_thread_access(text,text) TO centers_app;
REVOKE ALL ON FUNCTION centers.community_public(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION centers.community_public(text,text) TO centers_app;
CREATE FUNCTION centers.community_badge(cid text,aid text,pid text) RETURNS TABLE(badge text,earned_on date) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT a.badge,a.earned_on FROM centers.community_achievements a WHERE a.center_id=cid AND a.id=aid AND centers.community_public(cid,pid)
$$;
REVOKE ALL ON FUNCTION centers.community_badge(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION centers.community_badge(text,text,text) TO centers_app;
ALTER TABLE centers.account_references DROP CONSTRAINT account_references_source_check;
ALTER TABLE centers.account_references ADD CONSTRAINT account_references_source_check CHECK(source IN ('role','member','invite','activation','community'));
CREATE FUNCTION centers.community_reference() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO centers.account_references(center_id,account_uid,source,record_id) VALUES(NEW.center_id,NEW.recipient_uid,'community',NEW.id) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION centers.community_reference() FROM PUBLIC;
CREATE TRIGGER community_thread_reference AFTER INSERT ON centers.community_threads FOR EACH ROW EXECUTE FUNCTION centers.community_reference();

CREATE POLICY community_notice_summary_owner ON centers.community_notices FOR SELECT TO centers_migrator USING(centers.is_platform());
CREATE POLICY community_message_summary_owner ON centers.community_messages FOR SELECT TO centers_migrator USING(centers.is_platform());
CREATE POLICY community_read_summary_owner ON centers.community_reads FOR SELECT TO centers_migrator USING(centers.is_platform());
CREATE POLICY community_notice_read_summary_owner ON centers.community_notice_reads FOR SELECT TO centers_migrator USING(centers.is_platform());
CREATE FUNCTION centers.community_platform_summary() RETURNS TABLE(center_id text,name text,unread bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH counts AS (
 SELECT t.center_id,count(*) AS n FROM centers.community_threads t WHERE centers.is_platform() AND EXISTS(
 SELECT 1 FROM centers.community_messages m LEFT JOIN centers.community_reads r ON r.thread_id=t.id AND r.account_uid=centers.actor_uid()
 WHERE m.thread_id=t.id AND m.author_uid<>centers.actor_uid() AND m.seq>coalesce(r.last_seq,0)) GROUP BY t.center_id
 UNION ALL SELECT n.center_id,count(*) FROM centers.community_notices n LEFT JOIN centers.community_notice_reads r ON r.notice_id=n.id AND r.account_uid=centers.actor_uid()
 JOIN centers.centers c ON c.id=n.center_id WHERE centers.is_platform() AND n.state='published' AND n.starts_on<=(statement_timestamp() AT TIME ZONE c.timezone)::date
 AND (n.ends_on IS NULL OR n.ends_on>=(statement_timestamp() AT TIME ZONE c.timezone)::date) AND coalesce(r.version,0)<n.version GROUP BY n.center_id
 ) SELECT c.id,c.name,sum(k.n) FROM counts k JOIN centers.centers c ON c.id=k.center_id WHERE c.state='active' GROUP BY c.id,c.name ORDER BY sum(k.n) DESC,c.id
$$;
REVOKE ALL ON FUNCTION centers.community_platform_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION centers.community_platform_summary() TO centers_app;
