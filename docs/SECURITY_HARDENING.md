# BattleForge security hardening — 2026-11-27

This is a reviewable security hardening tranche, not a guarantee that the app is unhackable or a formal penetration-test certification.

## Live Supabase changes applied

- Added private table `private.edge_rate_limits`, with RLS enabled and no client-role table grants.
- Added `public.consume_edge_rate_limit(text, integer, integer)` as a bounded, atomic shared rate-limit RPC. It has an empty `search_path`; EXECUTE is revoked from `PUBLIC`, `anon`, and `authenticated`, and granted only to `service_role`.
- Deployed all five Edge Functions with JWT verification enabled:
  - `blaze-chat` v5
  - `send-push-notification` v11
  - `notify-admin-payment-request` v14
  - `r2-player-archive` v4
  - `r2-upload-test` v16
- All five Edge Functions now use exact origin allowlists rather than wildcard CORS. The allowlist covers the verified BattleForge Vercel domain, the active security preview, Android/iOS Capacitor origins, and local development origins.
- Added shared DB-backed rate limiting to BLAZE, broadcast notifications, payment alerts, R2 archive requests, and the owner-only R2 test endpoint. Rate-limit failures fail closed.
- BLAZE validates the signed-in user, limits requests to 12/minute, caps bodies at 20 KB, validates message count/role/length, and keeps the Gemini key server-side. Removed a duplicate response helper found during the follow-up review.
- Broadcast endpoint now requires the `announcements_manage` permission. Archive endpoint requires `player_lookup`. R2 connection test requires owner access.
- Payment-alert endpoint checks the signed-in user's ownership of the payment request, rate-limits calls, and enforces a real 12 KB body cap.
- R2 archive endpoint enforces a real body cap and per-user rate limit. It retains source records; archival does not delete transactional history.
- Revoked all anonymous write/DDL-like table privileges in the public schema, including TRUNCATE. Revoked TRUNCATE, REFERENCES, and TRIGGER from authenticated clients. Removed direct writes to tables that are mutated only through guarded RPCs/server code; preserved only required profile update, push-device management, and match-chat send/delete operations.
- Revoked broad default grants for future public tables, sequences, and functions created by the `postgres` migration role. Future migrations must explicitly grant only the needed access.
- Anonymous EXECUTE on `public.get_earnings_leaderboard(text)` remains revoked; authenticated access is retained. `get_tournament_counts()` remains intentionally public because it returns aggregate tournament counts.

## Database authorization review

- All 27 application tables inspected have RLS enabled.
- The six RLS-enabled/no-policy tables are fail-closed: `private.edge_rate_limits`, `public.admin_users`, `public.battleforge_social_settings`, `public.match_kicks`, `public.player_bans`, and `public.r2_archive_manifest`. These have no anon/authenticated table grants.
- Before grant tightening, direct client grants included TRUNCATE on multiple public tables. This bypasses RLS. The grant revocation above removed TRUNCATE from anon and authenticated; verification query returned zero tables with client TRUNCATE privileges.
- Anonymous clients now have no INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, or TRIGGER privileges on public tables.
- Remaining direct authenticated DML is limited to:
  - `profiles`: UPDATE only, constrained by self-update RLS.
  - `push_devices`: INSERT/UPDATE/DELETE, constrained by own-user RLS.
  - `tournament_chat_messages`: INSERT/DELETE, constrained by participant/admin RLS.
- The 54 authenticated-executable SECURITY DEFINER notices are not all vulnerabilities: they include admin RPCs with permission checks, user-owned RPCs, and public app read functions. Inspected admin RPCs use `private.has_battleforge_permission`; do not blanket-revoke these grants because app features rely on them. Full role-by-role runtime negative testing with real test accounts is still required.
- The single anon-executable SECURITY DEFINER function is `get_tournament_counts()`, intentionally retained for public aggregate tournament discovery.
- Auth leaked-password protection is disabled, and this project is on Supabase Free. Supabase documents leaked-password protection as Pro-plan-and-above, so it cannot be enabled on the current plan. It requires a plan upgrade before the Dashboard toggle becomes available.

## Repository and CI changes

- `.gitignore` excludes local env files, package credentials, signing keys/certificates, Firebase config, and database backups.
- Vite is updated to patched 6.4.6 and its dev server binds to localhost.
- Android build uses Node 22; GitHub Actions permissions are scoped and action references are pinned to immutable SHAs.
- Added dedicated security CI and Dependabot. Latest security CI run passed dependency audit at high severity and the web build.
- A package lockfile is not present yet, so CI still uses `npm install`, not reproducible `npm ci`. Generate and commit a lockfile before calling dependency installation fully reproducible.
- Current tracked source files were scanned for common credential formats; no actual key/token patterns were found. A review of 130 recent commit diffs found no credential-shaped tokens; two private-key-marker matches were code that parses PEM key strings, not private key material. This is not a full scan of every historical commit or all Git objects; use GitHub secret scanning or a full mirror scan before certification.
- Frontend source review found a persisted chat reaction value inserted into HTML without escaping; it is now escaped. Other reviewed dynamic HTML uses the shared `esc()` helper or static content. A full formal taint analysis and browser-based XSS test remain outstanding.

## Website deployment and headers

- Baseline response headers are configured in both repository root and `website/vercel.json` because the website is served from its own folder.
- Headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, strict referrer policy, no cross-domain policy, and disabled camera/microphone/geolocation.
- A second Vercel preview was deployed successfully after adding `website/vercel.json`. The preview response was checked and returned all five configured security headers. Production headers remain unverified because the preview was not promoted.
- No production website deployment was promoted. No GitHub PR was merged.

## Remaining release gates

1. If you upgrade the Supabase Free project to Pro, enable leaked-password protection in Dashboard and verify sign-in, Google OAuth, password reset, and password update flows.
2. Complete a full Git mirror secret scan or confirm GitHub secret-scanning results. If a real credential was ever committed, revoke/rotate it at the issuer and update dependent integrations. Never print secret values in issues or chat.
3. Complete test-account negative testing: anonymous vs player vs staff vs owner; cross-user profile/wallet/payment reads and writes; room credential isolation; chat; notifications; and every finance/tournament admin RPC.
4. Verify exact CORS behavior from the production website and native Android WebView, including preflight requests. Add any verified production origin only; do not use wildcard origins.
5. Deploy a new Vercel preview and verify the actual response headers. Do not add CSP until OAuth, Supabase WebSocket, inline boot code, and Android WebView behavior are inventoried and tested.
6. Commit a real npm lockfile, switch CI to `npm ci`, and keep the dependency audit/build passing.
7. Run an Android APK build and device smoke test after merging the security branch into the intended release branch.
8. Review backups and complete a restore drill. Monitor auth failures, payment abuse, unexpected admin actions, and Edge Function errors.

## Data integrity

No wallet balances, deposit/withdrawal requests, player records, tournament entries, results, or payment records were changed by this security work. No secrets were rotated blindly. No production web deployment was promoted.
