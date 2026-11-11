import { BLAZE_KNOWLEDGE } from "./knowledge.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;
const requestWindows = new Map<string, { startedAt: number; count: number }>();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function getClientKey(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("cf-connecting-ip") || "unknown";
}

function rateLimited(req: Request) {
  const key = getClientKey(req);
  const now = Date.now();
  const current = requestWindows.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    requestWindows.set(key, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > MAX_REQUESTS_PER_WINDOW;
}

function cleanMessages(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) {
    throw new Error("Send between 1 and 12 recent chat messages.");
  }
  const messages = value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid chat message.");
    const role = (item as Record<string, unknown>).role;
    const content = (item as Record<string, unknown>).content;
    if (!["user", "assistant", "model"].includes(String(role))) {
      throw new Error("Invalid chat role.");
    }
    if (typeof content !== "string" || !content.trim() || content.length > 1200) {
      throw new Error("Each message must contain 1 to 1,200 characters.");
    }
    return {
      role: role === "assistant" || role === "model" ? "model" : "user",
      parts: [{ text: content.trim() }],
    };
  });
  if (messages[messages.length - 1].role !== "user") {
    throw new Error("The latest chat message must be from the player.");
  }
  return messages;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (rateLimited(req)) return json({ error: "BLAZE is receiving messages too quickly. Please wait a minute and try again." }, 429);

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return json({ error: "BLAZE AI is not configured yet. Add the GEMINI_API_KEY secret in Supabase Edge Function Secrets." }, 503);
  }

  let messages;
  try {
    const body = await req.json();
    messages = cleanMessages(body?.messages);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Invalid request." }, 400);
  }

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: BLAZE_KNOWLEDGE + "\n\nCONVERSATION RULES\n- Answer the actual latest message, including casual conversation unrelated to BattleForge.\n- Use prior messages to understand context and follow-ups.\n- If the user changes topic, follow naturally.\n- Do not force every conversation back to BattleForge.\n- For current app facts not explicitly in the knowledge above, be transparent and direct the player to the live app screen.\n- Never fabricate access to account data or actions.",
            }],
          },
          contents: messages,
          generationConfig: {
            temperature: 0.75,
            topP: 0.9,
            maxOutputTokens: 700,
          },
        }),
      },
    );

    const result = await response.json();
    if (!response.ok) {
      console.error("Gemini API request failed:", response.status, result?.error?.message || "unknown error");
      const status = response.status === 429 ? 429 : 502;
      return json({
        error: response.status === 429
          ? "BLAZE is busy right now. Please try again shortly."
          : "BLAZE couldn't get a response right now. Please try again in a moment.",
      }, status);
    }

    const reply = (result?.candidates?.[0]?.content?.parts || [])
      .map((part: { text?: string }) => part.text || "")
      .join("")
      .trim();
    if (!reply) return json({ error: "BLAZE couldn't form a reply. Please try again." }, 502);
    return json({ reply });
  } catch (error) {
    console.error("BLAZE request error:", error);
    return json({ error: "BLAZE couldn't connect right now. Please try again." }, 502);
  }
});
