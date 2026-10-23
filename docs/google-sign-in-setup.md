# BattleForge Google sign-in setup

The app now has a **Continue with Google** button alongside email login and account creation. Email login/logout and account switching are available from the top-right account button.

## One-time Supabase setup

1. Open the Supabase project: https://supabase.com/dashboard/project/izyttrbspxrcacwuhwer
2. Go to **Authentication → Sign In / Providers → Google** and enable Google.
3. In Google Cloud Console, create/select an OAuth client ID for a Web application.
4. Add this exact URI to the Google OAuth client's **Authorized redirect URIs**:
   `https://izyttrbspxrcacwuhwer.supabase.co/auth/v1/callback`
5. Copy the Google client ID and client secret into Supabase's Google provider settings and save.
6. In Supabase **Authentication → URL Configuration**, set the Site URL to the public HTTPS URL where the web app is hosted. Add that same URL to Redirect URLs. Do not add secrets to the app source code.

## Important Android note

The OAuth button redirects to the current app origin. Google OAuth must be enabled in Supabase before it can work. For a native APK, Google sign-in may also require a native deep-link/browser callback configuration depending on how the app is opened; if Google returns to a blank page or does not return to BattleForge, stop and configure the Android callback rather than assuming sign-in succeeded.

Email/password login, account creation, logout, and switching accounts remain available. Wallet coins are still demo-only; this change does not enable real-money payments.
