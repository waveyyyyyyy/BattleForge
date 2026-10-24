# BattleForge Android push notifications setup

The app registers Android FCM device tokens and Supabase targets all devices or only players registered for a selected match. Match push text is generic; room credentials remain inside the authenticated app.

## One-time Firebase setup
1. Open https://console.firebase.google.com/ and create/select a Firebase project for BattleForge.
2. Add an Android app with package ID `com.battleforge.arena` (from `capacitor.config.json`).
3. Download `google-services.json`; do not commit it. Add a GitHub Actions secret `GOOGLE_SERVICES_JSON_BASE64` containing the Base64-encoded file.
4. In Firebase Console → Project settings → Service accounts, generate a private key JSON. Store the entire JSON as a Supabase Edge Function secret named `FIREBASE_SERVICE_ACCOUNT_JSON`. Never place it in app.js or a client build.
5. Apply `supabase/migrations/013_push_notifications.sql` and deploy `supabase/functions/send-push-notification`.
6. The build workflow needs to decode `GOOGLE_SERVICES_JSON_BASE64` to `android/app/google-services.json` before Gradle build.

Without Firebase credentials, notifications are still saved to the in-app feed; the admin UI indicates phone push setup is still required.
