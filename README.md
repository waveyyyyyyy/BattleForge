# BattleForge Arena

BattleForge is a Free Fire community tournament app built with a Vite web client, Capacitor Android wrapper and Supabase backend.

## Project status

This repository contains an actively developed app with Supabase authentication, player profiles/IDs, tournament registration and results, player support/disputes, wallet request workflows, admin tools, push notification integration and Android build automation.

**It is not approved for public production launch.** Paid-entry tournaments and rewards require a product-specific Indian legal review under the Promotion and Regulation of Online Gaming Act, 2025 and Rules, 2026. Do not treat the esports label or skill-based gameplay alone as legal clearance.

## Important project docs

- [Launch readiness and operational runbook](docs/LAUNCH_READINESS.md)
- [Player policies (review drafts)](public/legal/index.html)
- [Admin setup](ADMIN_SETUP.md)
- [Push notification setup](PUSH_NOTIFICATIONS_SETUP.md)

The policy page is a draft. Complete all highlighted operator/contact fields, obtain qualified legal review, and implement every required safeguard before publishing it as final.

## Android builds

The current workflow `.github/workflows/build-apk.yml` creates a **debug APK** for testing through GitHub Actions. A debug APK is not a signed production release. Production signing, secure keystore handling and release verification are still required; see the launch runbook.

## Security principles

- Never place Supabase service-role keys, Firebase service-account keys, UPI secrets or Android signing keystores in client code or source control.
- Keep wallet balances and transactions server-controlled. Preserve the distinction between deposited and earned balances.
- Keep admin authorization inside database functions and server-side policy checks; hiding an admin button is not authorization.
- Review Supabase Security Advisor findings before each release. Do not silence warnings with broad grants or policies.
- Test backup restoration, not just backup creation.

## Development

Install dependencies with the package manager selected for the project, then run:

```bash
npm install
npm run build
```

For the Android test build, use the GitHub Actions workflow and download its `BattleForge-debug-APK` artifact. Do not distribute it as a production release.
