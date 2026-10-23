# BattleForge Google sign-in setup

BattleForge uses Supabase Auth with Google OAuth and the authorization-code (PKCE) flow. Email/password login remains available as a fallback. The Android app returns to `com.battleforge.arena://auth/callback`.

## 1. Create fresh Google OAuth credentials

1. Open [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials) and select the Google Cloud project for BattleForge.
2. Create a new OAuth client ID with application type **Web application**.
3. Under **Authorized redirect URIs**, add this exact callback URL:
   `https://izyttrbspxrcacwuhwer.supabase.co/auth/v1/callback`
4. Create the client and copy its client ID and newly generated client secret.
5. If an old secret was pasted into chat, rotate/revoke it and do not reuse it.

## 2. Configure Supabase Google provider

1. Open [BattleForge Supabase Auth Providers](https://supabase.com/dashboard/project/izyttrbspxrcacwuhwer/auth/providers).
2. Open Google, enable it, and paste the **matching** Web client ID and client secret from the same Google OAuth client.
3. Save the settings. Do not add quotes or whitespace around the values. Do not put the client secret in app code, GitHub, or the APK.
4. In [Supabase URL Configuration](https://supabase.com/dashboard/project/izyttrbspxrcacwuhwer/auth/url-configuration), add `com.battleforge.arena://auth/callback` to the allowed Redirect URLs. Keep the web app origin there too if web login is used.

## 3. Android build and test

1. Pushes to `main` trigger the GitHub Actions workflow to build a fresh debug APK.
2. Install the new APK and test **Continue with Google**. The app opens the system browser, Google returns to Supabase, and Supabase redirects to the app callback.
3. If the error is `invalid_client` / `The provided client secret is invalid`, it is still a Google Cloud ↔ Supabase credential mismatch. Re-check that the saved secret belongs to the exact client ID entered in Supabase; changing app code or rebuilding the APK cannot fix an invalid provider secret.
4. If Google sign-in completes but does not return to the app, verify the allowed redirect URL and that the installed APK was built from the current `main` branch.

Google setup follows the official [Supabase Google login guide](https://supabase.com/docs/guides/auth/social-login/auth-google).

Email/password login, account creation, logout, and account switching remain available. BattleForge wallet points remain demo-only; this does not enable real-money payments.
