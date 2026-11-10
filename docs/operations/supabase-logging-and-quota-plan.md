# Supabase Logging & Quota Safety Plan — BattleForge

Last reviewed: 2026-11-10  
Project: `izyttrbspxrcacwuhwer`  
Repository branch: `feature/payment-minimums-earned-withdrawal-policy`

## Goal

Keep BattleForge operating on the current cloud/free-tier setup for as long as practical, without risking player accounts, wallet balances, deposits, withdrawals, tournament entries/results, or other transactional records. Avoid a rushed migration. Prepare a separate fallback for logs if Supabase changes Logs Query enforcement.

## Verified baseline (read-only checks, 2026-11-10)

- PostgreSQL database size: approximately **15 MB** at the last size check (previously reported against the 500 MB Free-plan database allowance).
- Public base tables: 24 at that check.
- Current PostgreSQL logging settings observed:
  - `log_statement = ddl`
  - `log_duration = off`
  - `log_min_duration_statement = -1` (disabled)
  - `log_connections = off`
  - `log_disconnections = off`
  - `log_min_messages = warning`
  - `log_min_error_statement = error`
  - `debug_print_parse = off`
  - `debug_print_plan = off`
  - `debug_print_rewritten = off`
  - `pgaudit.log = none`
  - `auto_explain.log_min_duration = 10000 ms` (10 seconds)
  - `auto_explain.log_analyze = off`
  - `auto_explain.log_timing = on`
  - `cron.log_statement = on` (setting visible; the `cron.job` relation was not available to this SQL session, so do not assume pg_cron jobs are configured)
- The SQL checks were read-only. No production database settings, tables, or records were changed.
- A broad unified-log query was deliberately not run as part of this audit, to avoid unnecessary Logs Query usage.

## Key distinction

- **Logs Ingest** measures log data generated/received.
- **Logs Query** measures log data scanned by log searches.
- Reducing log generation may reduce ingest, but does not by itself guarantee lower query scans. Avoid repeated broad searches; use narrow time windows and source filters only when an investigation is necessary.
- Logs are observability data. They are separate from the transactional PostgreSQL database. A Logs Query restriction is not the same as database shutdown or deletion of wallet/player records.

## Operating rules

1. Do not migrate the production database solely because a Logs Query usage meter looks high.
2. Do not delete wallet, deposit, withdrawal, identity, tournament, result, or dispute records to reduce logging usage.
3. Keep security-relevant and payment-related errors observable.
4. Do not disable error logging, audit controls, or security telemetry blindly.
5. Do not change PostgreSQL logging parameters until the actual source and impact are established and the setting is confirmed to be safely configurable on this Supabase plan.
6. Treat dashboard usage readings cautiously if Supabase continues to report measurement issues; verify against current official Supabase announcements before acting.

## Action plan

### Phase 1 — Safe code/config audit
- Review app source, Edge Functions, SQL functions/RPCs, triggers, scheduled jobs, and admin workflows for repeated debug/info logs, noisy polling, duplicate error reporting, and unnecessary `RAISE NOTICE` / `RAISE LOG`.
- Identify the source and frequency before changing anything.
- Remove only redundant/noisy messages. Keep actionable errors and security/payment failure messages.
- Avoid logging access tokens, UPI IDs, credentials, personal data, or full payment payloads.

### Phase 2 — Controlled reduction
- Make small, reviewable changes only after the audit identifies a specific noisy source.
- Preserve useful error context while redacting sensitive fields.
- Verify critical flows after each change: sign-in, wallet balance, deposit submission, withdrawal request, tournament join, result publishing, and admin actions.
- Compare usage over a representative period; do not claim success from a single sample.

### Phase 3 — External log fallback
- Evaluate a separate log archive/analytics destination with a genuinely usable free tier, current documented limits, retention, exportability, and security controls.
- Prefer sending only selected application/Edge Function operational events, not duplicating all database contents.
- Keep the log pipeline non-blocking: an archive outage must never break sign-in, wallet, tournament, or payment flows.
- Do not store transactional source-of-truth data in object storage or a log platform. PostgreSQL remains authoritative for financial and tournament records unless a separately tested migration is approved.
- Do not assume Cloudflare R2, Workers, or any other service is unlimited or free forever; verify current quotas before adoption.

### Phase 4 — Enforcement response
- Re-check Supabase's official Logs Query documentation and enforcement announcement when updated.
- If restrictions are announced, determine whether BattleForge's measured query usage actually exceeds the allowance.
- First route operational log search/archive needs to the prepared external system. Consider database migration only if a separate database limit or reliability issue justifies it.
- Before any migration: export, validate row counts and financial balances, test auth/RLS/functions/realtime, rehearse rollback, and obtain explicit approval.

## Current decision

**Stay on Supabase for now. No production changes were made during the 2026-11-10 audit.** The next safe action is a source-code and Edge Function logging audit, followed by narrowly scoped fixes only where evidence supports them.
