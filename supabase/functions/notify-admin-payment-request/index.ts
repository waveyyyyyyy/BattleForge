import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const ALLOWED_ORIGINS = new Set(["https://battleforge-website.vercel.app","https://battleforge-website-battle-forge.vercel.app","https://localhost","capacitor://localhost","ionic://localhost","http://localhost:5173","http://127.0.0.1:5173"]);
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


function b64url(input: Uint8Array | string) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function pemBytes(pem: string) {
  const raw = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(raw);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
async function getFcmAccessToken(sa: any) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: sa.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${head}.${claim}`;
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(sa.private_key), {
    name: "RSASSA-PKCS1-v1_5", hash: "SHA-256",
  }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned),
  ));
  const assertion = `${unsigned}.${b64url(signature)}`;
  const response = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Google OAuth failed: ${data.error_description || data.error || response.status}`);
  return data.access_token as string;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 12000) return json(req, { error: "Request is too large" }, 413);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json(req,{ error: "Server configuration is incomplete" }, 500);

  const auth = req.headers.get("Authorization") || "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json(req,{ error: "Authentication required" }, 401);

  const adminClient = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  if (await rateLimited(adminClient, "payment-admin-alert", user.id, 600, 8)) return json(req, { error: "Too many payment alerts. Please wait before retrying." }, 429);

  let body: any;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 12000) return json(req, { error: "Request is too large" }, 413);
    body = JSON.parse(raw);
  } catch { return json(req, { error: "Invalid JSON body" }, 400); }
  const kind = body.request_type;
  const requestId = String(body.request_id || "");
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!["deposit", "withdrawal"].includes(kind) || !uuidPattern.test(requestId)) {
    return json(req,{ error: "Invalid request type or ID" }, 400);
  }

  const table = kind === "deposit" ? "deposit_requests" : "withdrawal_requests";
  const { data: request, error: requestError } = await adminClient
    .from(table).select("id,user_id,amount,status").eq("id", requestId).maybeSingle();
  if (requestError || !request || request.user_id !== user.id) {
    return json(req,{ error: "Request not found for this user" }, 404);
  }

  // Deposit submissions are atomically changed to reported_paid after the player enters the UTR.
  const requestStatus = String(request.status || "").toLowerCase();
  const allowedStatuses = kind === "deposit" ? ["pending", "reported_paid"] : ["pending"];
  if (!allowedStatuses.includes(requestStatus)) {
    return json(req,{ ok: true, sent: 0, reason: "Request is no longer awaiting review" });
  }

  const { data: admins, error: adminError } = await adminClient.from("admin_users").select("user_id");
  if (adminError) return json(req,{ error: "Could not load admins" }, 500);
  const adminIds = [...new Set((admins || []).map((x: any) => x.user_id).filter(Boolean))];
  if (!adminIds.length) return json(req,{ ok: true, sent: 0, reason: "No admin accounts configured" });

  const { data: devices, error: deviceError } = await adminClient
    .from("push_devices").select("token,user_id").in("user_id", adminIds);
  if (deviceError) return json(req,{ error: "Could not load admin devices" }, 500);
  const tokens = [...new Set((devices || []).map((x: any) => x.token).filter(Boolean))];
  if (!tokens.length) {
    return json(req,{ ok: true, sent: 0, reason: "No registered admin devices; admin must sign in and allow notifications" });
  }

  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!raw) return json(req,{ error: "Push notifications are not configured" }, 503);
  try {
    const sa = JSON.parse(raw);
    const access = await getFcmAccessToken(sa);
    const title = kind === "deposit" ? "New deposit request" : "New withdrawal request";
    const message = `₹${Number(request.amount || 0).toFixed(2)} · Request ${request.id.slice(0, 8)} is awaiting review.`;
    let sent = 0, failed = 0;
    for (const token of tokens) {
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body: message },
            data: { destination: "admin-payments", requestType: kind, requestId: String(request.id) },
            android: { priority: "HIGH", notification: { channel_id: "battleforge_updates", sound: "default" } },
          },
        }),
      });
      if (response.ok) sent++;
      else { failed++; console.error("FCM send failed", kind, response.status, await response.text()); }
    }
    return json(req,{ ok: true, sent, failed, targetCount: tokens.length });
  } catch (error) {
    console.error("Admin payment push failed", error);
    return json(req,{ error: "Could not deliver admin push notification" }, 500);
  }
});
