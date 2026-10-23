# BattleForge admin setup

The admin panel is hidden until an account is explicitly added to `public.admin_users`. Do not make admin access selectable inside the app.

## 1. Apply the migration

In Supabase Dashboard → SQL Editor, run `supabase/002_admin_matches_results.sql` after `schema.sql` and `seed.sql` have succeeded. This is an additive migration; it does not enable deposits, wallet credits, or payouts.

## 2. Create the admin account

Create an account in the BattleForge app using the email you intend to administer the app with, then verify email if Supabase requires it. In the Supabase SQL Editor, replace the placeholder email and run:

```sql
insert into public.admin_users (user_id)
select id from auth.users where lower(email) = lower('YOUR_ADMIN_EMAIL')
on conflict (user_id) do nothing;
```

Check the email carefully before running the statement. Only add trusted admin accounts. Never put a Supabase service-role key in the APK.

## 3. Rebuild and install

The `main` branch build workflow creates a debug APK. Install the new `BattleForge-debug-APK` artifact from GitHub Actions, sign in with the provisioned account, and reopen the app if the ADMIN button does not appear immediately.

## 4. Admin capabilities

- Create SOLO, DUO, and SQUAD tournaments.
- Open/close entry and mark a tournament full.
- Save match room ID/password; only registered players can read published room details.
- Record and publish placement, kills, and a note for each registered player.

Published results are informational only. They do not add points or transfer money. The existing points wallet is still local demo data. Real deposits, withdrawals, fees, and prize payouts require a separately reviewed payment provider, server-side ledger, reconciliation, abuse controls, and applicable legal/compliance checks before launch.
