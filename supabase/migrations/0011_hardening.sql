-- Milestone 9 quality pass: indexes for every foreign key that had none (Supabase performance
-- advisor "unindexed foreign keys"; several are used by RLS checks and cascades). Safe to re-run.
-- The other advisor checks (supabase/checks/advisors.sql) were already clean: RLS on every public
-- table, a fixed search_path on every function, auth.uid() wrapped in (select …) in policies,
-- no duplicate permissive policies, no security-definer views, no extensions in public.

create index if not exists groups_created_by_idx on public.groups (created_by);
create index if not exists group_members_added_by_idx on public.group_members (added_by);
create index if not exists invites_created_by_idx on public.invites (created_by);
create index if not exists expenses_created_by_idx on public.expenses (created_by);
create index if not exists activity_actor_member_idx on public.activity (actor_member);
create index if not exists settlements_created_by_idx on public.settlements (created_by);
create index if not exists split_rooms_expense_id_idx on public.split_rooms (expense_id);
create index if not exists split_rooms_host_member_idx on public.split_rooms (host_member);
create index if not exists split_rooms_paid_by_idx on public.split_rooms (paid_by);
create index if not exists split_room_claims_member_idx on public.split_room_claims (member_id);
create index if not exists reactions_member_idx on public.reactions (member_id);
create index if not exists comments_member_idx on public.comments (member_id);
create index if not exists entity_seen_group_idx on public.entity_seen (group_id);
create index if not exists nudges_group_idx on public.nudges (group_id);
create index if not exists nudges_to_member_idx on public.nudges (to_member);
