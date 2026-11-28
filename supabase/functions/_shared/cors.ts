const ALLOWED_ORIGINS = new Set([
  "https://battleforge-website.vercel.app",
  "https://battleforge-website-battle-forge.vercel.app",
  "https://localhost",
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

export function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    ...(ALLOWED_ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
  };
}
