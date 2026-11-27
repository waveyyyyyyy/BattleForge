create schema if not exists private;
create table if not exists private.edge_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  updated_at timestamptz not null default now()
);
alter table private.edge_rate_limits enable row level security;
revoke all on table private.edge_rate_limits from public, anon, authenticated;
grant all on table private.edge_rate_limits to service_role;

create or replace function public.consume_edge_rate_limit(
  p_rate_key text,
  p_window_seconds integer default 60,
  p_max_requests integer default 12
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_started timestamptz;
  v_count integer;
begin
  if p_rate_key is null or pg_catalog.length(p_rate_key) < 1 or pg_catalog.length(p_rate_key) > 200
     or p_window_seconds < 1 or p_window_seconds > 3600
     or p_max_requests < 1 or p_max_requests > 1000 then
    raise exception 'Invalid rate limit parameters';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_rate_key, 0));
  select window_started_at, request_count into v_started, v_count
    from private.edge_rate_limits where rate_key = p_rate_key for update;
  if not found or v_now >= v_started + pg_catalog.make_interval(secs => p_window_seconds) then
    insert into private.edge_rate_limits(rate_key, window_started_at, request_count, updated_at)
      values (p_rate_key, v_now, 1, v_now)
      on conflict (rate_key) do update
        set window_started_at = excluded.window_started_at,
            request_count = 1, updated_at = excluded.updated_at;
    return false;
  end if;
  if v_count >= p_max_requests then return true; end if;
  update private.edge_rate_limits set request_count = request_count + 1, updated_at = v_now where rate_key = p_rate_key;
  return false;
end;
$function$;
revoke all on function public.consume_edge_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_edge_rate_limit(text, integer, integer) to service_role;