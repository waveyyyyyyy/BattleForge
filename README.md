

## Supabase online accounts and tournament registration

The client is configured with the Supabase project URL and publishable key. The publishable key is intended for browser/mobile clients; security depends on Row Level Security policies and the database functions, not on hiding this key.

1. The base schema in `supabase/schema.sql` must be applied first.
2. Then run `supabase/seed.sql` in the Supabase SQL Editor to add the three starter tournaments and the public registration-count function.
3. Build the APK from GitHub Actions. New builds connect to Supabase for email/password accounts and online tournament registrations.
4. If email confirmation is enabled, confirm the signup email before signing in.

The points wallet remains local demo data. Deposits, withdrawals, withdrawal fees, match-result verification and payouts are intentionally disabled.
