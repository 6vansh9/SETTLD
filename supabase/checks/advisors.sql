-- Supabase advisor-equivalent checks (security + performance). Run against any Settld database:
--   psql "$DB_URL" -f supabase/checks/advisors.sql      (every section should return 0 rows,
--   except 10: preview_invite and room_preview are public on purpose).

\echo '1. public tables without RLS'
select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;
\echo '2. RLS on but no policies'
select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity and not exists (select 1 from pg_policy p where p.polrelid=c.oid);
\echo '3. functions without a fixed search_path (public)'
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
\echo '4. foreign keys without an index'
select c.conrelid::regclass as tbl, a.attname as col from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
where c.contype='f' and c.connamespace='public'::regnamespace and array_length(c.conkey,1)=1
and not exists (select 1 from pg_index i where i.indrelid=c.conrelid and i.indkey[0]=c.conkey[1]) order by 1,2;
\echo '5. policies calling auth.uid()/auth.jwt() per row (not wrapped in select)'
select tablename, policyname from pg_policies where schemaname='public' and (coalesce(qual,'')||coalesce(with_check,'')) ~ 'auth\.(uid|jwt)\(\)' and (coalesce(qual,'')||coalesce(with_check,'')) !~* '\(\s*select\s+auth\.(uid|jwt)\(\)';
\echo '6. multiple permissive policies for the same role/action'
select tablename, cmd, roles, count(*) from pg_policies where schemaname='public' and permissive='PERMISSIVE' group by 1,2,3 having count(*)>1;
\echo '7. security definer views'
select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v' and not coalesce((select option_value='true' from pg_options_to_table(c.reloptions) where option_name='security_invoker'),false);
\echo '8. extensions in public'
select extname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where n.nspname='public';
\echo '9. tables in the realtime publication without RLS'
select pt.tablename from pg_publication_tables pt join pg_class c on c.relname=pt.tablename join pg_namespace n on n.oid=c.relnamespace and n.nspname=pt.schemaname where pt.pubname='supabase_realtime' and not c.relrowsecurity;
\echo '10. anon can execute security definer functions (public)'
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute') order by 1;
