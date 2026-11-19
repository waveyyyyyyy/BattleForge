import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

const SUPABASE_URL = 'https://izyttrbspxrcacwuhwer.supabase.co';
const SUPABASE_KEY = 'sb_publishable_79ln_ouADVGWi6H5ZTc6Qg_c3ifNfQ7';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { flowType: 'pkce', detectSessionInUrl: false } });

const $ = (s) => document.querySelector(s);
let balance = read('bf_balance', 250);
let history = read('bf_history', []);
let tournaments = [];
let joined = [];
let currentUser = null;
let isAdmin = false;
let pendingResultEntry = null;
let counts = {};

function read(k, fallback) {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; }
}
function saveLocal() {
  localStorage.setItem('bf_balance', JSON.stringify(balance));
  localStorage.setItem('bf_history', JSON.stringify(history));
}
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
}
function modal(html) {
  const overlay=$('#modal');$('#modalContent').innerHTML=html;
  overlay.classList.toggle('admin-modal',html.includes('admin-dashboard-head'));
  overlay.classList.remove('hidden');
}
function close() { $('#modal').classList.add('hidden');$('#modal').classList.remove('admin-modal'); }
function setPage(tab) {
  const target = tab === 'arena-list' ? 'arena' : (['arena','wallet','history','rules'].includes(tab) ? tab : 'arena');
  document.querySelectorAll('.page-view').forEach(page => page.classList.toggle('active', page.dataset.page === target));
  document.addEventListener('click',async e=>{const b=e.target.closest('[data-payment-action]');if(b)await handleAdminPaymentAction(b);});
document.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === target));
  document.body.dataset.page = target;
  close();
  if (target === 'history') showHistory();
  if (target === 'wallet') renderWallet();
  if (tab === 'arena-list') $('#arena-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else window.scrollTo({ top: 0, behavior: 'smooth' });
}
const RECEIVING_UPI_ID = 'kjaman@fam';
let depositTimerInterval = null;
function cleanUpi(value) { return String(value || '').trim().toLowerCase(); }
function validUpi(value) { return /^[a-z0-9._-]{2,100}@[a-z0-9.-]{2,50}$/i.test(String(value || '').trim()); }
function showDepositForm() {
  if (!currentUser) { showAuth(); return; }
  modal('<h2>Deposit request</h2><p>Scan this QR code to pay BattleForge, then enter your transaction details below.</p><img class="deposit-qr" src="/IMG_20261023_162105_815.jpg" alt="BattleForge UPI payment QR code"><p class="notice">Deposits can take up to 24 hours to verify.</p><label class="field">AMOUNT (₹)<input id="depositAmount" type="number" min="1" max="50000" step="1" inputmode="numeric" placeholder="100"></label><label class="field">YOUR PAYING UPI ID<input id="depositPayerUpi" maxlength="100" autocomplete="off" placeholder="yourname@upi"></label><label class="field">UTR / TRANSACTION REFERENCE NUMBER<input id="depositUtr" maxlength="100" autocomplete="off" autocapitalize="characters" placeholder="Enter UTR from your UPI app" required></label><div class="room-card"><small class="room-label">PAY TO THIS UPI ID</small><div class="room-value"><b id="depositReceiverUpi">kjaman@fam</b><button id="copyDepositUpi" class="outline">Copy</button></div><p>Pay the exact amount only after creating the request. Do not share your UPI PIN or OTP.</p></div><p class="notice">A 2-minute timer is for the request window only. It does not verify payment. Late payments must still be checked manually; screenshots alone are not proof.</p><button id="createDepositRequest" class="join full">Create deposit request</button>');
}
function showWithdrawalForm() {
  if (!currentUser) { showAuth(); return; }
  modal('<h2>Withdrawal request</h2><p>Enter the exact account-holder name and destination UPI ID.</p><p class="notice">Withdrawals can take up to 24 hours to process.</p><label class="field">EXACT ACCOUNT HOLDER NAME<input id="withdrawName" maxlength="120" autocomplete="name" placeholder="Name as shown by your bank/UPI app"></label><label class="field">YOUR RECEIVING UPI ID<input id="withdrawUpi" maxlength="100" autocomplete="off" placeholder="yourname@upi"></label><label class="field">AMOUNT (₹)<input id="withdrawAmount" type="number" min="1" max="50000" step="1" inputmode="numeric" placeholder="100"></label><div class="room-card"><div class="room-value">Planned withdrawal fee <b>2%</b></div><div class="room-value">You receive <b id="withdrawNet">₹0.00</b></div></div><p class="notice">This creates a review request only. It does not transfer money. Never enter your UPI PIN or OTP.</p><button id="createWithdrawalRequest" class="join full">Submit withdrawal request</button>');
  $('#withdrawAmount')?.addEventListener('input', updateWithdrawalNet);
}
function updateWithdrawalNet() { const amount = Number($('#withdrawAmount')?.value || 0); const out = $('#withdrawNet'); if (out) out.textContent = '₹' + (Number.isFinite(amount) && amount > 0 ? (amount * .98).toFixed(2) : '0.00'); }
async function createPaymentRequest(kind) {
  if (!currentUser) { showAuth(); return; }
  const isDeposit = kind === 'deposit';
  const button = $(isDeposit ? '#createDepositRequest' : '#createWithdrawalRequest');
  const amount = Number($(isDeposit ? '#depositAmount' : '#withdrawAmount')?.value);
  const upi = cleanUpi($(isDeposit ? '#depositPayerUpi' : '#withdrawUpi')?.value);
  const name = isDeposit ? null : $('#withdrawName')?.value.trim();
  const paymentReference = isDeposit ? $('#depositUtr')?.value.trim() : null;
  if (!Number.isInteger(amount) || amount < 1 || amount > 50000) return toast('Enter a whole amount between ₹1 and ₹50,000.');
  if (!validUpi(upi)) return toast('Enter a valid UPI ID, like name@upi.');
  if (isDeposit && (!paymentReference || paymentReference.length < 6 || paymentReference.length > 100)) return toast('Enter a valid UTR / transaction reference number (6–100 characters).');
  if (!isDeposit && (!name || name.length < 2 || name.length > 120)) return toast('Enter the exact account-holder name.');
  button.disabled = true;
  const { data, error } = await supabase.rpc(isDeposit ? 'create_deposit_request' : 'create_withdrawal_request', isDeposit ? { p_amount: amount, p_payer_upi: upi, p_payment_reference: paymentReference } : { p_amount: amount, p_account_name: name, p_payout_upi: upi });
  button.disabled = false;
  if (error) { console.error(error); return toast('Could not save request. Apply supabase/006_payment_requests.sql in Supabase SQL Editor, then retry.'); }
  const row = Array.isArray(data) ? data[0] : data;
  close();
  if (isDeposit) showDepositTimer(row);
  else { toast('Withdrawal request saved for review. No money has been sent.'); await loadPaymentRequests(); }
}
function showDepositTimer(row) {
  const expires = new Date(row.expires_at).getTime();
  modal('<h2>Deposit request created</h2><p>Request ID: <b>'+esc(row.id)+'</b></p><p>UTR submitted: <b>'+esc(row.payment_reference||paymentReference)+'</b></p><div class="wallet-total"><span id="depositCountdown">02:00</span></div><div class="room-card"><small class="room-label">SEND EXACT AMOUNT TO</small><div class="room-value"><b>kjaman@fam</b><button id="copyDepositUpiActive" class="outline">Copy UPI</button></div><div class="room-value">Amount <b>₹'+Number(row.amount).toFixed(2)+'</b></div></div><p class="notice">Status: PENDING VERIFICATION. Deposit verification can take up to 24 hours. This timer is not payment confirmation. If your payment is late, do not pay again; contact support with the request ID. Your wallet will not be credited until a trusted transaction record is verified.</p><button id="depositPaidNotice" class="join full">I have paid — submit for verification</button><button id="closeDepositTimer" class="outline full">Close</button>');
  if (depositTimerInterval) clearInterval(depositTimerInterval);
  const tick = () => { const el=$('#depositCountdown'); if (!el) { clearInterval(depositTimerInterval); return; } const left=Math.max(0,Math.ceil((expires-Date.now())/1000)); el.textContent=String(Math.floor(left/60)).padStart(2,'0')+':'+String(left%60).padStart(2,'0'); if (!left) { el.textContent='EXPIRED'; clearInterval(depositTimerInterval); toast('Request timer expired. A payment may still need manual checking.'); } };
  tick(); depositTimerInterval=setInterval(tick,1000);
  $('#copyDepositUpiActive')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(RECEIVING_UPI_ID); toast('UPI ID copied.'); } catch { toast('UPI ID: '+RECEIVING_UPI_ID); } });
  $('#depositPaidNotice')?.addEventListener('click', async () => { const { error }=await supabase.rpc('mark_deposit_payment_reported',{p_request_id:row.id}); if(error) return toast('Could not update request. Please retry.'); toast('Marked as reported. It remains pending until verified.'); await loadPaymentRequests(); close(); });
  $('#closeDepositTimer')?.addEventListener('click', async () => { close(); await loadPaymentRequests(); });
}
async function loadPaymentRequests() {
  const target=$('#paymentRequests'); if(!target) return;
  if(!currentUser) { target.innerHTML='<p class="notice">Sign in to view payment requests.</p>'; return; }
  const [dep,wd]=await Promise.all([supabase.from('deposit_requests').select('id,amount,status,created_at,expires_at,payer_upi,payment_reference').order('created_at',{ascending:false}).limit(10),supabase.from('withdrawal_requests').select('id,amount,fee_amount,net_amount,status,created_at,account_name,payout_upi').order('created_at',{ascending:false}).limit(10)]);
  if(dep.error||wd.error) { target.innerHTML='<p class="notice">Payment-request database is not ready. Apply supabase/006_payment_requests.sql in the Supabase SQL Editor.</p>'; return; }
  const rows=[...(dep.data||[]).map(x=>({...x,kind:'Deposit'})),...(wd.data||[]).map(x=>({...x,kind:'Withdrawal'}))].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,10);
  target.innerHTML=rows.length?rows.map(x=>'<div class="activity-row"><span class="activity-mark">'+(x.kind==='Deposit'?'＋':'↗')+'</span><div><b>'+x.kind+' · ₹'+Number(x.amount).toFixed(2)+'</b><small>'+esc(x.status.toUpperCase())+' · '+esc(new Date(x.created_at).toLocaleString())+'</small><small>Ref '+esc(x.id)+'</small>'+(x.kind==='Deposit'?'<small>UTR: <b>'+esc(x.payment_reference||'Not submitted')+'</b></small>':'')+'</div><strong>'+(x.kind==='Withdrawal'?'Net ₹'+Number(x.net_amount).toFixed(2):'Pending check')+'</strong>'+(isAdmin && !(x.kind==='Withdrawal' && x.status==='paid')?'<button class="outline" data-delete-payment="'+esc(x.kind.toLowerCase())+'" data-request-id="'+esc(x.id)+'">Delete</button>':'')+'</div>').join(''):'<div class="empty-state"><b>No payment requests yet</b><p>Your requests will appear here.</p></div>';
  target.querySelectorAll('[data-delete-payment]').forEach(btn=>btn.addEventListener('click',async()=>{ if(!isAdmin)return toast('Admin access required.'); const kind=btn.dataset.deletePayment, id=btn.dataset.requestId; if(!confirm('Delete this '+kind+' transaction? This cannot be undone.'))return; btn.disabled=true; const {error}=await supabase.rpc('admin_delete_payment_request',{p_kind:kind,p_request_id:id}); if(error){btn.disabled=false;toast(error.message||'Could not delete transaction.');return;} toast('Transaction deleted.'); await loadPaymentRequests(); }));
}

function renderWallet() {
  const total = $('#walletBalance'); if (total) total.textContent = String(balance);
  const activity = $('#walletActivity'); if (!activity) return;
  activity.innerHTML = history.length ? history.slice().reverse().slice(0,5).map(item => '<div class="activity-row"><span class="activity-mark">◈</span><div><b>' + esc(item.title || item.type || 'Wallet activity') + '</b><small>' + esc(item.date || '') + '</small></div><strong>' + esc(item.amount ?? '') + ' pts</strong></div>').join('') : '<div class="empty-state"><span>◷</span><b>No wallet activity yet</b><p>Demo wallet activity will appear here when available.</p></div>' ;
}

function render() {
  if ($('#walletBalance')) $('#walletBalance').textContent = String(balance);
  renderWallet();
  $('#tournaments').innerHTML = tournaments.length ? tournaments.map(t => {
    const id = String(t.id);
    const has = joined.some(e => String(e.tournament_id) === id);
    const mode = t.game_mode || t.type || 'SOLO';
    const entry = Number(t.entry_points ?? t.entry ?? 0);
    const prize = Number(t.prize_pool_points ?? t.prize ?? 0);
    const perKill = Number(t.per_kill_points ?? 0);
    const count = counts[id] ?? joined.filter(e => String(e.tournament_id) === id).length;
    const full = t.status === 'full' || count >= Number(t.max_players);
    return '<article class="tour" data-detail="' + esc(id) + '" role="button" tabindex="0" aria-label="View tournament details for ' + esc(t.title) + '"><div class="tour-banner"></div><div class="tour-body"><div class="tour-top"><div><h3>' + esc(t.title) + '</h3><p>' + esc(mode) + ' tournament • online registration</p></div><span class="tag">' + esc(mode) + '</span></div><div class="meta"><span>👥 ' + count + ' / ' + Number(t.max_players) + ' players</span><span>' + esc(t.status || 'open').toUpperCase() + '</span></div><div class="prize-row"><div class="prize"><b>' + prize + ' pts</b><small>DISPLAYED PRIZE POOL</small></div><div class="prize"><b>' + perKill + ' pts</b><small>PER KILL</small></div><button class="join" data-join="' + esc(id) + '" ' + ((has || full || t.status !== 'open') ? 'disabled' : '') + '>' + (has ? 'JOINED ✓' : full ? 'FULL' : currentUser ? 'REGISTER • ' + entry + ' PTS' : 'SIGN IN TO JOIN') + '</button></div></div></article>';
  }).join('') : '<p class="notice">No tournaments are published yet. The online database is connected; add the starter tournaments using the seed.sql file in the repository.</p>';
  $('#profileBtn').textContent = currentUser ? 'My Account' : 'Log in';
}
async function refreshData() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) console.warn(sessionError);
  currentUser = session?.user ?? null;
  isAdmin = false;
  if (currentUser) {
    const { data: adminFlag, error: adminError } = await supabase.rpc('is_battleforge_admin');
    if (!adminError) isAdmin = adminFlag === true;
  }
  $('#adminBtn')?.classList.toggle('hidden', !isAdmin);
  const { data, error } = await supabase.from('tournaments')
    .select('id,title,description,game_mode,entry_points,per_kill_points,prize_pool_points,max_players,status,starts_at')
    .order('starts_at', { ascending: true, nullsFirst: false }).order('id');
  if (error) {
    toast('Could not load online tournaments. Check Supabase setup.');
    console.error(error);
    tournaments = [];
  } else tournaments = data ?? [];

  joined = [];
  counts = {};
  if (currentUser) {
    const { data: entries, error: entriesError } = await supabase.from('tournament_entries')
      .select('id,tournament_id,in_game_name,created_at').eq('user_id', currentUser.id);
    if (!entriesError) joined = entries ?? [];
  }
  const { data: countRows, error: countError } = await supabase.rpc('get_tournament_counts');
  if (!countError && Array.isArray(countRows)) {
    for (const row of countRows) counts[String(row.tournament_id)] = Number(row.player_count);
  }
  render();
  if ($('#paymentRequests')) await loadPaymentRequests();
}
function showAuth() {
  modal('<h2>Log in to BattleForge</h2><p>Use your Google account or email to access tournament registration and match history.</p><button id="googleSignInBtn" class="join full google-sign-in"><span aria-hidden="true">G</span> Continue with Google</button><div class="auth-divider"><span>OR USE EMAIL</span></div><label class="field">EMAIL<input id="authEmail" type="email" autocomplete="email" placeholder="you@example.com"></label><label class="field">PASSWORD<input id="authPassword" type="password" autocomplete="current-password" minlength="8" placeholder="At least 8 characters"></label><button id="signInBtn" class="join full">Log in with email</button><button id="signUpBtn" class="outline full">Create account with email</button><p class="notice">If this is your first time, create an account. Email confirmation may be required. Never share your password or OTP.</p>');
}

// Google OAuth uses Supabase's authorization-code (PKCE) flow. The web callback
// stays on the current origin; Android returns through the registered app link.
const NATIVE_AUTH_CALLBACK = 'com.battleforge.arena://auth/callback';
const googleAuthCodesInFlight = new Set();
const googleAuthCodesHandled = new Set();

function resetGoogleButton() {
  const button = $('#googleSignInBtn');
  if (button) {
    button.disabled = false;
    button.innerHTML = '<span aria-hidden="true">G</span> Continue with Google';
  }
}

async function googleSignIn() {
  const button = $('#googleSignInBtn');
  if (button) { button.disabled = true; button.textContent = 'Opening Google sign-in…'; }
  try {
    const isNative = Capacitor.isNativePlatform();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: isNative ? NATIVE_AUTH_CALLBACK : window.location.origin,
        skipBrowserRedirect: isNative,
        queryParams: { access_type: 'offline', prompt: 'select_account' }
      }
    });
    if (error) throw error;
    if (isNative) {
      if (!data?.url) throw new Error('Supabase did not return a Google sign-in URL.');
      await Browser.open({ url: data.url });
    } else if (data?.url) {
      window.location.assign(data.url);
    } else {
      throw new Error('Supabase did not return a Google sign-in URL.');
    }
  } catch (error) {
    resetGoogleButton();
    toast(error?.message || 'Could not start Google sign-in.');
  }
}

async function handleNativeAuthCallback(rawUrl) {
  if (!rawUrl) return;
  let callback;
  try { callback = new URL(rawUrl); } catch { return; }
  if (`${callback.protocol}//${callback.host}${callback.pathname}` !== NATIVE_AUTH_CALLBACK) return;

  const code = callback.searchParams.get('code');
  const providerError = callback.searchParams.get('error_description') || callback.searchParams.get('error');
  if (providerError) {
    await Browser.close().catch(() => {});
    resetGoogleButton();
    toast(decodeURIComponent(providerError.replace(/\+/g, ' ')));
    return;
  }
  if (!code) {
    await Browser.close().catch(() => {});
    resetGoogleButton();
    toast('Google did not return an authorization code. Please try again.');
    return;
  }
  if (googleAuthCodesInFlight.has(code) || googleAuthCodesHandled.has(code)) return;
  googleAuthCodesInFlight.add(code);
  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    googleAuthCodesHandled.add(code);
    await Browser.close().catch(() => {});
    close();
    await refreshData().then(()=>checkRequiredAppUpdate());
    toast('Signed in successfully with Google.');
  } catch (error) {
    await Browser.close().catch(() => {});
    resetGoogleButton();
    toast(error?.message || 'Google sign-in could not be completed.');
  } finally {
    googleAuthCodesInFlight.delete(code);
  }
}

if (Capacitor.isNativePlatform()) {
  App.addListener('appUrlOpen', ({ url }) => { void handleNativeAuthCallback(url); });
  App.getLaunchUrl().then(({ url }) => { if (url) void handleNativeAuthCallback(url); }).catch(() => {});
}

async function authAction(kind) {
  const email = $('#authEmail')?.value.trim();
  const password = $('#authPassword')?.value;
  if (!email || !password || password.length < 8) { toast('Enter a valid email and password (8+ characters).'); return; }
  const btn = kind === 'signin' ? $('#signInBtn') : $('#signUpBtn');
  if (btn) btn.disabled = true;
  const result = kind === 'signin'
    ? await supabase.auth.signInWithPassword({ email, password })
    : await supabase.auth.signUp({ email, password });
  if (btn) btn.disabled = false;
  if (result.error) { toast(result.error.message); return; }
  if (kind === 'signup' && !result.data.session) {
    modal('<h2>Check your email</h2><p>Supabase may require email confirmation. Open the confirmation email, then return and sign in.</p><button id="backToSignIn" class="join full">Back to sign in</button>');
    return;
  }
  close();
  await refreshData();
  toast(kind === 'signin' ? 'Signed in successfully.' : 'BattleForge account created.');
}
function showProfile() {
  if (!currentUser) { showAuth(); return; }
  modal('<h2>Player account</h2><p>Signed in as <b>' + esc(currentUser.email || currentUser.user_metadata?.full_name || 'Google account') + '</b></p><p class="notice">Your account and tournament registrations are connected. Points shown in the wallet remain demo-only.</p><button id="signOutBtn" class="join full">Log out</button><button id="switchAccountBtn" class="outline full">Switch account</button>');
}
async function showHistory() {
  const target = $('#historyContent');
  if (!target) return;
  const rows = currentUser ? joined : [];
  let roomRows = [], resultRows = [];
  if (currentUser && rows.length) {
    const ids = rows.map(e => e.tournament_id);
    const [rooms, results] = await Promise.all([
      supabase.from('tournament_rooms').select('tournament_id,room_id,room_password').eq('published', true).in('tournament_id', ids),
      supabase.from('tournament_results').select('tournament_id,placement,kills,note,created_at').eq('user_id', currentUser.id).eq('published', true)
    ]);
    if (!rooms.error) roomRows = rooms.data ?? [];
    if (!results.error) resultRows = results.data ?? [];
  }
  const rosterRows = {};
  if (currentUser && roomRows.length) await Promise.all(roomRows.map(async room => {
    const { data, error } = await supabase.rpc('get_tournament_roster', { p_tournament_id: Number(room.tournament_id) });
    if (!error) rosterRows[String(room.tournament_id)] = data ?? [];
  }));
  const roomFor = id => roomRows.find(r => String(r.tournament_id) === String(id));
  const resultFor = id => resultRows.find(r => String(r.tournament_id) === String(id));
  target.innerHTML = !currentUser ? '<div class="empty-state"><span>◷</span><h3>Your match timeline</h3><p>Sign in to see your registrations, lobby details, and published results.</p><button id="historySignIn" class="join">Sign in</button></div>' : rows.length ? rows.slice().sort((a,b) => new Date(b.created_at)-new Date(a.created_at)).slice(0,5).map(e => {
    const room=roomFor(e.tournament_id), result=resultFor(e.tournament_id), roster=rosterRows[String(e.tournament_id)]??[], t=tournaments.find(x=>String(x.id)===String(e.tournament_id));
    return '<article class="history-card"><div class="history-card-top"><span class="history-symbol">✦</span><span class="status-chip">REGISTERED</span></div><h3>'+esc(t?.title || 'BattleForge tournament')+'</h3><p class="history-meta">'+esc(e.in_game_name)+' · '+esc(new Date(e.created_at).toLocaleString())+'</p>'+
    (room ? '<div class="room-card"><small class="room-label">MATCH ROOM</small><div class="room-value">ID <b>'+esc(room.room_id||'Not set')+'</b></div><div class="room-value">Password <b>'+esc(room.room_password||'Not set')+'</b></div>'+(roster.length?'<div class="roster"><strong>PLAYER LOBBY · '+roster.length+'</strong><div class="roster-chips">'+roster.map((x,i)=>'<span class="player-chip"><i>'+(i+1)+'</i>'+esc(x.in_game_name)+'</span>').join('')+'</div></div>':'')+'</div>' : '<p class="history-pending">Room details will appear here after the organiser publishes them.</p>')+
    (result ? '<div class="result-banner"><small>VERIFIED RESULT</small><b>'+(result.placement?'Place #'+Number(result.placement)+' · ':'')+Number(result.kills)+' kills</b>'+(result.note?'<p>'+esc(result.note)+'</p>':'')+'</div>' : '')+'</article>';
  }).join('') : '<div class="empty-state"><span>◷</span><h3>No matches yet</h3><p>Join a tournament from the Arena page and your registration will show up here.</p><button class="join" data-go="arena">Explore tournaments</button></div>';
}

async function loadAdminRoom() {
  if (!isAdmin) return;
  const id = Number($('#adminTournament')?.value);
  const selectedTournament = (window.battleForgeAdminTournaments || tournaments).find(t => Number(t.id) === id);
  const descriptionEditor = $('#adminEditDescription');
  if (descriptionEditor) descriptionEditor.value = selectedTournament?.description ?? '';
  const roomId = $('#adminRoomId');
  const roomPassword = $('#adminRoomPassword');
  const published = $('#adminRoomPublished');
  if (!id || !roomId || !roomPassword || !published) return;
  const { data, error } = await supabase.from('tournament_rooms')
    .select('room_id,room_password,published').eq('tournament_id', id).maybeSingle();
  if (error) { console.warn('Could not load saved room details', error); return; }
  roomId.value = data?.room_id ?? '';
  roomPassword.value = data?.room_password ?? '';
  published.checked = data?.published ?? false;
}

async function showAdmin() {
 if(!currentUser||!isAdmin){toast('Admin access required.');return;}
 const {data,error}=await supabase.from('tournaments').select('id,title,description,game_mode,status,is_past_match,is_cancelled,starts_at,created_at,entry_points,per_kill_points,prize_pool_points,max_players').order('created_at',{ascending:false});
 if(error)console.warn(error);
 window.battleForgeAdminTournaments=data||tournaments;
 const all=window.battleForgeAdminTournaments;
 const total=Object.values(counts).reduce((a,b)=>a+Number(b||0),0);
 modal(`<div class="admin-dashboard-head"><div class="eyebrow"><span class="live-dot"></span> ORGANISER CONTROL CENTRE</div><h2>Admin portal</h2><p>Your complete BattleForge control room.</p><div class="admin-metrics"><div><small>MATCHES</small><b>${all.length}</b></div><div><small>LIVE</small><b>${all.filter(t=>!t.is_past_match).length}</b></div><div><small>PAST</small><b>${all.filter(t=>t.is_past_match).length}</b></div><div><small>ENTRIES</small><b>${total}</b></div></div></div>
 <div class="admin-home-grid" id="adminHomeGrid">
 <button class="admin-home-card" data-admin-page-open="create"><span class="bf-admin-icon">＋</span><b>Create match</b><small>Set up a tournament</small></button>
 <button class="admin-home-card" data-admin-page-open="manage"><span class="bf-admin-icon">⌘</span><b>Manage matches</b><small>Lobby, settings and rankings</small></button>
 <button class="admin-home-card" data-admin-page-open="players"><span class="bf-admin-icon">♙</span><b>All players</b><small>Recently registered and directory</small></button>
 <button class="admin-home-card" data-admin-page-open="search"><span class="bf-admin-icon">⌕</span><b>Search matches</b><small>Find by match ID</small></button><button class="admin-home-card" data-admin-page-open="payments"><span class="bf-admin-icon">₹</span><b>Payments</b><small>Deposits and withdrawals</small></button><button class="admin-home-card" data-admin-page-open="social"><span class="bf-admin-icon">◎</span><b>Social links</b><small>Official BattleForge links</small></button><button class="admin-home-card" data-admin-page-open="updates"><span class="bf-admin-icon">⬆</span><b>App updates</b><small>Versions and force update</small></button>
 </div>
 <div class="admin-page-back hidden" id="adminPageBack"><button class="outline" id="adminBackHome">← Admin portal</button><b id="adminPageTitle">Admin section</b></div>
 <section class="admin-page hidden" data-admin-page="create"><div class="admin-section-title"><span>01</span><div><h3>Create match</h3><p>Configure the match players will see.</p></div></div>
 <label class="field">MATCH TITLE<input id="adminTitle" maxlength="80" placeholder="Weekend Solo Cup"></label>
 <div class="admin-form-grid"><label class="field">GAME MODE<select id="adminMode"><option>SOLO</option><option>DUO</option><option>SQUAD</option></select></label><label class="field">MAX PLAYERS<input id="adminMax" type="number" min="1" max="500" value="48"></label></div>
 <div class="admin-form-grid"><label class="field">ENTRY FEE<input id="adminEntry" type="number" min="0" value="0"></label><label class="field">PER-KILL REWARD<input id="adminPerKill" type="number" min="0" value="0"></label><label class="field">PRIZE POOL<input id="adminPrize" type="number" min="0" value="0"></label></div>
 <label class="field">START TIME<input id="adminStarts" type="datetime-local"></label><label class="field">DESCRIPTION & RULES<textarea id="adminDescription" maxlength="5000" rows="5"></textarea></label><button id="adminCreateTournament" class="join full">＋ Create match</button></section>
 <section class="admin-page hidden" data-admin-page="manage"><div class="admin-section-title"><span>02</span><div><h3>Manage matches</h3><p>Choose a live or past match. Room & Lobby and Match Rankings are grouped here.</p></div></div>
 <div class="admin-section"><div class="admin-section-title"><div><h3>Match selector</h3><p>Newest matches first, with status and full match details.</p></div></div><div id="adminMatchPicker"></div></div>
 <select id="adminTournament" class="admin-hidden-select"><option value="">Choose a match</option>${all.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.title)+' · #'+esc(t.id)+'</option>').join('')}</select>
 <div class="admin-current-summary" id="adminSelectedSummary">Select a match above.</div>
 <div class="admin-section"><div class="admin-section-title"><span>01</span><div><h3>Match settings</h3><p>Rewards, description, status and deletion.</p></div></div>
 <div class="admin-form-grid"><label class="field">ENTRY FEE<input id="adminEditEntry" type="number" min="0"></label><label class="field">PER-KILL REWARD<input id="adminEditPerKill" type="number" min="0"></label></div><button id="adminSaveRewards" class="join full">Save rewards</button>
 <label class="field">DESCRIPTION<textarea id="adminEditDescription" rows="4" maxlength="5000"></textarea></label><button id="adminSaveDescription" class="outline full">Save description</button>
 <div class="admin-form-grid"><label class="field">ENTRY STATUS<select id="adminStatus"><option value="open">Open</option><option value="closed">Closed</option><option value="full">Full</option></select></label><div class="field"><span>PAST MATCH</span><button id="adminMarkPastMatch" class="outline full">Move to Past Matches</button></div></div><button id="adminSetStatus" class="join full">Save status</button><button id="adminDeleteTournament" class="outline danger-button full">Delete match</button></div>
 <div class="admin-section"><div class="admin-section-title"><span>02</span><div><h3>Room & Lobby</h3><p>Set room credentials and publish them to registered players.</p></div></div><label class="field">ROOM ID<input id="adminRoomId" maxlength="80"></label><label class="field">ROOM PASSWORD<input id="adminRoomPassword" maxlength="80"></label><label class="admin-check"><input id="adminRoomPublished" type="checkbox"><span><b>Publish room to registered players</b><small>Only eligible players will see these details.</small></span></label><button id="adminSaveRoom" class="join full">Save room & lobby</button></div>
 <div class="admin-section"><div class="admin-section-title"><span>03</span><div><h3>Match Rankings</h3><p>Load the roster, arrange ranks, kills and total prize.</p></div></div><button id="adminLoadRankings" class="outline full">Load players & rankings</button><div id="adminRankingEditor"><p class="admin-helper">Select a match, then load its rankings.</p></div></div></section>
 <section class="admin-page hidden" data-admin-page="players"><div class="admin-section-title"><span>03</span><div><h3>All players</h3><p>Newest accounts and complete player directory.</p></div></div>
 <div class="admin-recent-wrap"><div class="admin-section-title"><div><h3>Recently registered</h3><p>Newest first, with registration dates and activity.</p></div></div><div id="bfAdminRecentRegistrations"><p class="admin-helper">Loading…</p></div></div>
 <label class="field">SEARCH BY PLAYER ID OR USERNAME<input id="bfAdminPlayerSearch" type="search" maxlength="80" placeholder="Player ID or username"></label><button id="bfAdminPlayerSearchBtn" class="join full">Search all players</button><div id="bfAdminPlayerDirectoryList"></div><div class="admin-form-grid"><button id="bfAdminPlayersPrev" class="outline" disabled>Previous</button><button id="bfAdminPlayersNext" class="outline">Next</button></div><p id="bfAdminPlayerPageInfo" class="admin-helper"></p></section>
 <section class="admin-page hidden" data-admin-page="search"><div class="admin-section-title"><span>04</span><div><h3>Search matches</h3><p>Find a match and inspect its roster and room details.</p></div></div><label class="field">MATCH ID<input id="adminMatchSearchId" type="number" min="1" placeholder="Match ID"></label><button id="adminMatchSearchButton" class="join full">Search match</button><div id="adminMatchSearchResult"><p class="admin-helper">Search results appear here.</p></div>
 <section class="admin-page hidden" data-admin-page="payments"><div class="admin-section-title"><span>05</span><div><h3>Payments & withdrawals</h3><p>Verify actual deposits and mark sent withdrawals as paid.</p></div></div><button id="adminLoadPayments" class="join full">Refresh payment requests</button><div id="adminPaymentRequests"><p class="admin-helper">Tap refresh to load requests.</p></div></section>
 <section class="admin-page hidden" data-admin-page="social"><div class="admin-section-title"><span>06</span><div><h3>Social links</h3><p>Update official BattleForge links shown in the app.</p></div></div><label class="field">TELEGRAM URL<input id="adminSocialTelegram" type="url" placeholder="https://t.me/battleforgeff"></label><label class="field">INSTAGRAM URL<input id="adminSocialInstagram" type="url" placeholder="https://instagram.com/battleforgeff"></label><label class="field">YOUTUBE URL (OPTIONAL)<input id="adminSocialYoutube" type="url"></label><button id="adminSaveSocialLinks" class="join full">Save social links</button><p id="adminSocialStatus" class="admin-helper"></p><label class="field">REFERRAL APK DOWNLOAD URL<input id="adminReferralDownloadUrl" type="url" placeholder="https://.../BattleForge.apk"></label><button id="adminSaveReferralUrl" class="outline full">Save APK download link</button></section>
 <section class="admin-page hidden" data-admin-page="updates"><div class="admin-section-title"><span>07</span><div><h3>App version & forced updates</h3><p>Set the latest version, minimum version and direct APK URL.</p></div></div><button id="loadAppUpdateConfig" class="outline full">Load current settings</button><div class="admin-form-grid"><label class="field">LATEST VERSION<input id="appLatestVersion" placeholder="1.2.491"></label><label class="field">MINIMUM VERSION<input id="appMinimumVersion" placeholder="1.2.490"></label></div><label class="field">DIRECT HTTPS APK LINK<input id="appApkUrl" type="url"></label><label class="field">UPDATE MESSAGE<textarea id="appUpdateMessage" rows="3" maxlength="500"></textarea></label><label class="admin-check"><input id="appForceUpdate" type="checkbox"><span><b>Force older versions to update</b><small>Blocks versions below the required version.</small></span></label><button id="saveAppUpdateConfig" class="join full">Save app update settings</button><p id="appUpdateStatus" class="admin-helper"></p></section>
</section>`);
 const names={create:'Create match',manage:'Manage matches',players:'All players',search:'Search matches',payments:'Payments',social:'Social links',updates:'App updates'};
 const openPage=page=>{document.querySelectorAll('#modalContent [data-admin-page]').forEach(x=>x.classList.toggle('hidden',x.dataset.adminPage!==page));$('#adminHomeGrid')?.classList.toggle('hidden',page!=='home');$('#adminPageBack')?.classList.toggle('hidden',page==='home');if($('#adminPageTitle'))$('#adminPageTitle').textContent=names[page]||'Admin portal';const card=$('#modal .modal-card');if(card)card.scrollTo({top:0,behavior:'auto'});if(page==='manage')renderAdminMatchPickers();if(page==='players')loadAdminPlayerDirectory(0);if(page==='payments')loadAdminPaymentRequests();if(page==='social')loadAdminSocialLinks();if(page==='updates')loadAppUpdateConfig();};
 document.querySelectorAll('[data-admin-page-open]').forEach(b=>b.addEventListener('click',()=>openPage(b.dataset.adminPageOpen)));
 $('#adminBackHome')?.addEventListener('click',()=>openPage('home'));
 $('#adminTournament')?.addEventListener('change',async()=>{await loadAdminRoom();syncAdminSelectedSummary();});
 $('#adminLoadRankings')?.addEventListener('click',loadAdminRankings);
 $('#bfAdminPlayerSearchBtn')?.addEventListener('click',()=>loadAdminPlayerDirectory(0));
 $('#bfAdminPlayersPrev')?.addEventListener('click',()=>loadAdminPlayerDirectory(Math.max(0,(window.battleForgeAdminDirectoryOffset||0)-100)));
 $('#bfAdminPlayersNext')?.addEventListener('click',()=>loadAdminPlayerDirectory((window.battleForgeAdminDirectoryOffset||0)+100));
 $('#adminMatchSearchButton')?.addEventListener('click',loadAdminMatchSearch);$('#adminLoadPayments')?.addEventListener('click',loadAdminPaymentRequests);$('#adminSaveSocialLinks')?.addEventListener('click',saveAdminSocialLinks);$('#adminSaveReferralUrl')?.addEventListener('click',saveAdminReferralUrl);$('#loadAppUpdateConfig')?.addEventListener('click',loadAppUpdateConfig);$('#saveAppUpdateConfig')?.addEventListener('click',saveAppUpdateConfig);
 $('#adminMarkPastMatch')?.addEventListener('click',async()=>{const id=Number($('#adminTournament')?.value);if(!id)return toast('Choose a match first.');if(!confirm('Move this match to Past Matches?'))return;const {error}=await supabase.rpc('admin_mark_match_past',{p_tournament_id:id});if(error)return toast(error.message);toast('Match moved to Past Matches.');await refreshData();await showAdmin();document.querySelector('[data-admin-page-open="manage"]')?.click();});
 await loadAdminRoom();syncAdminSelectedSummary();renderAdminMatchPickers();
}
function renderAdminMatchPickers(){
 const all=window.battleForgeAdminTournaments||tournaments,target=$('#adminMatchPicker');if(!target)return;
 const chosen=String($('#adminTournament')?.value||'');
 const newest=(a,b)=>new Date(b.created_at||b.starts_at||0)-new Date(a.created_at||a.starts_at||0);
 const card=t=>{const n=Number(counts[String(t.id)]||0),status=t.is_past_match?'Past match':t.is_cancelled?'Cancelled':t.status==='open'?'Open':t.status==='full'?'Full':'Closed',date=t.starts_at?new Date(t.starts_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'Schedule not set';return '<button type="button" class="bf-admin-match-card '+(String(t.id)===chosen?'is-selected':'')+'" data-admin-match-pick="'+esc(t.id)+'"><span class="bf-admin-match-card-top"><b>'+esc(t.title||'Match')+'</b><small>#'+esc(t.id)+'</small></span><span class="bf-admin-match-card-meta">'+esc(t.game_mode||'MATCH')+' · '+esc(date)+'</span><span class="bf-admin-match-card-bottom"><span>'+esc(status)+'</span><span>'+n+'/'+Number(t.max_players||0)+' players</span><span>Entry '+Number(t.entry_points||0)+'</span><span>Kill '+Number(t.per_kill_points||0)+'</span><span>Prize '+Number(t.prize_pool_points||0)+'</span></span><span class="bf-admin-match-description">'+esc(String(t.description||'').slice(0,120))+'</span></button>';};
 const live=all.filter(t=>!t.is_past_match).sort(newest),past=all.filter(t=>t.is_past_match).sort(newest);
 target.innerHTML='<div class="bf-admin-match-groups"><section><div class="bf-admin-match-group-title"><b>Live matches</b><small>'+live.length+'</small></div>'+(live.length?live.map(card).join(''):'<p class="admin-helper">No live matches.</p>')+'</section><section><div class="bf-admin-match-group-title"><b>Past matches</b><small>'+past.length+'</small></div>'+(past.length?past.map(card).join(''):'<p class="admin-helper">No past matches.</p>')+'</section></div>';
 target.querySelectorAll('[data-admin-match-pick]').forEach(b=>b.addEventListener('click',async()=>{const id=String(b.dataset.adminMatchPick);$('#adminTournament').value=id;target.querySelectorAll('[data-admin-match-pick]').forEach(x=>x.classList.toggle('is-selected',x===b));await loadAdminRoom();syncAdminSelectedSummary();$('#adminRankingEditor').innerHTML='<p class="admin-helper">Tap Load players & rankings to edit this match.</p>'; }));
}
async function loadAdminPlayerDirectory(offset=0){
 const target=$('#bfAdminPlayerDirectoryList');if(!target||!isAdmin)return;
 const search=$('#bfAdminPlayerSearch')?.value.trim()||'';target.innerHTML='<p class="admin-helper">Loading player directory…</p>';
 const {data,error}=await supabase.rpc('admin_list_all_players',{p_search:search,p_limit:100,p_offset:Math.max(0,offset)});
 if(error){target.innerHTML='<p class="notice">'+esc(error.message)+'</p>';return;}
 const rows=data||[];window.battleForgeAdminDirectoryOffset=offset;
 const recent=$('#bfAdminRecentRegistrations');if(recent){const newest=[...rows].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,8);recent.innerHTML=newest.length?newest.map(p=>'<article class="bf-admin-recent-card"><div><b>'+esc(p.username||('Player #'+p.player_number))+'</b><small>PLAYER ID #'+esc(p.player_number)+' · '+Number(p.entries_count||0)+' matches · '+Number(p.wins_count||0)+' wins</small></div><time>'+esc(p.created_at?new Date(p.created_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'Date unavailable')+'</time></article>').join(''):'<p class="admin-helper">No recent registrations found.</p>';}
 target.innerHTML=rows.length?rows.map(p=>'<article class="bf-admin-player-card"><div><b>'+esc(p.username||('Player #'+p.player_number))+'</b><small>PLAYER ID #'+esc(p.player_number)+' · '+Number(p.entries_count||0)+' matches · '+Number(p.wins_count||0)+' wins</small><small>Registered '+esc(p.created_at?new Date(p.created_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'Date unavailable')+'</small></div></article>').join(''):'<p class="admin-helper">No registered players found.</p>';
 $('#bfAdminPlayersPrev').disabled=offset<=0;$('#bfAdminPlayersNext').disabled=rows.length<100;$('#bfAdminPlayerPageInfo').textContent=rows.length?'Showing '+(offset+1)+'–'+(offset+rows.length):'No results';
}
async function loadAdminMatchSearch(){
 const id=Number($('#adminMatchSearchId')?.value),target=$('#adminMatchSearchResult');if(!Number.isInteger(id)||id<1)return toast('Enter a valid match ID.');
 target.innerHTML='<p class="admin-helper">Searching…</p>';const {data,error}=await supabase.rpc('admin_search_match_details',{p_match_number:id});
 if(error){target.innerHTML='<p class="notice">'+esc(error.message)+'</p>';return;}const t=data?.tournament;if(!t){target.innerHTML='<p class="admin-helper">No match found with ID #'+id+'.</p>';return;}
 const entries=data.entries||[],room=data.room||{};target.innerHTML='<article class="admin-detail-card"><h3>'+esc(t.title)+' · #'+esc(t.id)+'</h3><p>'+esc(t.game_mode||'Match')+' · '+esc(t.status||'')+' · '+(t.is_past_match?'Past':'Live')+'</p><div class="bf-admin-match-card-bottom"><span>Entry '+Number(t.entry_points||0)+'</span><span>Kill '+Number(t.per_kill_points||0)+'</span><span>Prize '+Number(t.prize_pool_points||0)+'</span><span>Slots '+Number(t.max_players||0)+'</span></div><p>Starts: '+esc(t.starts_at?new Date(t.starts_at).toLocaleString():'Not set')+'</p><p>Room ID: '+esc(room.room_id||'Not set')+' · Password: '+esc(room.room_password||'Not set')+'</p><p>Registered players: '+entries.length+'</p>'+entries.map(e=>'<div class="bf-admin-player-card"><div><b>'+esc(e.in_game_name||'Player')+'</b><small>Player #'+esc(e.player_number||'—')+' · '+Number(e.kills||0)+' kills · '+(e.placement?'Rank '+e.placement:'Pending')+'</small></div></div>').join('')+'</article>';
}

const APP_FALLBACK_VERSION='1.2.490';
function compareAppVersions(a,b){const x=String(a||'0').split('.').map(v=>parseInt(v,10)||0),y=String(b||'0').split('.').map(v=>parseInt(v,10)||0);for(let i=0;i<Math.max(x.length,y.length);i++){const p=x[i]||0,q=y[i]||0;if(p!==q)return p>q?1:-1;}return 0;}
async function loadAdminPaymentRequests(){
 const target=$('#adminPaymentRequests');if(!target||!isAdmin)return;target.innerHTML='<p class="admin-helper">Loading…</p>';
 const [dep,wd]=await Promise.all([supabase.from('deposit_requests').select('id,user_id,amount,payer_upi,receiver_upi,status,created_at,payment_reference').order('created_at',{ascending:false}).limit(100),supabase.from('withdrawal_requests').select('id,user_id,amount,fee_amount,net_amount,account_name,payout_upi,status,created_at,payout_reference').order('created_at',{ascending:false}).limit(100)]);
 if(dep.error||wd.error){target.innerHTML='<p class="notice">'+esc((dep.error||wd.error).message)+'</p>';return;}
 const rows=[...(dep.data||[]).map(x=>({...x,kind:'deposit'})),...(wd.data||[]).map(x=>({...x,kind:'withdrawal'}))].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
 const ids=[...new Set(rows.map(x=>x.user_id).filter(Boolean))];const {data:players}=ids.length?await supabase.from('player_accounts').select('user_id,player_number,username').in('user_id',ids):{data:[]};const pm=new Map((players||[]).map(p=>[p.user_id,p]));
 target.innerHTML=rows.length?rows.map(x=>{const p=pm.get(x.user_id)||{};return '<article class="admin-payment-card"><h3>'+x.kind.toUpperCase()+' · ₹'+Number(x.amount).toFixed(2)+'</h3><p>'+esc(x.status)+' · '+esc(new Date(x.created_at).toLocaleString('en-IN'))+'</p><p>Player #'+esc(p.player_number||'—')+' · '+esc(p.username||'')+'</p><p>UPI: '+esc(x.kind==='deposit'?x.payer_upi:x.payout_upi)+' · Ref: '+esc(x.payment_reference||x.payout_reference||'—')+'</p>'+(x.kind==='deposit'&&['pending','reported_paid'].includes(x.status)?'<label class="field">UTR<input id="depRef-'+esc(x.id)+'"></label><button class="join full" data-payment-action="verify-deposit" data-request-id="'+esc(x.id)+'">Verify & credit</button><button class="outline full" data-payment-action="reject-deposit" data-request-id="'+esc(x.id)+'">Reject</button>':'')+(x.kind==='withdrawal'&&['pending','approved'].includes(x.status)?'<label class="field">Payout UTR<input id="wdRef-'+esc(x.id)+'"></label><button class="join full" data-payment-action="paid-withdrawal" data-request-id="'+esc(x.id)+'">Mark paid</button><button class="outline full" data-payment-action="reject-withdrawal" data-request-id="'+esc(x.id)+'">Reject & refund</button>':'')+'</article>';}).join(''):'<p class="admin-helper">No payment requests.</p>';
}
async function handleAdminPaymentAction(button){
 const id=button.dataset.requestId,action=button.dataset.paymentAction;if(!isAdmin||!id)return;const deposit=action.endsWith('deposit');
 const rpc=deposit?'admin_process_deposit':'admin_process_withdrawal';
 const args=deposit?{p_request_id:id,p_action:action==='verify-deposit'?'verify':'reject',p_payment_reference:$('#depRef-'+id)?.value.trim()||null,p_note:null}:{p_request_id:id,p_action:action==='paid-withdrawal'?'paid':'reject',p_payout_reference:$('#wdRef-'+id)?.value.trim()||null,p_note:null};
 if(action==='paid-withdrawal'&&!args.p_payout_reference)return toast('Enter the payout UTR after sending payment.');
 if(!confirm(action==='verify-deposit'?'Confirm the deposit has actually reached BattleForge?':action==='paid-withdrawal'?'Confirm you have sent the withdrawal?':'Confirm this action?'))return;
 button.disabled=true;const {error}=await supabase.rpc(rpc,args);button.disabled=false;if(error)return toast(error.message);toast('Payment request updated.');await loadAdminPaymentRequests();
}
function validAdminHttpsUrl(v){try{return new URL(String(v||'').trim()).protocol==='https:';}catch{return false;}}
async function loadAdminSocialLinks(){
 const {data,error}=await supabase.rpc('get_battleforge_social_links');if(error)return toast(error.message);const x=Array.isArray(data)?data[0]||{}:data||{};
 $('#adminSocialTelegram').value=x.telegram_url||'';$('#adminSocialInstagram').value=x.instagram_url||'';$('#adminSocialYoutube').value=x.youtube_url||'';
 const {data:d}=await supabase.rpc('get_battleforge_referral_download_url');const row=Array.isArray(d)?d[0]:d;$('#adminReferralDownloadUrl').value=row?.download_url||'';
}
async function saveAdminSocialLinks(){
 const args={p_telegram_url:$('#adminSocialTelegram').value.trim(),p_instagram_url:$('#adminSocialInstagram').value.trim(),p_youtube_url:$('#adminSocialYoutube').value.trim()||null};
 for(const [n,v] of [['Telegram',args.p_telegram_url],['Instagram',args.p_instagram_url],['YouTube',args.p_youtube_url]])if(v&&!validAdminHttpsUrl(v))return toast(n+' URL must use HTTPS.');
 const {error}=await supabase.rpc('admin_update_battleforge_social_links',args);if(error)return toast(error.message);$('#adminSocialStatus').textContent='Social links saved.';toast('Social links saved.');
}
async function saveAdminReferralUrl(){
 const url=$('#adminReferralDownloadUrl').value.trim();if(!validAdminHttpsUrl(url))return toast('Enter a valid HTTPS APK URL.');const {error}=await supabase.rpc('admin_update_battleforge_referral_download_url',{p_download_url:url});if(error)return toast(error.message);$('#adminSocialStatus').textContent='Referral APK link saved.';toast('APK link saved.');
}
async function loadAppUpdateConfig(){
 const {data,error}=await supabase.from('app_update_config').select('latest_version,minimum_version,apk_url,update_message,force_update').eq('id',1).maybeSingle();if(error)return toast(error.message);if(!data)return toast('No update settings found.');
 $('#appLatestVersion').value=data.latest_version||APP_FALLBACK_VERSION;$('#appMinimumVersion').value=data.minimum_version||APP_FALLBACK_VERSION;$('#appApkUrl').value=data.apk_url||'';$('#appUpdateMessage').value=data.update_message||'';$('#appForceUpdate').checked=data.force_update===true;toast('Update settings loaded.');
}
async function saveAppUpdateConfig(){
 const latest=$('#appLatestVersion').value.trim(),minimum=$('#appMinimumVersion').value.trim(),apk=$('#appApkUrl').value.trim(),message=$('#appUpdateMessage').value.trim(),force=$('#appForceUpdate').checked;
 const valid=v=>/^[0-9]+([.][0-9]+){1,3}$/.test(v||'');if(!valid(latest)||!valid(minimum))return toast('Enter valid version numbers.');if(compareAppVersions(minimum,latest)>0)return toast('Minimum cannot be newer than latest.');if(!validAdminHttpsUrl(apk))return toast('APK link must be HTTPS.');
 const {error}=await supabase.rpc('admin_set_app_update_config',{p_latest_version:latest,p_minimum_version:minimum,p_apk_url:apk,p_update_message:message,p_force_update:force});if(error)return toast(error.message);$('#appUpdateStatus').textContent='Saved · '+latest+' · force update '+(force?'ON':'OFF');toast('App update settings saved.');await checkRequiredAppUpdate();
}
async function checkRequiredAppUpdate(){
 try{const {data,error}=await supabase.from('app_update_config').select('latest_version,minimum_version,apk_url,update_message,force_update').eq('id',1).maybeSingle();if(error||!data?.apk_url)return;let installed=APP_FALLBACK_VERSION;try{installed=(await App.getInfo()).version||installed;}catch{}const min=data.minimum_version||APP_FALLBACK_VERSION,latest=data.latest_version||min;const required=compareAppVersions(installed,min)<0||(data.force_update&&compareAppVersions(installed,latest)<0);if(!required||$('#bf-force-update-gate')||!validAdminHttpsUrl(data.apk_url))return;const gate=document.createElement('div');gate.id='bf-force-update-gate';gate.className='bf-force-update-gate';gate.innerHTML='<div class="bf-force-update-card"><span class="eyebrow">UPDATE REQUIRED</span><h2>BattleForge needs an update</h2><p>'+esc(data.update_message||'Install the latest version to continue.')+'</p><p>Installed '+esc(installed)+' · Latest '+esc(latest)+'</p><button class="join full" id="bfUpdateDownload">Download update</button></div>';document.body.appendChild(gate);gate.querySelector('#bfUpdateDownload').addEventListener('click',()=>Capacitor.isNativePlatform()?Browser.open({url:data.apk_url}):window.open(data.apk_url,'_blank','noopener'));}catch(e){console.warn(e);}
}

async function loadAdminRankings(){
 const id=Number($('#adminTournament')?.value),target=$('#adminRankingEditor');if(!id)return toast('Choose a match first.');
 target.innerHTML='<p class="admin-helper">Loading roster and saved rankings…</p>';
 const [{data:entries,error},{data:saved,error:savedError}]=await Promise.all([supabase.rpc('admin_list_tournament_entries',{p_tournament_id:id}),supabase.from('tournament_results').select('entry_id,placement,kills,earned_points,published').eq('tournament_id',id)]);
 if(error){target.innerHTML='<p class="notice">'+esc(error.message)+'</p>';return;}if(savedError){target.innerHTML='<p class="notice">'+esc(savedError.message)+'</p>';return;}
 const byEntry=new Map((saved||[]).map(r=>[String(r.entry_id),r]));const ordered=[...(entries||[])].sort((a,b)=>(byEntry.get(String(a.entry_id))?.placement||999999)-(byEntry.get(String(b.entry_id))?.placement||999999)||new Date(a.created_at||0)-new Date(b.created_at||0));
 if(!ordered.length){target.innerHTML='<p class="admin-helper">No registered players in this match yet.</p>';return;}
 target.innerHTML='<p class="admin-helper">'+((saved||[]).some(r=>r.published)?'Published rankings loaded. Re-publishing adjusts only the prize difference.':'Pending results. Set each player’s rank, kills and total prize.')+' Drag ☰ to reorder.</p><div class="admin-ranking-head"><span>RANK / PLAYER</span><span>KILLS</span><span>TOTAL PRIZE</span></div><div id="adminRankingRows" class="admin-ranking-rows">'+ordered.map((e,i)=>{const r=byEntry.get(String(e.entry_id))||{};return '<div class="admin-ranking-row" draggable="true" data-entry-id="'+esc(e.entry_id)+'"><div class="ranking-player-cell"><span class="ranking-drag">☰</span><span class="ranking-bracket">['+(i+1)+']</span><div><b>'+esc(e.in_game_name||'Player')+'</b><small>Registered '+esc(new Date(e.created_at).toLocaleDateString('en-IN'))+'</small></div></div><label class="ranking-input"><span>Kills</span><input class="result-kills" type="number" min="0" value="'+Number(r.kills||0)+'"></label><label class="ranking-input"><span>Total prize</span><input class="result-reward" type="number" min="0" max="1000000" value="'+Number(r.earned_points||0)+'"></label><input class="result-rank" type="hidden" value="'+(i+1)+'"></div>';}).join('')+'</div><label class="field">ADMIN NOTE<input id="adminBulkResultNote" maxlength="500" placeholder="Verified by screenshot"></label><button id="adminPublishRankings" class="join full">Publish rankings & prizes</button>';
 const box=$('#adminRankingRows');let dragged=null;box.querySelectorAll('.admin-ranking-row').forEach(row=>{row.addEventListener('dragstart',e=>{dragged=row;row.classList.add('dragging');e.dataTransfer.effectAllowed='move';});row.addEventListener('dragend',()=>{row.classList.remove('dragging');dragged=null;syncAdminRankingPositions();});row.addEventListener('dragover',e=>{e.preventDefault();if(!dragged||dragged===row)return;const rect=row.getBoundingClientRect();box.insertBefore(dragged,e.clientY<rect.top+rect.height/2?row:row.nextSibling);});});
 syncAdminRankingPositions();$('#adminPublishRankings')?.addEventListener('click',publishAdminRankings);
}
function syncAdminRankingPositions(){document.querySelectorAll('#adminRankingRows .admin-ranking-row').forEach((row,i)=>{row.querySelector('.ranking-bracket').textContent='['+(i+1)+']';row.querySelector('.result-rank').value=String(i+1);});}
async function publishAdminRankings(){
 const id=Number($('#adminTournament')?.value),rows=[...document.querySelectorAll('#adminRankingRows .admin-ranking-row')];if(!id||!rows.length)return toast('Load a match roster first.');
 const results=rows.map(row=>({entry_id:row.dataset.entryId,placement:Number(row.querySelector('.result-rank').value),kills:Number(row.querySelector('.result-kills').value),reward:Number(row.querySelector('.result-reward').value),note:$('#adminBulkResultNote')?.value.trim()||''}));
 if(results.some(r=>!r.entry_id||!Number.isInteger(r.placement)||r.placement<1||!Number.isInteger(r.kills)||r.kills<0||!Number.isInteger(r.reward)||r.reward<0)||new Set(results.map(r=>r.placement)).size!==results.length)return toast('Check ranks, kills and prizes. Each rank must be unique.');
 const b=$('#adminPublishRankings');b.disabled=true;b.textContent='Publishing…';const {error}=await supabase.rpc('admin_publish_match_results',{p_tournament_id:id,p_results:results});b.disabled=false;b.textContent='Publish rankings & prizes';if(error)return toast(error.message);toast('Rankings published and prizes processed.');await refreshData();await loadAdminRankings();
}

function syncAdminSelectedSummary() {
  const id = Number($('#adminTournament')?.value);
  const t = (window.battleForgeAdminTournaments || tournaments).find(item => Number(item.id) === id);
  const el = $('#adminSelectedSummary');
  if (!el) return;
  if (!t) { el.textContent = 'Select a tournament to load its current settings.'; return; }
  const count = Number(counts[String(id)] ?? 0);
  const status = String(t.status || 'open').toUpperCase();
  el.innerHTML = `<div><b>${esc(t.title)}</b><small>${esc(t.game_mode || 'SOLO')} · ${count}/${Number(t.max_players || 0)} players</small></div><span class="status-chip">${esc(status)}</span><div><small>ENTRY FEE</small><b>${Number(t.entry_points || 0)} pts</b></div><div><small>PER KILL</small><b>${Number(t.per_kill_points || 0)} pts</b></div><div><small>PRIZE DISPLAY</small><b>${Number(t.prize_pool_points || 0)} coins</b></div>`;
  if ($('#adminEditDescription')) $('#adminEditDescription').value = t.description || '';
  if ($('#adminEditEntry')) $('#adminEditEntry').value = Number(t.entry_points || 0);
  if ($('#adminEditPerKill')) $('#adminEditPerKill').value = Number(t.per_kill_points || 0);
  if ($('#adminStatus')) $('#adminStatus').value = ['open','closed','full'].includes(t.status) ? t.status : 'open';
}

async function loadAdminEntries() {
  if (!isAdmin) { toast('Admin access required.'); return; }
  const id = Number($('#adminTournament')?.value);
  if (!id) { toast('Choose a tournament first.'); return; }
  const list = $('#adminEntries');
  list.textContent = 'Loading players…';
  const { data, error } = await supabase.rpc('admin_list_tournament_entries', { p_tournament_id: id });
  if (error) { list.textContent = error.message; return; }
  list.innerHTML = data?.length ? data.map(e => `<div class="entry"><div>${esc(e.in_game_name)}<small>Registered ${esc(new Date(e.created_at).toLocaleString())}</small></div><button class="outline" data-result-entry="${esc(e.entry_id)}" data-ign="${esc(e.in_game_name)}">Record result</button></div>`).join('') : '<p>No registered players yet.</p>';
}

function showResultForm(entryId, ign) {
  pendingResultEntry = entryId;
  modal(`<h2>Publish result</h2><p>Player: <b>${esc(ign)}</b></p>
    <label class="field">PLACEMENT (OPTIONAL)<input id="resultPlacement" type="number" min="1" placeholder="1"></label>
    <label class="field">KILLS<input id="resultKills" type="number" min="0" value="0"></label>
    <label class="field">NOTE (OPTIONAL)<input id="resultNote" maxlength="500" placeholder="Verified by screenshot"></label>
    <button id="adminPublishResult" class="join full">Publish verified result</button>
    <p class="notice">This publishes result details only. It does not pay prize money or credit wallet coins.</p>`);
}

async function showTournamentDetails(t) {
  if (!t) return;
  const id = String(t.id);
  const has = joined.some(e => String(e.tournament_id) === id);
  const mode = t.game_mode || t.type || 'SOLO';
  const entry = Number(t.entry_points ?? t.entry ?? 0);
  const prize = Number(t.prize_pool_points ?? t.prize ?? 0);
  const perKill = Number(t.per_kill_points ?? 0);
  const count = counts[id] ?? joined.filter(e => String(e.tournament_id) === id).length;
  const starts = t.starts_at ? new Date(t.starts_at).toLocaleString() : 'To be announced';
  let roomHtml = '';
  if (has && currentUser) {
    const { data: room } = await supabase.from('tournament_rooms')
      .select('room_id,room_password,published').eq('tournament_id', Number(id)).eq('published', true).maybeSingle();
    if (room?.published) {
      const { data: roster } = await supabase.rpc('get_tournament_roster', { p_tournament_id: Number(id) });
      roomHtml = '<div class="room-card"><small class="room-label">MATCH ROOM</small><div class="room-value">ID <b>' + esc(room.room_id || 'Not set') + '</b></div><div class="room-value">Password <b>' + esc(room.room_password || 'Not set') + '</b></div>' +
        (roster?.length ? '<div class="roster"><strong>PLAYER LOBBY · ' + roster.length + '</strong><div class="roster-chips">' + roster.map((p, i) => '<span class="player-chip"><i>' + (i + 1) + '</i>' + esc(p.in_game_name) + '</span>').join('') + '</div></div>' : '') + '</div>';
    }
  }
  const full = t.status === 'full' || count >= Number(t.max_players);
  const canJoin = currentUser && !has && !full && t.status === 'open';
  modal('<div class="detail-hero"><span class="tag">' + esc(mode) + ' ARENA</span><h2>' + esc(t.title) + '</h2><p>' + esc((t.status || 'open').toUpperCase()) + ' · Competitive Free Fire tournament</p></div>' +
    '<div class="detail-stats"><div><small>ENTRY FEE</small><b>' + entry + ' <i>PTS</i></b></div><div><small>PER KILL</small><b>' + perKill + ' <i>PTS</i></b></div><div><small>PRIZE POOL</small><b>' + prize + ' <i>PTS</i></b></div><div><small>PLAYERS</small><b>' + count + '/' + Number(t.max_players) + '</b></div></div>' +
    '<div class="detail-info"><div><span>🕒</span><section><small>START TIME</small><b>' + esc(starts) + '</b></section></div><div><span>🎮</span><section><small>GAME MODE</small><b>' + esc(mode) + '</b></section></div><div><span>👥</span><section><small>REGISTRATION</small><b>' + (has ? 'You are registered' : full ? 'Tournament full' : t.status === 'open' ? 'Open to join' : 'Registration closed') + '</b></section></div></div>' +
    '<section class="match-rules"><div class="rules-heading"><div><small>ORGANISER NOTES</small><h3>Match description & rules</h3></div><button id="detailsCopyRules" class="outline" '+(t.description ? '' : 'disabled')+'>Copy rules</button></div><div class="match-rules-copy">'+esc(t.description || 'The organiser has not added custom match instructions yet. Please check back before the match.')+'</div></section>' +
    roomHtml +
    (canJoin ? '<button id="detailsJoin" class="join full">Join tournament · ' + entry + ' pts</button>' : has ? '<button class="join full" disabled>REGISTERED ✓</button>' : !currentUser ? '<button id="detailsSignIn" class="join full">Sign in to join</button>' : '<button class="join full" disabled>' + (full ? 'TOURNAMENT FULL' : 'REGISTRATION CLOSED') + '</button>') +
    '<p class="notice">Displayed coins are demo-only. No deposits, entry fees, withdrawals, or prize payouts are processed.</p>');
  $('#detailsJoin')?.addEventListener('click', () => startJoin(t));
  $('#detailsSignIn')?.addEventListener('click', showAuth);
}
function startJoin(tournament) {
  if (!currentUser) { showAuth(); return; }
  const already = joined.some(x => String(x.tournament_id) === String(tournament.id));
  if (already) { toast('You are already registered.'); return; }
  modal('<h2>Register for ' + esc(tournament.title) + '</h2><p>Registration is saved to the online BattleForge database. No coins or real money are charged.</p><label class="field">FREE FIRE IN-GAME NAME<input id="ign" maxlength="24" minlength="2" placeholder="Your IGN"></label><button id="confirmJoin" class="join full">Confirm online registration</button>');
  $('#confirmJoin').onclick = async () => {
    const ign = $('#ign').value.trim();
    if (ign.length < 2 || ign.length > 24) { toast('IGN must be 2–24 characters.'); return; }
    const confirm = $('#confirmJoin');
    confirm.disabled = true;
    const { error } = await supabase.rpc('join_tournament', {
      p_tournament_id: Number(tournament.id),
      p_in_game_name: ign
    });
    confirm.disabled = false;
    if (error) { toast(error.message); return; }
    close();
    await refreshData();
    toast('Online tournament registration confirmed!');
  };
}
$('#tournaments').addEventListener('click', async e => {
  const joinButton = e.target.closest('[data-join]');
  if (joinButton) {
    const tournament = tournaments.find(t => String(t.id) === joinButton.dataset.join);
    if (tournament) startJoin(tournament);
    return;
  }
  const card = e.target.closest('[data-detail]');
  if (card) {
    const tournament = tournaments.find(t => String(t.id) === card.dataset.detail);
    if (tournament) await showTournamentDetails(tournament);
  }
});
$('#tournaments').addEventListener('keydown', async e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-detail]')) {
    e.preventDefault();
    const tournament = tournaments.find(t => String(t.id) === e.target.dataset.detail);
    if (tournament) await showTournamentDetails(tournament);
  }
});
$('#closeModal').onclick = close;
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') close(); });
$('#profileBtn').onclick = showProfile;
$('#openDeposit')?.addEventListener('click', showDepositForm);
$('#openWithdrawal')?.addEventListener('click', showWithdrawalForm);
$('#refreshPaymentRequests')?.addEventListener('click', loadPaymentRequests);
$('#adminBtn').onclick = showAdmin;
$('#modalContent').addEventListener('click', async e => {
  if (e.target.id === 'copyDepositUpi') { try { await navigator.clipboard.writeText(RECEIVING_UPI_ID); toast('UPI ID copied.'); } catch { toast('UPI ID: '+RECEIVING_UPI_ID); } }
  if (e.target.id === 'createDepositRequest') await createPaymentRequest('deposit');
  if (e.target.id === 'createWithdrawalRequest') await createPaymentRequest('withdrawal');
  if (e.target.id === 'googleSignInBtn') await googleSignIn();
  if (e.target.id === 'signInBtn') await authAction('signin');
  if (e.target.id === 'signUpBtn') await authAction('signup');
  if (e.target.id === 'backToSignIn') showAuth();
  if (e.target.id === 'signOutBtn') {
    const { error } = await supabase.auth.signOut();
    if (error) { toast(error.message); return; }
    close();
    await refreshData();
    toast('Logged out successfully.');
  }
  if (e.target.id === 'switchAccountBtn') {
    const { error } = await supabase.auth.signOut();
    if (error) { toast(error.message); return; }
    await refreshData();
    showAuth();
  }
});
$('#modalContent').addEventListener('change', async e => {
  if (e.target.id === 'adminTournament') await loadAdminRoom();
});
$('#modalContent').addEventListener('click', async e => {
  const button = e.target.closest('button');
  if (!button) return;
  if (button.id === 'adminCreateTournament') {
    if (!isAdmin) return toast('Admin access required.');
    const title = $('#adminTitle').value.trim();
    const mode = $('#adminMode').value;
    const entry = Number($('#adminEntry').value);
    const perKill = Number($('#adminPerKill').value);
    const prize = Number($('#adminPrize').value);
    const max = Number($('#adminMax').value);
    const startsRaw = $('#adminStarts').value;
    if (title.length < 3 || !Number.isInteger(entry) || entry < 0 || !Number.isInteger(perKill) || perKill < 0 || !Number.isInteger(prize) || prize < 0 || !Number.isInteger(max) || max < 1 || max > 500) return toast('Check tournament fields.');
    button.disabled = true;
    const description = $('#adminDescription').value.trim();
    const { error } = await supabase.rpc('admin_create_tournament_with_rewards', { p_title:title, p_game_mode:mode, p_entry_points:entry, p_per_kill_points:perKill, p_prize_pool_points:prize, p_max_players:max, p_starts_at:startsRaw ? new Date(startsRaw).toISOString() : null, p_description:description });
    button.disabled = false;
    if (error) return toast(error.message);
    await refreshData(); showAdmin(); toast('Tournament created.');
  }
  if (button.id === 'adminSaveRewards') {
    if (!isAdmin) return toast('Admin access required.');
    const id = Number($('#adminTournament').value);
    const entry = Number($('#adminEditEntry').value);
    const perKill = Number($('#adminEditPerKill').value);
    if (!id || !Number.isInteger(entry) || entry < 0 || entry > 1000000 || !Number.isInteger(perKill) || perKill < 0 || perKill > 1000000) return toast('Enter valid whole-number amounts.');
    button.disabled = true;
    const { error } = await supabase.rpc('admin_update_tournament_rewards', { p_tournament_id:id, p_entry_points:entry, p_per_kill_points:perKill });
    button.disabled = false;
    if (error) return toast(error.message);
    await refreshData(); showAdmin(); toast('Entry fee and per-kill reward updated.'); return;
  }
  if (button.id === 'adminSaveDescription') {
    if (!isAdmin) return toast('Admin access required.');
    const id = Number($('#adminTournament').value); const description = $('#adminEditDescription').value.trim();
    if (!id) return toast('Choose a tournament.');
    button.disabled = true;
    const { error } = await supabase.rpc('admin_set_tournament_description', { p_tournament_id:id, p_description:description });
    button.disabled = false; if (error) return toast(error.message);
    await refreshData(); showAdmin(); toast('Match description saved.'); return;
  }
  if (button.id === 'adminSetStatus') {
    const id = Number($('#adminTournament').value); if (!id) return toast('Choose a tournament.');
    button.disabled = true;
    const { error } = await supabase.rpc('admin_set_tournament_status', { p_tournament_id:id, p_status:$('#adminStatus').value });
    button.disabled = false; if (error) return toast(error.message);
    await refreshData(); showAdmin(); toast('Tournament status saved.');
  }
  if (button.id === 'adminDeleteTournament') {
    if (!isAdmin) return toast('Admin access required.');
    const id = Number($('#adminTournament')?.value);
    const tournament = tournaments.find(t => Number(t.id) === id);
    if (!id || !tournament) return toast('Choose a tournament.');
    const confirmed = window.confirm('Permanently delete "' + tournament.title + '" and its registrations, room, and results? This cannot be undone.');
    if (!confirmed) return;
    button.disabled = true;
    const { error } = await supabase.rpc('admin_delete_tournament', { p_tournament_id: id });
    button.disabled = false;
    if (error) return toast(error.message);
    await refreshData();
    showAdmin();
    toast('Tournament and its records deleted.');
  }
  if (button.id === 'adminSaveRoom') {
    const id = Number($('#adminTournament').value); if (!id) return toast('Choose a tournament.');
    button.disabled = true;
    const { error } = await supabase.rpc('admin_set_tournament_room', { p_tournament_id:id, p_room_id:$('#adminRoomId').value.trim(), p_room_password:$('#adminRoomPassword').value.trim(), p_published:$('#adminRoomPublished').checked });
    button.disabled = false; if (error) return toast(error.message);
    toast('Match room saved. You can update it anytime.');
    await loadAdminRankings();
  }
  if (button.id === 'adminLoadEntries') await loadAdminRankings();
  if (button.dataset.resultEntry) showResultForm(button.dataset.resultEntry, button.dataset.ign || 'Player');
  if (button.id === 'adminPublishResult') {
    if (!pendingResultEntry) return toast('Choose a player first.');
    const placeRaw = $('#resultPlacement').value;
    const placement = placeRaw === '' ? null : Number(placeRaw);
    const kills = Number($('#resultKills').value);
    const note = $('#resultNote').value.trim();
    if ((placement !== null && (!Number.isInteger(placement) || placement < 1)) || !Number.isInteger(kills) || kills < 0) return toast('Check placement and kills.');
    button.disabled = true;
    const { error } = await supabase.rpc('admin_publish_result', { p_entry_id:pendingResultEntry, p_placement:placement, p_kills:kills, p_note:note });
    button.disabled = false; if (error) return toast(error.message);
    pendingResultEntry = null; close(); toast('Verified result published to player.');
  }
});
document.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => setPage(button.dataset.tab));
document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => setPage(button.dataset.go)));
document.querySelector('[data-home]')?.addEventListener('click', event => { event.preventDefault(); setPage('arena'); });
$('#historySignIn')?.addEventListener('click', showAuth);
$('#historyContent')?.addEventListener('click', event => { const button = event.target.closest('[data-go]'); if (button) setPage(button.dataset.go); if (event.target.closest('#historySignIn')) showAuth(); });
$('#modalContent').addEventListener('click', async event => {
  if (!event.target.closest('#detailsCopyRules')) return;
  const rules = $('.match-rules-copy')?.textContent ?? '';
  if (!rules) return;
  try { await navigator.clipboard.writeText(rules); toast('Match rules copied.'); }
  catch { const area=document.createElement('textarea'); area.value=rules; area.style.position='fixed'; area.style.opacity='0'; document.body.appendChild(area); area.select(); const ok=document.execCommand('copy'); area.remove(); toast(ok?'Match rules copied.':'Select and copy the rules manually.'); }
});
supabase.auth.onAuthStateChange(() => { setTimeout(() => refreshData(), 0); });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
refreshData();
