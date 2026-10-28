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

## Rollout
1. Add the archive manifest in a reviewed migration and test it in staging first.
2. Build an admin-only Edge Function with strict archive types, size limits, checksums, and audit logging. R2 credentials must never reach the app.
3. Integrate the read-only player search/history API into the actual admin UI.
4. Test with synthetic data: authorization, missing objects, checksum mismatch, pagination, and rollback.
5. Copy eligible historical data to R2, read it back, and compare counts/checksums before marking it verified.
6. Retain original database rows by default. Any deletion requires a separate reviewed migration, backup, and explicit approval.

## Never archive as a substitute for live database records
Wallet balances, ledger entries, pending deposit/withdrawal requests, auth users, player identities, and active tournament state stay in PostgreSQL until a separately engineered and tested replacement exists.

No automatic migration or deletion is part of this plan. Profile pictures and banners are excluded.

## Rollback
If archived reads fail, disable archived-history display and continue serving live PostgreSQL data. Keep original rows until the archive has been proven reliable.
