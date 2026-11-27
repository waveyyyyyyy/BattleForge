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

function b64url(input: Uint8Array | string) { const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input; let binary = ""; for (const b of bytes) binary += String.fromCharCode(b); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function pemBytes(pem: string) { const raw = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, ""); const binary = atob(raw); return Uint8Array.from(binary, c => c.charCodeAt(0)); }
async function getFcmAccessToken(sa: any) { const now = Math.floor(Date.now()/1000); const head=b64url(JSON.stringify({alg:"RS256",typ:"JWT"})); const claim=b64url(JSON.stringify({iss:sa.client_email,scope:"https://www.googleapis.com/auth/firebase.messaging",aud:sa.token_uri||"https://oauth2.googleapis.com/token",iat:now,exp:now+3600})); const unsigned=`${head}.${claim}`; const key=await crypto.subtle.importKey("pkcs8",pemBytes(sa.private_key),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]); const sig=new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,new TextEncoder().encode(unsigned))); const assertion=`${unsigned}.${b64url(sig)}`; const response=await fetch(sa.token_uri||"https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion})}); const data=await response.json(); if(!response.ok) throw new Error(`Google OAuth failed: ${data.error_description||data.error||response.status}`); return data.access_token as string; }
Deno.serve(async req => {
 if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders(req)}); if(req.method!=="POST") return json(req,{error:"Method not allowed"},405);
 const contentLength=Number(req.headers.get("content-length")||0); if(contentLength>20000) return json(req,{error:"Request is too large"},413);
 const url=Deno.env.get("SUPABASE_URL")!, anon=Deno.env.get("SUPABASE_ANON_KEY")!, service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 const auth=req.headers.get("Authorization")||""; const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}}); const {data:{user},error:userError}=await userClient.auth.getUser(); if(userError||!user) return json(req,{error:"Authentication required"},401);
 const adminClient=createClient(url,service); const {data:admin}=await adminClient.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle(); if(!admin) return json(req,{error:"Admin access required"},403);
 if(await rateLimited(adminClient,"push-broadcast",user.id,60,5)) return json(req,{error:"Too many broadcasts. Wait a minute and try again."},429);
 let body:any; try{const raw=await req.text();if(new TextEncoder().encode(raw).byteLength>20000)return json(req,{error:"Request is too large"},413);body=JSON.parse(raw)}catch{return json(req,{error:"Invalid JSON body"},400)}
 const title=String(body.title||"").trim().slice(0,80), message=String(body.message||"").trim().slice(0,1000), audience=body.audience_type==="match"?"match":body.audience_type==="all"?"all":""; const tournamentId=audience==="match"?Number(body.tournament_id):null;
 if(!title||!message||!audience||(audience==="match"&&(!Number.isSafeInteger(tournamentId)||tournamentId<=0))) return json(req,{error:"Enter a title, message, and valid audience/match."},400);
 let recipientIds:string[]=[]; let pushMessage=message;
 if(audience==="match"){const {data:t}=await adminClient.from("tournaments").select("id,title,is_past_match").eq("id",tournamentId).maybeSingle(); if(!t||t.is_past_match)return json(req,{error:"Choose an active match."},400); const {data:entries,error}=await adminClient.from("tournament_entries").select("user_id").eq("tournament_id",tournamentId); if(error)return json(req,{error:"Could not load match registrations."},500); recipientIds=[...new Set((entries||[]).map((e:any)=>e.user_id))]; if(!recipientIds.length)return json(req,{error:"No players are registered for this match yet."},400); const {data:room}=await adminClient.from("tournament_rooms").select("room_id,room_password,published").eq("tournament_id",tournamentId).eq("published",true).maybeSingle(); if(room?.published && (room.room_id || room.room_password)){pushMessage=(message+"\nRoom ID: "+String(room.room_id||"Not set")+"\nPassword: "+String(room.room_password||"Not set")).slice(0,3500);}}
 const {data:notice,error:insertError}=await adminClient.from("notification_broadcasts").insert({title,message,created_by:user.id,audience_type:audience,tournament_id:tournamentId}).select("id,title,message,created_at,audience_type,tournament_id").single(); if(insertError){console.error("Notification insert failed",insertError.message);return json(req,{error:"Could not save notification"},500);}
 const raw=Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON"); if(!raw)return json(req,{ok:true,id:notice.id,pushConfigured:false,sent:0,targetCount:audience==="match"?recipientIds.length:null});
 try{const sa=JSON.parse(raw); if(!sa.project_id||!sa.client_email||!sa.private_key)throw new Error("Firebase service account JSON is incomplete");
 if(audience==="all"){const {data:devices,error}=await adminClient.from("push_devices").select("token"); if(error)throw new Error("Could not load push devices"); recipientIds=[...new Set((devices||[]).map((d:any)=>d.token))];}else{const {data:devices,error}=await adminClient.from("push_devices").select("token,user_id").in("user_id",recipientIds);if(error)throw new Error("Could not load match devices");recipientIds=[...new Set((devices||[]).map((d:any)=>d.token))];}
 const access=await getFcmAccessToken(sa);let sent=0,failed=0; for(const token of recipientIds){const pushTitle=title;const pushBody=audience==="match"?pushMessage:message;const response=await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,{method:"POST",headers:{Authorization:`Bearer ${access}`,"Content-Type":"application/json"},body:JSON.stringify({message:{token,notification:{title:pushTitle,body:pushBody},data:{notificationId:String(notice.id),audienceType:audience,tournamentId:tournamentId?String(tournamentId):"",destination:audience==="match"?"match":"notifications"},android:{priority:"HIGH",notification:{channel_id:"battleforge_updates",sound:"default"}}}})});if(response.ok)sent++;else failed++;}
 return json(req,{ok:true,id:notice.id,pushConfigured:true,sent,failed,targetCount:recipientIds.length});}catch(error){console.error("FCM send failed",error);return json(req,{ok:true,id:notice.id,pushConfigured:true,sent:0,error:"Notification saved in-app, but push delivery failed. Check Firebase service-account configuration."});}
});

