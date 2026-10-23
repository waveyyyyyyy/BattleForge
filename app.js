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
  isAdmin = false;
  if (currentUser) {
    const { data: adminFlag, error: adminError } = await supabase.rpc('is_battleforge_admin');
    if (!adminError) isAdmin = adminFlag === true;
  }
  $('#adminBtn')?.classList.toggle('hidden', !isAdmin);
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
  let roomRows = [];
  let resultRows = [];
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
  if (currentUser && roomRows.length) {
    await Promise.all(roomRows.map(async room => {
      const { data: roster, error: rosterError } = await supabase.rpc('get_tournament_roster', { p_tournament_id: Number(room.tournament_id) });
      if (!rosterError) rosterRows[String(room.tournament_id)] = roster ?? [];
    }));
  }
  const roomFor = id => roomRows.find(r => String(r.tournament_id) === String(id));
  const resultFor = id => resultRows.find(r => String(r.tournament_id) === String(id));
  modal('<h2>Activity history</h2><p>Your registrations, match-room details and verified results.</p>' +
    (rows.length ? rows.map(e => {
      const room = roomFor(e.tournament_id);
      const result = resultFor(e.tournament_id);
      const roster = rosterRows[String(e.tournament_id)] ?? [];
      return '<div class="entry history-entry"><div><strong>' + esc(e.in_game_name) + '</strong><small>Registered ' + esc(new Date(e.created_at).toLocaleString()) + '</small>' +
        (room ? '<div class="room-card"><small class="room-label">MATCH ROOM</small><div class="room-value">ID <b>' + esc(room.room_id || 'Not set') + '</b></div><div class="room-value">Password <b>' + esc(room.room_password || 'Not set') + '</b></div><small>Room details are shared with registered players.</small></div>' : '') +
        (room && roster.length ? '<div class="roster"><strong>PLAYER LOBBY · ' + roster.length + '</strong><div class="roster-chips">' + roster.map((p, i) => '<span class="player-chip"><i>' + (i + 1) + '</i>' + esc(p.in_game_name) + '</span>').join('') + '</div></div>' : '') +
        (result ? '<small class="result-line">RESULT: ' + (result.placement ? 'Place #' + Number(result.placement) + ' · ' : '') + Number(result.kills) + ' kills' + (result.note ? ' · ' + esc(result.note) : '') + '</small>' : '') +
        '</div><b class="joined-label">JOINED</b></div>';
    }).join('') : '<p class="notice">No online registrations yet. Join a tournament to see your match details here.</p>') +
    '<p class="notice">Wallet points and prizes are still demo-only. Published results do not move money or points.</p>');
}

async function loadAdminRoom() {
  if (!isAdmin) return;
  const id = Number($('#adminTournament')?.value);
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
  if (!currentUser || !isAdmin) { toast('Admin access required.'); return; }
  const options = tournaments.map(t => `<option value="${esc(t.id)}">${esc(t.title)} (${esc(t.game_mode)})</option>`).join('');
  modal(`<h2>BattleForge Admin</h2><p>Create tournaments, control entry status, publish room details and verify match results.</p>
    <h3>Create tournament</h3>
    <label class="field">TITLE<input id="adminTitle" maxlength="80" placeholder="Weekend Solo Cup"></label>
    <label class="field">MODE<select id="adminMode"><option>SOLO</option><option>DUO</option><option>SQUAD</option></select></label>
    <label class="field">ENTRY POINTS<input id="adminEntry" type="number" min="0" value="0"></label>
    <label class="field">DISPLAYED PRIZE POOL (POINTS)<input id="adminPrize" type="number" min="0" value="0"></label>
    <label class="field">MAX PLAYERS<input id="adminMax" type="number" min="1" max="500" value="48"></label>
    <label class="field">START TIME (OPTIONAL)<input id="adminStarts" type="datetime-local"></label>
    <button id="adminCreateTournament" class="join full">Create tournament</button>
    <hr>
    <h3>Manage tournament</h3>
    <label class="field">TOURNAMENT<select id="adminTournament">${options || '<option value="">Create a tournament first</option>'}</select></label>
    <label class="field">STATUS<select id="adminStatus"><option value="open">Open entries</option><option value="closed">Close entries</option><option value="full">Mark full</option></select></label>
    <button id="adminSetStatus" class="join full">Save entry status</button>
    <label class="field">ROOM ID<input id="adminRoomId" maxlength="80" placeholder="Room ID"></label>
    <label class="field">ROOM PASSWORD<input id="adminRoomPassword" maxlength="80" placeholder="Room password"></label>
    <label><input id="adminRoomPublished" type="checkbox"> Publish room details to registered players</label>
    <button id="adminSaveRoom" class="join full">Save match room</button>
    <button id="adminLoadEntries" class="join full">Load players / record results</button>
    <div id="adminEntries"></div>
    <p class="notice">Choose a tournament to load its saved room. You can change the room ID or password anytime; saving replaces the previous details. Players see the room and roster after publishing.</p>`);
  await loadAdminRoom();
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
    <p class="notice">This publishes result details only. It does not pay prize money or credit wallet points.</p>`);
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
$('#adminBtn').onclick = showAdmin;
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
    const prize = Number($('#adminPrize').value);
    const max = Number($('#adminMax').value);
    const startsRaw = $('#adminStarts').value;
    if (title.length < 3 || !Number.isInteger(entry) || entry < 0 || !Number.isInteger(prize) || prize < 0 || !Number.isInteger(max) || max < 1 || max > 500) return toast('Check tournament fields.');
    button.disabled = true;
    const { error } = await supabase.rpc('admin_create_tournament', { p_title:title, p_game_mode:mode, p_entry_points:entry, p_prize_pool_points:prize, p_max_players:max, p_starts_at:startsRaw ? new Date(startsRaw).toISOString() : null });
    button.disabled = false;
    if (error) return toast(error.message);
    await refreshData(); showAdmin(); toast('Tournament created.');
  }
  if (button.id === 'adminSetStatus') {
    const id = Number($('#adminTournament').value); if (!id) return toast('Choose a tournament.');
    button.disabled = true;
    const { error } = await supabase.rpc('admin_set_tournament_status', { p_tournament_id:id, p_status:$('#adminStatus').value });
    button.disabled = false; if (error) return toast(error.message);
    await refreshData(); showAdmin(); toast('Tournament status saved.');
  }
  if (button.id === 'adminSaveRoom') {
    const id = Number($('#adminTournament').value); if (!id) return toast('Choose a tournament.');
    button.disabled = true;
    const { error } = await supabase.rpc('admin_set_tournament_room', { p_tournament_id:id, p_room_id:$('#adminRoomId').value.trim(), p_room_password:$('#adminRoomPassword').value.trim(), p_published:$('#adminRoomPublished').checked });
    button.disabled = false; if (error) return toast(error.message);
    toast('Match room saved. You can update it anytime.');
    await loadAdminEntries();
  }
  if (button.id === 'adminLoadEntries') await loadAdminEntries();
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
