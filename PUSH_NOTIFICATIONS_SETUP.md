# BattleForge Android push notifications setup

The app registers Android FCM device tokens and Supabase targets all devices or only players registered for a selected match. Match push text is generic; room credentials remain inside the authenticated app.

## One-time Firebase setup
1. Open https://console.firebase.google.com/ and create/select a Firebase project for BattleForge.
2. Add an Android app with package ID `com.battleforge.arena` (from `capacitor.config.json`).
3. Download `google-services.json`; do not commit it. Add a GitHub Actions secret `GOOGLE_SERVICES_JSON_BASE64` containing the Base64-encoded file.
4. In Firebase Console → Project settings → Service accounts, generate a private key JSON. Store the entire JSON as a Supabase Edge Function secret named `FIREBASE_SERVICE_ACCOUNT_JSON`. Never place it in app.js or a client build.
5. Apply `supabase/migrations/013_push_notifications.sql` and deploy both `supabase/functions/send-push-notification` and `supabase/functions/notify-admin-payment-request`. The second function sends deposit and withdrawal request alerts to every registered admin device; deposit requests are stored as `reported_paid` after the player submits a UTR.
6. The build workflow needs to decode `GOOGLE_SERVICES_JSON_BASE64` to `android/app/google-services.json` before Gradle build.

Without Firebase credentials, notifications are still saved to the in-app feed; the admin UI indicates phone push setup is still required.


## Admin payment request alerts

The `notify-admin-payment-request` function requires an authenticated player session, validates that the submitted request belongs to that player, and sends high-priority FCM notifications to registered admin devices. The Android build must include the `GOOGLE_SERVICES_JSON_BASE64` GitHub Actions secret; otherwise the APK can build but Android devices cannot register fresh FCM tokens.
