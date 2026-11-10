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
create index if not exists tournament_chat_messages_user_id_idx
  on public.tournament_chat_messages (user_id);
create index if not exists tournament_entries_match_user_idx
  on public.tournament_entries (tournament_id, user_id);
alter table public.tournament_chat_messages enable row level security;
revoke all on public.tournament_chat_messages from anon;
grant select, insert, delete on public.tournament_chat_messages to authenticated;
drop policy if exists "Match participants and admins can read match chat" on public.tournament_chat_messages;
create policy "Match participants and admins can read match chat"
on public.tournament_chat_messages for select to authenticated
using (
  coalesce((public.get_my_admin_access()->>'is_admin')::boolean,false)
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
using (coalesce((public.get_my_admin_access()->>'is_admin')::boolean,false));
do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public'
      and tablename='tournament_chat_messages') then
    alter publication supabase_realtime add table public.tournament_chat_messages;
  end if;
end $$;


-- Return the latest 100 messages with player names in one authorized query.
create or replace function public.get_tournament_chat_messages(p_tournament_id bigint)
returns table(id uuid, user_id uuid, username text, message text, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in to view this match chat'; end if;
  if not coalesce((public.get_my_admin_access()->>'is_admin')::boolean,false) and not exists (
    select 1 from public.tournament_entries e
    where e.tournament_id=p_tournament_id and e.user_id=auth.uid()
  ) then raise exception 'Only registered players and admins can view this match chat'; end if;
  return query
    select recent.id,recent.user_id,coalesce(p.username,'Player')::text,recent.message,recent.created_at
    from (select m.id,m.user_id,m.message,m.created_at from public.tournament_chat_messages m
          where m.tournament_id=p_tournament_id order by m.created_at desc limit 100) recent
    left join public.player_accounts p on p.user_id=recent.user_id
    order by recent.created_at asc;
end;
$$;
revoke all on function public.get_tournament_chat_messages(bigint) from public, anon;
grant execute on function public.get_tournament_chat_messages(bigint) to authenticated;


-- Keep storage bounded: retain only the latest 200 messages for each match.
create or replace function public.trim_tournament_chat_history()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.tournament_chat_messages
  where tournament_id=new.tournament_id
    and id in (
      select id from public.tournament_chat_messages
      where tournament_id=new.tournament_id
      order by created_at desc,id desc offset 200
    );
  return new;
end;
$$;
revoke all on function public.trim_tournament_chat_history() from public,anon,authenticated;
drop trigger if exists tournament_chat_keep_latest_200 on public.tournament_chat_messages;
create trigger tournament_chat_keep_latest_200 after insert on public.tournament_chat_messages
for each row execute function public.trim_tournament_chat_history();
