\set QUIET on
begin;
create temp table r(n int, ok text);
grant all on r to authenticated;
select e.created_by as uid, e.id as eid into temp x from public.expenses e where e.deleted_at is null
  and exists (select 1 from public.groups g where g.id=e.group_id and g.archived_at is null)
  and not exists (select 1 from public.expense_splits s join public.group_members m on m.id=s.member_id where s.expense_id=e.id and m.left_at is not null)
  order by e.created_at desc limit 1;
grant select on x to authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select uid from x), 'role','authenticated')::text, true);
set local role authenticated;
update public.profiles set upi_id='alice@okaxis' where id=auth.uid();
insert into r select 1, (select case when upi_id='alice@okaxis' and not upi_opt_out then 'pass' else 'FAIL' end from public.profiles where id=auth.uid());
do $$ begin update public.profiles set upi_id=null where id=auth.uid(); insert into r values (2,'FAIL cleared'); exception when check_violation then insert into r values (2,'pass'); end $$;
do $$ begin update public.profiles set upi_id='   ' where id=auth.uid(); insert into r values (3,'FAIL blank'); exception when check_violation then insert into r values (3,'pass'); end $$;
update public.profiles set upi_opt_out=true where id=auth.uid();
insert into r select 4, (select case when upi_id is null and upi_opt_out then 'pass' else 'FAIL' end from public.profiles where id=auth.uid());
update public.profiles set upi_id='alice@okicici' where id=auth.uid();
insert into r select 5, (select case when upi_id='alice@okicici' and not upi_opt_out then 'pass' else 'FAIL' end from public.profiles where id=auth.uid());
update public.profiles set name='Still fine' where id=auth.uid();
insert into r values (6,'pass');
do $$ begin perform public.set_my_phone(null); insert into r values (7,'FAIL phone cleared'); exception when check_violation then insert into r values (7,'pass'); end $$;
do $$ begin perform public.set_my_phone('+919876500099'); insert into r values (8,'pass'); end $$;
do $$
declare v_e public.expenses; v_m uuid; v_m2 uuid; p jsonb;
begin
  select * into v_e from public.expenses where id=(select eid from x);
  select member_id into v_m from public.expense_payers where expense_id=v_e.id limit 1;
  perform public.update_expense(v_e.id, v_e.title, v_e.amount, v_e.currency, v_e.fx_rate_to_base, v_e.category, v_e.date, v_e.note, 'exact',
    jsonb_build_array(jsonb_build_object('member_id', v_m, 'amount', v_e.amount_base)),
    jsonb_build_array(jsonb_build_object('member_id', v_m, 'amount', v_e.amount_base)));
  select payload into p from public.activity where entity_id=v_e.id and kind='expense_updated' order by created_at desc limit 1;
  insert into r values (9, case when p ? 'previous_splits' and jsonb_typeof(p->'previous_splits')='object' and (select count(*) from jsonb_object_keys(p->'previous_splits'))>=1 then 'pass' else 'FAIL '||coalesce(p::text,'null') end);
end $$;
reset role;
select * from r order by n;
rollback;
