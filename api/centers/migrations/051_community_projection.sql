-- Bind the narrow public badge projection to the exact opted-in publication.
CREATE OR REPLACE FUNCTION centers.community_badge(cid text,aid text,pid text) RETURNS TABLE(badge text,earned_on date) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT a.badge,a.earned_on FROM centers.community_achievements a JOIN centers.community_publications p ON p.center_id=a.center_id AND p.achievement_id=a.id WHERE a.center_id=cid AND a.id=aid AND p.id=pid AND centers.community_public(cid,pid)
$$;
