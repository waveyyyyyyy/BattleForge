# BattleForge searchable R2 archive

## Goal
Keep archived historical data in Cloudflare R2 while admins can still search a player by username or player number and view current plus archived history in one screen.

## Safety boundaries
- Keep `public.player_accounts` searchable in PostgreSQL. Retain player UUID, player number, and username as the identity index.
- Keep live wallet state and ledger records in PostgreSQL: `wallet_accounts`, `wallet_ledger`, `deposit_requests`, `withdrawal_requests`, and `admin_wallet_adjustments`.
- Keep active tournament/registration state in PostgreSQL while matches are active, results are being published, or disputes/payouts may be pending.
- Use R2 for versioned JSON archives of eligible historical match/tournament/player activity. R2 is object storage, not a relational database replacement.
- A small PostgreSQL archive manifest maps a player UUID and archive type to the R2 object key, row count, checksum, and verification status.

## Search flow
1. Admin searches `player_accounts` by username or player number.
2. The app resolves the selected player's UUID.
3. A JWT-authenticated, admin-authorized Edge Function queries verified manifest rows.
4. The function reads the corresponding private R2 JSON objects and verifies SHA-256 checksums.
5. The admin UI shows live and archived history together, clearly labelled and paginated.

## Implementation status (2026-10-28)
- The additive `r2_archive_manifest` table has been applied to Supabase and verified to exist with zero rows.
- The JWT-protected `r2-player-archive` Edge Function (version 2) is deployed. It checks the user's authenticated identity and verifies membership in `admin_users` before every action; uploads are read back and SHA-256 checked before the manifest is marked verified.
- The admin dashboard now has player search by username or exact player number, live-history viewing, archive upload, and checksum-verified archive reading.
- The Edge Function source is versioned at `supabase/functions/r2-player-archive/index.ts` on the feature branch.
- No real player data has been archived, and no original rows have been deleted.
- The app JavaScript syntax check passed in GitHub Actions. A live end-to-end invocation using an authenticated admin session is still required to confirm the R2 secrets and UI path in the deployed app. A full Vite build could not run because npm returned a 404 for the resolved Rollup tarball, so CI currently runs the dependency-free syntax check.

## Rollout / validation
1. Verify the four server-side R2 secrets are configured: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME`. Never place them in the client.
2. Test with a dedicated test admin and a synthetic past-match result. Verify search, upload, read-back, and checksum.
3. Test rejection for non-admin users, missing objects, checksum mismatch, and oversized payloads.
4. Only after those checks, archive eligible historical results from matches marked as past.
5. Retain original database rows by default. Any deletion requires a separate reviewed migration, backup, and explicit approval.

## Never archive as a substitute for live database records
Wallet balances, ledger entries, pending deposit/withdrawal requests, auth users, player identities, and active tournament state stay in PostgreSQL until a separately engineered and tested replacement exists.

No automatic migration or deletion is part of this plan. Profile pictures and banners are excluded.

## Rollback
If archived reads fail, disable archived-history display and continue serving live PostgreSQL data. Keep original rows until the archive has been proven reliable.
