import { createClient } from "npm:@supabase/supabase-js@2";
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3@3";

const ALLOWED_ORIGINS = new Set(["https://battleforge-website.vercel.app","https://battleforge-website-k74pt4hx5-battle-forge.vercel.app","https://battleforge-website-git-security-hardening-129197-battle-forge.vercel.app","https://localhost","capacitor://localhost","ionic://localhost","http://localhost:5173","http://127.0.0.1:5173"]);
function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    ...(ALLOWED_ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
  };
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" } });
}
async function rateLimited(client: ReturnType<typeof createClient>, scope: string, userId: string, windowSeconds: number, maxRequests: number) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(scope + ":" + userId));
  const key = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
  const { data, error } = await client.rpc("consume_edge_rate_limit", { p_rate_key: key, p_window_seconds: windowSeconds, p_max_requests: maxRequests });
  if (error) { console.error("Shared rate limiter unavailable", error.message); return true; }
  return data === true;
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "POST only" }, 405);
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json(req, { error: "Sign-in required" }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseKey) return json(req, { error: "Supabase auth configuration missing" }, 500);
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase.auth.getUser(auth.slice("Bearer ".length));
  if (error || !data.user) return json(req, { error: "Invalid session" }, 401);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) return json(req, { error: "Server authorization configuration missing" }, 503);
  const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const userClient = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: access, error: accessError } = await userClient.rpc("get_my_admin_access");
  if (accessError || access?.is_owner !== true) return json(req, { error: "Owner access required" }, 403);
  if (await rateLimited(adminClient, "r2-upload-test", data.user.id, 60, 1)) return json(req, { error: "Test uploads are limited to one per minute." }, 429);

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 1024) return json(req, { error: "Request is too large" }, 413);
  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucketName = Deno.env.get("R2_BUCKET_NAME");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) return json(req, { error: "R2 secrets missing" }, 500);
  const s3 = new S3Client({ region: "auto", endpoint: `https://${accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey } });
  try {
    await s3.send(new PutObjectCommand({ Bucket: bucketName, Key: "battleforge-tests/connection-check.txt", Body: "BattleForge R2 connection test successful.", ContentType: "text/plain" }));
    return json(req, { ok: true, message: "R2 upload successful" });
  } catch (e) {
    console.error("R2 upload failed:", e);
    return json(req, { error: "R2 upload failed; check logs" }, 500);
  }
});