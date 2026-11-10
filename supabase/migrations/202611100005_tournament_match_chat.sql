-- Match chat: participant-only posting, participant/admin reading, admin moderation.
create table if not exists public.tournament_chat_messages (
  id uuid primary key default gen_random_uuid(),
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(btrim(message)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists tournament_chat_messages_match_created_idx
  on public.tournament_chat_messages (tournament_id, created_at desc);
create index if not exists tournament_entries_match_user_idx
  on public.tournament_entries (tournament_id, user_id);
alter table public.tournament_chat_messages enable row level security;
revoke all on public.tournament_chat_messages from anon;
grant select, insert, delete on public.tournament_chat_messages to authenticated;
drop policy if exists "Match participants and admins can read match chat" on public.tournament_chat_messages;
create policy "Match participants and admins can read match chat"
on public.tournament_chat_messages for select to authenticated
using (
  public.is_battleforge_admin()
  or exists (select 1 from public.tournament_entries e
    where e.tournament_id = tournament_chat_messages.tournament_id
      and e.user_id = (select auth.uid()))
);
drop policy if exists "Match participants can send chat messages" on public.tournament_chat_messages;
create policy "Match participants can send chat messages"
on public.tournament_chat_messages for insert to authenticated
with check (
  user_id = (select auth.uid())
  and char_length(btrim(message)) between 1 and 500
  and exists (select 1 from public.tournament_entries e
    where e.tournament_id = tournament_chat_messages.tournament_id
      and e.user_id = (select auth.uid()))
);
drop policy if exists "Admins can moderate match chat" on public.tournament_chat_messages;
create policy "Admins can moderate match chat"
on public.tournament_chat_messages for delete to authenticated
using (public.is_battleforge_admin());
do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public'
      and tablename='tournament_chat_messages') then
    alter publication supabase_realtime add table public.tournament_chat_messages;
  end if;
end $$;
