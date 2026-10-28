import { createClient } from "npm:@supabase/supabase-js@2";
import { S3Client, PutObjectCommand, GetObjectCommand } from "npm:@aws-sdk/client-s3@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
async function sha256(value: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function asBytes(value: string) { return new TextEncoder().encode(value); }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "POST only" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return reply({ error: "Sign-in required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucketName = Deno.env.get("R2_BUCKET_NAME");
  if (!supabaseUrl || !anonKey || !serviceKey) return reply({ error: "Supabase server configuration missing" }, 500);
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) return reply({ error: "R2 configuration missing; set the four R2 secrets before use" }, 503);

  const token = authorization.slice("Bearer ".length);
  const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return reply({ error: "Invalid session" }, 401);

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: admin, error: adminError } = await db.from("admin_users").select("user_id").eq("user_id", authData.user.id).maybeSingle();
  if (adminError) {
    console.error("Admin authorization lookup failed", adminError.message);
    return reply({ error: "Could not verify admin access" }, 500);
  }
  if (!admin) return reply({ error: "Admin access required" }, 403);

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: "Invalid JSON body" }, 400); }
  const action = String(body.action ?? "");
  const playerId = String(body.player_id ?? "");
  const search = String(body.search ?? "").trim().slice(0, 80);

  if (action === "search-player") {
    if (search.length < 2) return reply({ error: "Enter at least 2 characters or a full player number" }, 400);
    let query = db.from("player_accounts").select("user_id,player_number,username,created_at").limit(20).order("player_number", { ascending: true });
    if (/^\d+$/.test(search)) {
      const { data, error } = await query.eq("player_number", Number(search));
      if (error) return reply({ error: "Player search failed" }, 500);
      return reply({ players: data ?? [] });
    }
    const { data, error } = await query.ilike("username", `%${search.replace(/[,%_]/g, "")}%`);
    if (error) return reply({ error: "Player search failed" }, 500);
    return reply({ players: data ?? [] });
  }

  if (!/^[0-9a-f-]{36}$/i.test(playerId)) return reply({ error: "A valid player ID is required" }, 400);
  const { data: player, error: playerError } = await db.from("player_accounts")
    .select("user_id,player_number,username,created_at").eq("user_id", playerId).maybeSingle();
  if (playerError) return reply({ error: "Player lookup failed" }, 500);
  if (!player) return reply({ error: "Player not found" }, 404);

  if (action === "archive-history") {
    const { data: results, error: resultsError } = await db.from("tournament_results")
      .select("id,tournament_id,entry_id,user_id,placement,kills,note,published,created_by,created_at,updated_at,earned_points")
      .eq("user_id", playerId).eq("published", true).order("created_at", { ascending: true }).limit(5000);
    if (resultsError) return reply({ error: "Could not load published match results" }, 500);
    if (!results?.length) return reply({ archived: false, message: "No published results to archive yet." });

    const tournamentIds = [...new Set(results.map((r: { tournament_id: number }) => r.tournament_id))];
    const { data: tournamentRows, error: tournamentError } = await db.from("tournaments")
      .select("id,title,game_mode,entry_points,prize_pool_points,max_players,status,starts_at,created_at,description,per_kill_points,is_past_match,results_published_at")
      .in("id", tournamentIds);
    if (tournamentError) return reply({ error: "Could not verify tournament history" }, 500);
    const pastIds = new Set((tournamentRows ?? []).filter((t: { is_past_match: boolean | null }) => t.is_past_match === true).map((t: { id: number }) => t.id));
    const eligible = results.filter((r: { tournament_id: number }) => pastIds.has(r.tournament_id));
    if (!eligible.length) return reply({ archived: false, message: "No published results from matches marked as past are eligible yet." });

    const { data: oldManifests, error: manifestError } = await db.from("r2_archive_manifest")
      .select("metadata").eq("player_id", playerId).eq("record_type", "tournament_history").eq("status", "verified");
    if (manifestError) return reply({ error: "Could not check existing archive manifest" }, 500);
    const archivedIds = new Set<number>();
    for (const row of oldManifests ?? []) {
      const ids = (row.metadata as Record<string, unknown>)?.tournament_ids;
      if (Array.isArray(ids)) for (const id of ids) archivedIds.add(Number(id));
    }
    const fresh = eligible.filter((r: { tournament_id: number }) => !archivedIds.has(Number(r.tournament_id)));
    if (!fresh.length) return reply({ archived: false, message: "All eligible past-match results for this player are already archived." });
    const freshIds = [...new Set(fresh.map((r: { tournament_id: number }) => Number(r.tournament_id)))];
    const freshTournaments = (tournamentRows ?? []).filter((t: { id: number }) => freshIds.includes(Number(t.id)));
    const payload = {
      schema_version: 1,
      archived_at: new Date().toISOString(),
      player: { user_id: player.user_id, player_number: player.player_number, username: player.username, created_at: player.created_at },
      record_type: "tournament_history",
      results: fresh,
      tournaments: freshTournaments,
    };
    const json = JSON.stringify(payload);
    const bytes = asBytes(json);
    if (bytes.byteLength > 4 * 1024 * 1024) return reply({ error: "Archive exceeds the 4 MB safety limit; split the history before retrying." }, 413);
    const checksum = await sha256(bytes);
    const objectKey = `players/${player.user_id}/tournament-history/${Date.now()}-${crypto.randomUUID()}.json`;
    try {
      await s3.send(new PutObjectCommand({ Bucket: bucketName, Key: objectKey, Body: bytes, ContentType: "application/json", Metadata: { sha256: checksum, player_id: player.user_id, archive_version: "1" } }));
    } catch (error) {
      console.error("R2 archive upload failed", error instanceof Error ? error.message : "unknown");
      return reply({ error: "Could not upload archive to private R2 storage. Original database records were not changed." }, 502);
    }
    const { data: manifest, error: insertError } = await db.from("r2_archive_manifest").insert({
      player_id: player.user_id, record_type: "tournament_history", object_key: objectKey,
      record_count: fresh.length, payload_sha256: checksum, archive_version: 1, status: "verified",
      metadata: { tournament_ids: freshIds, tournament_count: freshTournaments.length, source: "tournament_results", size_bytes: bytes.byteLength },
    }).select("id,record_count,archived_at").single();
    if (insertError) {
      console.error("Archive manifest insert failed; object remains safely in private R2", insertError.message);
      return reply({ error: "The archive uploaded, but its index could not be saved. Original records remain untouched; contact the developer before retrying.", orphaned_object: true }, 500);
    }
    return reply({ archived: true, manifest_id: manifest.id, record_count: manifest.record_count, archived_at: manifest.archived_at, message: "Verified archive copied to R2. Original database records were retained." });
  }

  if (action === "player-history") {
    const { data: liveResults, error: liveError } = await db.from("tournament_results")
      .select("id,tournament_id,entry_id,placement,kills,note,published,created_at,earned_points")
      .eq("user_id", playerId).eq("published", true).order("created_at", { ascending: false }).limit(200);
    if (liveError) return reply({ error: "Could not load live player history" }, 500);
    const { data: manifests, error: historyError } = await db.from("r2_archive_manifest")
      .select("id,object_key,record_count,payload_sha256,archived_at,metadata").eq("player_id", playerId)
      .eq("record_type", "tournament_history").eq("status", "verified").order("archived_at", { ascending: false }).limit(50);
    if (historyError) return reply({ error: "Could not load archive index" }, 500);
    const archives = [];
    for (const manifest of manifests ?? []) {
      try {
        const object = await s3.send(new GetObjectCommand({ Bucket: bucketName, Key: manifest.object_key }));
        const chunks = await object.Body?.transformToByteArray();
        if (!chunks || chunks.byteLength > 4 * 1024 * 1024) throw new Error("Invalid archive size");
        if (await sha256(chunks) !== manifest.payload_sha256) {
          await db.from("r2_archive_manifest").update({ status: "restore_required" }).eq("id", manifest.id);
          archives.push({ manifest_id: manifest.id, status: "checksum_mismatch", record_count: manifest.record_count });
          continue;
        }
        const payload = JSON.parse(new TextDecoder().decode(chunks));
        archives.push({ manifest_id: manifest.id, status: "verified", archived_at: manifest.archived_at, record_count: manifest.record_count, payload });
      } catch (error) {
        console.error("Archive read failed", manifest.id, error instanceof Error ? error.message : "unknown");
        archives.push({ manifest_id: manifest.id, status: "read_error", record_count: manifest.record_count });
      }
    }
    const tournamentIds = [...new Set((liveResults ?? []).map((r: { tournament_id: number }) => r.tournament_id))];
    let liveTournaments: unknown[] = [];
    if (tournamentIds.length) {
      const { data, error } = await db.from("tournaments").select("id,title,game_mode,is_past_match").in("id", tournamentIds);
      if (error) return reply({ error: "Could not load match titles" }, 500);
      liveTournaments = data ?? [];
    }
    return reply({ player, live_results: liveResults ?? [], live_tournaments: liveTournaments, archives });
  }

  return reply({ error: "Unsupported action" }, 400);
});