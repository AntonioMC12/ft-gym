-- Installed only by the dedicated disposable recovery Compose, outside the restored schema.
CREATE TABLE public.centers_recovery_guard (
  singleton boolean PRIMARY KEY CHECK(singleton),
  kind text NOT NULL CHECK(kind='test'),
  database_name text NOT NULL CHECK(database_name IN ('ft_gym_centers_test_recovery_source','ft_gym_centers_test_recovery_target'))
);
INSERT INTO public.centers_recovery_guard VALUES(true,'test',current_database());
REVOKE ALL ON public.centers_recovery_guard FROM PUBLIC;
GRANT SELECT ON public.centers_recovery_guard TO centers_app,centers_migrator;
