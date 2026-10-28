-- Draft migration for searchable R2 archive metadata.
-- This only creates a pointer index; it does not move or delete any existing data.
create table if not exists public.r2_archive_manifest (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null,
  record_type text not null check (record_type in ('match_history', 'tournament_history', 'player_activity')),
  object_key text not null unique,
  record_count integer not null check (record_count >= 0),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  archive_version integer not null default 1 check (archive_version > 0),
  status text not null default 'pending' check (status in ('pending', 'verified', 'restore_required')),
  archived_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists r2_archive_manifest_player_lookup_idx
  on public.r2_archive_manifest (player_id, record_type, archived_at desc);
alter table public.r2_archive_manifest enable row level security;
revoke all on table public.r2_archive_manifest from anon, authenticated;
