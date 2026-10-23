# BattleForge Arena

Mobile-first Free Fire community tournament prototype. This project is a demo UI, not a production real-money tournament platform.

## What works in the demo
- Responsive BattleForge tournament screen
- Solo, duo and squad sample tournaments
- Demo point balance, local join flow and activity history
- Local profile label and rules panels
- Capacitor Android wrapper and GitHub Actions APK build

## Important limitations
- No real deposits, withdrawals, cash prizes, or payment gateway
- No login/OTP, cloud database, admin authentication, anti-cheat, or verified results
- Demo balance and history are stored only in the browser/device and can be reset
- Do not use this prototype to collect or hold real customer funds

Before launching a real-money tournament product, implement a secure backend and transaction ledger, authenticate admins, validate match results, set up compliant payment processing, and obtain appropriate legal advice for the target regions.

## Build the APK on GitHub using an Android phone
1. Open the repository Actions tab.
2. Select Build BattleForge Android APK.
3. Tap Run workflow on the main branch (or wait for a push build to finish).
4. Open the completed run and scroll to Artifacts.
5. Download BattleForge-debug-APK; unzip it to access app-debug.apk.
6. On your Android phone, install the APK. Android may ask you to allow installs from that browser/files app.

The workflow builds a debug APK. It is for testing, not a signed release build for publishing to Google Play.