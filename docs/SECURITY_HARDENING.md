# BattleForge security hardening — review notes

This branch is a reviewable hardening change set. It is not a claim that the app is unhackable. The live Supabase project has received narrowly scoped database and BLAZE Edge Function security changes; no wallet balances, payment records, player records, or production web deployment were modified.

## Changes in this branch

- Ignore local environment files, package-manager credentials, signing material, Firebase configuration, and local database exports.
- Scope Android workflow permissions to the build job, add a build timeout and concurrency cancellation, and run `npm audit --audit-level=high` after dependency installation.
- Add baseline HTTP security headers for the Vercel-hosted web app.

## Verified project observations (2026-11-27)

- The Supabase project is active and on PostgreSQL 17.
- All five currently deployed Edge Functions have JWT verification enabled.
- Supabase Security Advisor reports 54 SECURITY DEFINER functions executable by authenticated users and two executable by anon. Many admin functions inspected check a role/permission helper and validate inputs. Do not blanket-revoke EXECUTE: this would break intended RPC workflows. Every function still needs a function-by-function authorization and grants review.
- The public earnings leaderboard returns user UUIDs, player numbers, usernames and totals. Confirm that each field is intended for public disclosure; consider returning only public leaderboard fields.
- Five tables have RLS enabled with no policies: `admin_users`, `battleforge_social_settings`, `match_kicks`, `player_bans`, and `r2_archive_manifest`. This is commonly deny-by-default, but verify grants and service-role-only access before adding policies.
- Supabase Auth leaked-password protection is disabled. Enable after checking the sign-in and password-reset experience; this requires a controlled Auth configuration change.
- Several Edge Functions still use wildcard CORS. BLAZE previously used only in-memory per-isolate rate limiting; a shared database-backed limiter has now been added and integrated into BLAZE. Other handlers still need abuse throttling and strict origin allowlists.
- The payment notification handler verifies the caller and checks request ownership. Add abuse throttling and ensure its internal-trigger contract remains intentional.
- The client uses a Supabase publishable key. This is designed to be public; never put service-role keys, signing credentials, Firebase service-account private keys, or R2 secret keys in the client.
- The app source includes escaped HTML rendering helpers, but a full source-wide taint/XSS audit and runtime negative tests are still required.

## Changes applied to live Supabase (2026-11-27)

- Added `private.edge_rate_limits` with RLS enabled and no client-role grants. Only `service_role` can access the table.
- Added `public.consume_edge_rate_limit(text, integer, integer)`, a `SECURITY DEFINER` RPC with an empty search path and strict parameter bounds. EXECUTE is revoked from `PUBLIC`, `anon`, and `authenticated`; only `service_role` can call it.
- Deployed `blaze-chat` version 3 with JWT verification retained, server-side user validation, shared 12-requests-per-minute rate limiting, a local fallback limiter, and a 20 KB request-body cap.
- Revoked anonymous EXECUTE on `public.get_earnings_leaderboard(text)` while preserving authenticated access. This reduces anonymous exposure of player UUIDs and leaderboard data. `get_tournament_counts()` remains anonymous because it exposes aggregate counts and may support public tournament discovery.
- Rechecked function privileges: anon cannot execute the shared rate-limit RPC or earnings leaderboard; authenticated users cannot execute the limiter; service_role can execute it.
- Re-ran Security Advisor. Anonymous SECURITY DEFINER exposure dropped from two findings to one (`get_tournament_counts`). The 54 authenticated SECURITY DEFINER notices remain and require function-by-function review; do not remove their grants indiscriminately.

## Required before production approval

1. Generate and commit a lockfile from the actual project dependency graph, then change CI to `npm ci`. Review and resolve all high/critical dependency audit findings rather than suppressing them.
2. Pin third-party GitHub Actions to verified immutable commit SHAs.
3. Scan every Git revision for credentials. If any real credential was ever committed, rotate/revoke it at its issuer; deleting a file or rewriting Git history does not invalidate a credential.
4. Review all SECURITY DEFINER function bodies, ownership, grants, search_path, authorization helper semantics, and anonymous exposure. Test each permission boundary with real anon, ordinary-user, staff, and owner identities.
5. Add shared rate limiting, strict CORS allowlists, request-size limits, and abuse controls to Edge Functions. Confirm that all service-role operations are restricted to authenticated, authorized callers and that no secrets enter logs or responses.
6. Test RLS and RPC negative cases: cross-user profile/transaction reads and writes, admin-only operations, room credentials, match chat, notifications, wallet mutations, duplicate deposit/withdrawal processing, and tournament-entry race conditions.
7. Enable leaked-password protection after a staged auth-flow test.
8. Configure a tested CSP only after inventorying OAuth redirects, Supabase HTTPS/WebSocket endpoints, inline boot code, and Android WebView behavior. A premature CSP can break login or native app flows.
9. Verify Vercel headers in the deployed response, not only in this config file. Confirm the hosting project is actually linked to this repository.
10. Confirm backup retention and perform a restore drill. Review production logs for suspicious auth failures, payment abuse, and unexpected admin actions.

## Explicitly not done

No wallet balances, payment records, player records, or production web deployment were modified. Auth leaked-password protection remains disabled because the available connected controls do not expose a safe Auth configuration operation; enable it in Supabase Dashboard after testing the password sign-in/reset flow. Wildcard CORS remains on several Edge Functions until the exact web and native origins are verified. Secret rotation requires evidence of exposure and coordinated replacement of dependent integrations.
