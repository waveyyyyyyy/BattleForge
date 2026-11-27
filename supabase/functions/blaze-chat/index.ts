import { createClient } from "npm:@supabase/supabase-js@2";
import { BLAZE_KNOWLEDGE } from "./knowledge.ts";

const ALLOWED_ORIGINS = new Set(["https://battleforge-website.vercel.app","https://battleforge-website-battle-forge.vercel.app","https://battleforge-website-8c13whz27-battle-forge.vercel.app","http://localhost","https://localhost","capacitor://localhost","ionic://localhost"]);
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
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" },
  });
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;
const requestWindows = new Map<string, { startedAt: number; count: number }>();

function getClientKey(req: Request) {
  return req.headers.get("cf-connecting-ip")?.trim()
    || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}
function rateLimitedLocal(req: Request) {
  const key = getClientKey(req);
  const now = Date.now();
  const current = requestWindows.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    requestWindows.set(key, { startedAt: now, count: 1 });
    if (requestWindows.size > 5000) {
      for (const [k, v] of requestWindows) if (now - v.startedAt >= WINDOW_MS) requestWindows.delete(k);
    }
    return false;
  }
  current.count += 1;
  return current.count > MAX_REQUESTS_PER_WINDOW;
}
async function rateLimitedShared(req: Request, userId: string, serviceClient: ReturnType<typeof createClient>) {
  const ip = getClientKey(req);
  const key = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("blaze:" + userId + ":" + ip));
  const hex = [...new Uint8Array(key)].map(b => b.toString(16).padStart(2, "0")).join("");
  const { data, error } = await serviceClient.rpc("consume_edge_rate_limit", {
    p_rate_key: hex, p_window_seconds: 60, p_max_requests: 12,
  });
  if (error) {
    console.error("Shared BLAZE rate limit unavailable", error.message);
    return true;
  }
  return data === true;
}
function cleanMessages(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) {
    throw new Error("Send between 1 and 12 recent chat messages.");
  }
  const messages = value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid chat message.");
    const role = (item as Record<string, unknown>).role;
    const content = (item as Record<string, unknown>).content;
    if (!["user", "assistant", "model"].includes(String(role))) throw new Error("Invalid chat role.");
    if (typeof content !== "string" || !content.trim() || content.length > 1200) {
      throw new Error("Each message must contain 1 to 1,200 characters.");
    }
    return { role: role === "assistant" || role === "model" ? "model" : "user", parts: [{ text: content.trim() }] };
  });
  if (messages[messages.length - 1].role !== "user") throw new Error("The latest chat message must be from the player.");
  return messages;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req,{ error: "Method not allowed." }, 405);
  if (rateLimitedLocal(req)) return json(req,{ error: "BLAZE is receiving messages too quickly. Please wait a minute and try again." }, 429);
  const length = Number(req.headers.get("content-length") || 0);
  if (length > 20_000) return json(req,{ error: "Request is too large." }, 413);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!url || !anon || !service) return json(req,{ error: "BLAZE authentication is not configured." }, 503);
  if (!apiKey) return json(req,{ error: "BLAZE AI is not configured yet." }, 503);

  const authorization = req.headers.get("Authorization") || "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json(req,{ error: "Authentication required." }, 401);

  const serviceClient = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  if (await rateLimitedShared(req, authData.user.id, serviceClient)) {
    return json(req,{ error: "BLAZE is receiving messages too quickly. Please wait a minute and try again." }, 429);
  }

  let messages;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 20_000) return json(req,{ error: "Request is too large." }, 413);
    const body = JSON.parse(raw);
    messages = cleanMessages(body?.messages);
  } catch (error) {
    return json(req,{ error: error instanceof Error ? error.message : "Invalid request." }, 400);
  }

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: BLAZE_KNOWLEDGE + "\n\nCONVERSATION RULES\n- Answer the actual latest message, including casual conversation unrelated to BattleForge.\n- Use prior messages to understand context and follow-ups.\n- If the user changes topic, follow naturally.\n- Do not force every conversation back to BattleForge.\n- For current app facts not explicitly in the knowledge above, be transparent and direct the player to the live app screen.\n- Never fabricate access to account data or actions." }] },
          contents: messages,
          generationConfig: { temperature: 0.75, topP: 0.9, maxOutputTokens: 700 },
        }),
      },
    );
    const result = await response.json();
    if (!response.ok) {
      console.error("Gemini API request failed:", response.status, result?.error?.message || "unknown error");
      return json(req,{ error: response.status === 429 ? "BLAZE is busy right now. Please try again shortly." : "BLAZE couldn't get a response right now. Please try again in a moment." }, response.status === 429 ? 429 : 502);
    }
    const reply = (result?.candidates?.[0]?.content?.parts || []).map((part: { text?: string }) => part.text || "").join("").trim();
    if (!reply) return json(req,{ error: "BLAZE couldn't form a reply. Please try again." }, 502);
    return json(req,{ reply });
  } catch (error) {
    console.error("BLAZE request error:", error);
    return json(req,{ error: "BLAZE couldn't connect right now. Please try again." }, 502);
  }
});