CREATE OR REPLACE FUNCTION centers.community_staff_for(cid text,uid text,management boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT cid=centers.selected_center() AND NOT (coalesce(nullif(current_setting('centers.community_disabled',true),''),'[]')::jsonb ? uid) AND EXISTS(SELECT 1 FROM centers.community_grants g JOIN centers.role_assignments r ON r.center_id=g.center_id AND r.account_uid=g.account_uid
 WHERE g.center_id=cid AND g.account_uid=uid AND NOT g.revoked AND (g.valid_until IS NULL OR g.valid_until>statement_timestamp())
 AND (CASE WHEN management THEN g.manage ELSE g.respond OR g.manage END) AND r.role IN ('manager','trainer') AND r.revoked_at IS NULL
 AND r.valid_from<=statement_timestamp() AND (r.valid_until IS NULL OR r.valid_until>statement_timestamp()))
$$;

CREATE TABLE centers.community_badge_definitions(badge text NOT NULL,version integer NOT NULL,metric text NOT NULL,threshold integer NOT NULL CHECK(threshold>0),PRIMARY KEY(badge,version));
INSERT INTO centers.community_badge_definitions VALUES('first-session',1,'completed-session-count',1),('ten-sessions',1,'completed-session-count',10),('four-weeks',1,'consecutive-monday-weeks',4),('first-record',1,'saved-personal-record',1);
ALTER TABLE centers.community_badge_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.community_badge_definitions NO FORCE ROW LEVEL SECURITY;
CREATE POLICY community_catalog_read ON centers.community_badge_definitions FOR SELECT TO centers_app USING(centers.community_access(centers.selected_center()));
GRANT SELECT ON centers.community_badge_definitions TO centers_app;
ALTER TABLE centers.community_achievements ADD CONSTRAINT community_badge_definition FOREIGN KEY(badge,definition) REFERENCES centers.community_badge_definitions(badge,version);

GRANT UPDATE(nickname) ON centers.community_publications TO centers_app;
