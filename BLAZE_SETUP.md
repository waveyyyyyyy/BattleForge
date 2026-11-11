# BLAZE AI setup

BLAZE's conversational chat uses the Gemini 2.5 Flash API through a Supabase Edge Function. The model key is server-side only; it is never included in the APK or browser bundle.

## One-time setup

1. Create a Gemini API key in Google AI Studio: https://aistudio.google.com/app/apikey
2. In Supabase, open project `izyttrbspxrcacwuhwer` → Edge Functions → Secrets.
3. Add a secret named `GEMINI_API_KEY` and paste the key as its value.
4. Deploy the `blaze-chat` Edge Function from `supabase/functions/blaze-chat/index.ts` (the function source and `knowledge.ts` are in this repository).
5. Reopen BattleForge, sign in, and test BLAZE with a normal question and a BattleForge question.

## Important

- The Gemini free tier has usage/rate limits and Google's current terms say free-tier prompts may be used to improve its products. Review the current Gemini API terms before enabling this for real players. For production privacy, use an eligible paid tier or a provider plan whose data terms meet your requirements.
- BLAZE currently has no access to private player balances, deposits, withdrawals, email addresses, or match-room credentials. It explains app rules and guides players to the correct screen instead of guessing.
- The function limits each message to 1,200 characters, keeps only the latest 12 chat turns in the request, caps output, and applies a best-effort per-IP rate limit.
- Never put the Gemini API key in `.env` variables prefixed with `VITE_`, in app.js, or anywhere in the APK.
- Update `supabase/functions/blaze-chat/knowledge.ts` whenever BattleForge rules, pricing, screens, or workflows change.
