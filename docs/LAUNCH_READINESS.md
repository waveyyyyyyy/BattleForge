# BattleForge — Launch readiness and operational runbook

**Status:** Internal checklist. Last reviewed 10 November 2026.  
**Current app branch:** `feature/payment-minimums-earned-withdrawal-policy`  
**Supabase project:** `izyttrbspxrcacwuhwer`

## Release gate — do not mark production-ready yet

- [ ] Written Indian legal opinion on the exact paid-entry / prize / coin / wallet model and the Promotion and Regulation of Online Gaming Act, 2025 and Rules, 2026.
- [ ] Written confirmation of whether BattleForge/each tournament requires e-sports recognition or registration, who the operator is, and which states/users may be served.
- [ ] Payment/UPI provider and bank approval for the exact flows.
- [ ] Final privacy policy, terms, cancellation/refund policy and grievance process; complete every highlighted operator/contact field in `/legal/`.
- [ ] Age gate and geographic restrictions implemented to counsel's written specification.
- [ ] Security findings below resolved and independently retested.
- [ ] Backup export and restore drill completed and evidence retained.
- [ ] Crash monitoring configured and a test crash/error observed in the monitoring console.
- [ ] Signed release build installed and update-tested on a clean Android device.
- [ ] End-to-end tests passed for registration, entry, deposit verification, withdrawal, cancellation, dispute, payout and admin role separation.

## Legal and platform review

The PROG Act 2025 definition of e-sport is specific: an organised multiplayer competition as part of multi-sports events, duly recognised under the National Sports Governance Act, 2025 and registered with the Authority/agency; fees may be solely for entry or administrative costs and prizes may be performance-based, but bets/wagers/other stakes are excluded. The Act defines an online money game broadly by reference to fees/deposits/stakes and expected monetary enrichment, regardless of skill or chance, but excludes qualifying e-sports. Its definition of “other stakes” expressly includes purchased credits/coins. BattleForge's current community Free Fire tournament and deposited/earned coin wallet has not been shown to satisfy the statutory e-sport criteria. Obtain a written classification from qualified Indian counsel and, where appropriate, the Authority before accepting paid entries or facilitating payments.

Official primary sources to review:
- India Code — PROG Act 2025: https://www.indiacode.nic.in/bitstream/123456789/22148/1/a2025-32.pdf
- MeitY — PROG Act 2025: https://www.meity.gov.in/static/uploads/2025/10/8a7f103cefc68ed8aaa2ebc9a2ed7c13.pdf
- PIB — PROG Rules 2026 announcement: https://www.pib.gov.in/PressReleaseIframePage.aspx?PRID=2254606&lang=2&reg=48
- Google Play policy context: https://blog.google/intl/en-in/products/platforms/understanding-our-play-gambling/

## Android distribution policy

Google Play's current India requirements prohibit distributing apps classified as online money games under the PROG Act. Its Real-Money Gambling, Games and Contests policy also says other real-money games, contests and tournament apps that do not qualify for the narrow listed gambling categories/pilots cannot facilitate real-money participation for real-world-value prizes. A Free Fire tournament app with paid entries and prize payouts is not among the named eligible gambling categories. Do not submit the current paid-entry version to Google Play expecting approval; obtain a written policy assessment and redesign or remove real-money functionality if needed. Direct APK distribution does not remove obligations under Indian law.

Official references:
- Google Play India gaming requirements: https://support.google.com/googleplay/android-developer/answer/6223646?hl=en-en
- Google Play Real-Money Gambling, Games and Contests policy: https://support.google.com/googleplay/android-developer/answer/18265346
- Google Play current pilot status: https://support.google.com/googleplay/android-developer/answer/12918670?hl=en

## Supabase backup and recovery

The connected project currently reports `ACTIVE_HEALTHY`, Postgres 17.11, region `ap-northeast-2`. Project plan and backup entitlement were not exposed in the project metadata inspected here.

- [ ] In Supabase Dashboard → Database → Backups, confirm whether daily backups are available for the current plan and record retention dates.
- [ ] If on Free tier, schedule a regular logical export using Supabase CLI `db dump` and store encrypted copies outside the project (separate account/location). Supabase docs recommend regular exports for Free projects.
- [ ] Remember database backups do not include Storage API object bytes. Back up R2 objects and the archive manifest separately.
- [ ] Store backup encryption keys separately from backup files. Never commit credentials, service-role keys or R2 secrets.
- [ ] Perform a restore drill into a separate project; verify account, wallet ledger, tournament entries/results and archive object checksums before relying on the process.
- [ ] Define RPO/RTO, retention periods, access owners and restore approval process.

Reference: https://supabase.com/docs/guides/platform/backups

## Security findings observed 10 Nov 2026

Supabase Security Advisor returned:
- 5 tables with RLS enabled but no policies: `admin_users`, `battleforge_social_settings`, `match_kicks`, `player_bans`, `r2_archive_manifest`. These may intentionally deny direct API access; verify grants and intended service paths. Do not add broad policies just to silence the linter.
- 2 public SECURITY DEFINER RPCs executable by `anon`: `get_earnings_leaderboard(text)` and `get_tournament_counts()`. Review function bodies and returned fields; revoke anon only if public access is not intended.
- 48 authenticated SECURITY DEFINER RPCs flagged. Audit each function's internal authorization, fixed search_path, input validation and grants. Do not blanket-revoke; admin, player and wallet features depend on some RPCs.
- Leaked-password protection is disabled. Enable Supabase Auth's leaked-password protection in Auth settings after reviewing supported password providers and testing sign-in/reset flows.

Security Advisor links:
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Crash monitoring

The current repository does not show Sentry, Firebase Crashlytics or another crash/error reporting SDK configured. The build workflow only configures Firebase Cloud Messaging when `GOOGLE_SERVICES_JSON_BASE64` exists; FCM delivery is not crash monitoring.

Recommended setup:
1. Create a BattleForge project in an error-monitoring provider (e.g. Sentry) and obtain a client DSN.
2. Add the DSN as a GitHub Actions secret and inject it at build time; never hardcode auth tokens or server-side secrets.
3. Configure Android native crash reporting if the provider supports Capacitor/Android, plus JS unhandled rejection/error reporting.
4. Scrub emails, UPI IDs, payment references, auth tokens, room passwords and user-generated message bodies from event payloads.
5. Add release/version tags and environment tags. Set alerts for crash spikes and new fatal issues.
6. Trigger a deliberate test event on a test build and confirm it appears; do not test by crashing real players' production sessions.

## Android release signing

Current `.github/workflows/build-apk.yml` produces `BattleForge-debug-APK` using `assembleDebug`. It is for testing only, not a production-signed release.

For a signed release workflow:
1. Generate a dedicated upload/release keystore on a trusted machine. Keep at least two encrypted offline backups. Never commit the keystore.
2. Add GitHub Actions secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
3. Configure Gradle release signing from environment variables; fail closed if any secret is missing.
4. Build `assembleRelease` and upload only the signed release artifact. Verify it with `apksigner verify --verbose --print-certs` and record the certificate SHA-256 fingerprint.
5. Keep the same signing identity for all sideloaded updates. If publishing on Google Play, prefer Play App Signing and keep a separate upload key; update OAuth fingerprints to match the Play app-signing certificate.

Google docs: https://support.google.com/googleplay/android-developer/answer/9842756?hl=en-en

## Release operations

- [ ] Pin dependencies and commit a lockfile; current workflow uses `npm install` and repository inspection did not find npm/yarn/pnpm lockfiles.
- [ ] Add automated build/test checks and retain build provenance (commit SHA, versionName, versionCode, artifact hash).
- [ ] Test install/upgrade over the previous APK; verify app data and login persistence.
- [ ] Confirm Firebase credentials are present and test push notifications on a real Android device.
- [ ] Verify force-update URL points to a real, reachable signed APK and the minimum version is correct.
- [ ] Verify all admin roles with test accounts; players cannot invoke finance, tournament, moderation or support actions.
- [ ] Reconcile wallet ledger against UPI/bank statements before enabling any payment service.
- [ ] Confirm emergency controls and a documented incident contact/on-call owner.

## Current status summary

| Area | Status |
|---|---|
| Policy drafts | Prepared; legal review and operator details missing |
| Legal classification | **Blocking** |
| Database project health | Active/healthy at inspection |
| Backups | Plan/retention and restore drill unverified |
| Security | **Warnings remain** |
| Crash monitoring | Not configured |
| Android build | Debug APK only |
| Signed production APK | **Not configured** |
| Launch approval | **Not approved** |
