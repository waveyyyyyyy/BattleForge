# BattleForge Arena

Mobile-first Free Fire community tournament prototype. This is a demo UI and an early backend foundation, not a production real-money tournament platform.

## Current demo
- Responsive BattleForge tournament screen
- Solo, duo and squad sample tournaments
- Demo points, local join flow and activity history
- Capacitor Android wrapper and GitHub Actions APK build

## Next step: online accounts and shared tournament entries
The supabase/schema.sql file defines the first backend layer:
- player profiles tied to Supabase Auth accounts
- tournament records
- per-user tournament registrations
- row-level security policies
- a server-side join_tournament function that checks tournament status and capacity

### Set up Supabase from your phone
1. Create a free project at https://supabase.com/dashboard.
2. Open the project's SQL Editor, create a new query, paste all of supabase/schema.sql from this repository, and run it.
3. Open Project Settings → API (or the project's Connect/API page) and copy the Project URL and publishable/anon key.
4. Do not share keys in chat. The publishable/anon key is intended for client apps when Row Level Security is correctly configured; never put a service-role or secret key in the app.
5. The app is not connected to Supabase yet. The next code step is to add signup/login, load tournament rows from the database, and call join_tournament instead of the local demo join.

## Security / money limitations
- No real deposits, withdrawals, cash prizes, or payment gateway
- Current balance/history are local demo data and are NOT a real wallet
- This schema deliberately does not charge points or store money
- No authenticated admin panel or verified match results yet
- Do not use this prototype to collect or hold real customer funds

Before any real-money launch, implement a server-controlled double-entry ledger, payment-provider verification, authenticated admin controls, result verification, anti-abuse protections, and obtain appropriate legal advice for the target regions.

## Build the test APK on GitHub using an Android phone
1. Open the repository's Actions tab.
2. Select Build BattleForge Android APK.
3. Tap Run workflow on the main branch.
4. When the run succeeds, open it and scroll to Artifacts.
5. Download BattleForge-debug-APK and extract app-debug.apk.
6. Install it on your Android phone.

This produces a debug APK for testing, not a signed production release.

## Supabase online accounts and tournament registration

The client is configured with the Supabase project URL and publishable key. The publishable key is intended for browser/mobile clients; database security relies on Row Level Security and server-side database functions.

1. Apply `supabase/schema.sql` in the Supabase SQL Editor first.
2. Then run `supabase/seed.sql` in the Supabase SQL Editor to add the three starter tournaments and the public registration-count function.
3. Download the new APK from GitHub Actions after the build finishes.
4. If email confirmation is enabled, confirm the signup email before signing in.

The points wallet remains local demo data. Deposits, withdrawals, withdrawal fees, match-result verification and payouts are intentionally disabled.
