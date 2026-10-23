import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://izyttrbspxrcacwuhwer.supabase.co';
const SUPABASE_KEY = 'sb_publishable_79ln_ouADVGWi6H5ZTc6Qg_c3ifNfQ7';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (s) => document.querySelector(s);
let balance = read('bf_balance', 250);
let history = read('bf_history', []);
let tournaments = [];
let joined = [];
let currentUser = null;
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
  $('#modalContent').innerHTML = html;
  $('#modal').classList.remove('hidden');
}
function close() { $('#modal').classList.add('hidden'); }

function render() {
  $('#balance').textContent = balance;
  $('#tournaments').innerHTML = tournaments.length ? tournaments.map(t => {
    const id = String(t.id);
    const has = joined.some(e => String(e.tournament_id) === id);
    const mode = t.game_mode || t.type || 'SOLO';
    const entry = Number(t.entry_points ?? t.entry ?? 0);
    const prize = Number(t.prize_pool_points ?? t.prize ?? 0);
    const count = counts[id] ?? joined.filter(e => String(e.tournament_id) === id).length;
    const full = t.status === 'full' || count >= Number(t.max_players);
    return '<article class="tour"><div class="tour-banner"></div><div class="tour-body"><div class="tour-top"><div><h3>' + esc(t.title) + '</h3><p>' + esc(mode) + ' tournament • online registration</p></div><span class="tag">' + esc(mode) + '</span></div><div class="meta"><span>👥 ' + count + ' / ' + Number(t.max_players) + ' players</span><span>' + esc(t.status || 'open').toUpperCase() + '</span></div><div class="prize-row"><div class="prize"><b>' + prize + ' pts</b><small>DISPLAYED PRIZE POOL</small></div><button class="join" data-join="' + esc(id) + '" ' + ((has || full || t.status !== 'open') ? 'disabled' : '') + '>' + (has ? 'JOINED ✓' : full ? 'FULL' : currentUser ? 'REGISTER • ' + entry + ' PTS' : 'SIGN IN TO JOIN') + '</button></div></div></article>';
  }).join('') : '<p class="notice">No tournaments are published yet. The online database is connected; add the starter tournaments using the seed.sql file in the repository.</p>';
  $('#profileBtn').textContent = currentUser ? 'My Account' : 'Sign In';
}
async function refreshData() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) console.warn(sessionError);
  currentUser = session?.user ?? null;
  const { data, error } = await supabase.from('tournaments')
    .select('id,title,game_mode,entry_points,prize_pool_points,max_players,status,starts_at')
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
}
function showAuth() {
  modal('<h2>BattleForge account</h2><p>Sign in or create an account to register online. Use an email you can access.</p><label class="field">EMAIL<input id="authEmail" type="email" autocomplete="email" placeholder="you@example.com"></label><label class="field">PASSWORD<input id="authPassword" type="password" autocomplete="current-password" minlength="8" placeholder="At least 8 characters"></label><button id="signInBtn" class="join full">Sign in</button><button id="signUpBtn" class="join full">Create account</button><p class="notice">Supabase may email you a confirmation link before your first sign-in. Never share your password or OTP.</p>');
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
  modal('<h2>Player account</h2><p>Signed in as <b>' + esc(currentUser.email) + '</b></p><p class="notice">Online account and tournament registrations are connected. Points shown in the wallet remain demo-only.</p><button id="signOutBtn" class="join full">Sign out</button>');
}
async function showHistory() {
  const rows = currentUser ? joined : [];
  modal('<h2>Activity history</h2><p>Online registrations for your signed-in account.</p>' +
    (rows.length ? rows.map(e => '<div class="entry"><div>Registered as ' + esc(e.in_game_name) + '<small>' + esc(new Date(e.created_at).toLocaleString()) + '</small></div><b>JOINED</b></div>').join('') : '<p>No online registrations yet.</p>') +
    '<p class="notice">The points balance is still a local demo balance. Deposits, withdrawals and prize payouts are disabled.</p>');
}
$('#tournaments').addEventListener('click', async e => {
  const button = e.target.closest('[data-join]');
  if (!button) return;
  if (!currentUser) { showAuth(); return; }
  const tournament = tournaments.find(t => String(t.id) === button.dataset.join);
  if (!tournament) return;
  const already = joined.some(x => String(x.tournament_id) === String(tournament.id));
  if (already) return;
  modal('<h2>Register for ' + esc(tournament.title) + '</h2><p>Registration is saved to the online BattleForge database. No points or real money are charged.</p><label class="field">FREE FIRE IN-GAME NAME<input id="ign" maxlength="24" minlength="2" placeholder="Your IGN"></label><button id="confirmJoin" class="join full">Confirm online registration</button>');
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
});
$('#historyBtn').onclick = showHistory;
$('#closeModal').onclick = close;
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') close(); });
$('#profileBtn').onclick = showProfile;
$('#modalContent').addEventListener('click', async e => {
  if (e.target.id === 'signInBtn') await authAction('signin');
  if (e.target.id === 'signUpBtn') await authAction('signup');
  if (e.target.id === 'backToSignIn') showAuth();
  if (e.target.id === 'signOutBtn') {
    const { error } = await supabase.auth.signOut();
    if (error) { toast(error.message); return; }
    close();
    await refreshData();
    toast('Signed out.');
  }
});
document.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => {
  document.querySelectorAll('[data-tab]').forEach(x => x.classList.remove('active'));
  button.classList.add('active');
  if (button.dataset.tab === 'wallet') modal('<h2>Demo wallet</h2><p>Your current simulated balance.</p><div class="balance">' + balance + ' <small>PTS</small></div><p class="notice">This is not an online wallet. Deposits, withdrawals, fees and prize payouts are disabled.</p>');
  if (button.dataset.tab === 'history') showHistory();
  if (button.dataset.tab === 'rules') modal('<h2>Arena rules</h2><p>1. Use your correct in-game name.</p><p>2. Follow room timing and organizer instructions.</p><p>3. Never share passwords or OTPs.</p><p>4. Tournament registrations are online; results and payouts are not yet automated.</p>');
  if (button.dataset.tab === 'arena') close();
});
supabase.auth.onAuthStateChange(() => { setTimeout(() => refreshData(), 0); });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
refreshData();
