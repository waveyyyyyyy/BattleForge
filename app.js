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
function setPage(tab) {
  const target = tab === 'arena-list' ? 'arena' : (['arena','wallet','history','rules'].includes(tab) ? tab : 'arena');
  document.querySelectorAll('.page-view').forEach(page => page.classList.toggle('active', page.dataset.page === target));
  document.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === target));
  document.body.dataset.page = target;
  close();
  if (target === 'history') showHistory();
  if (target === 'wallet') renderWallet();
  if (tab === 'arena-list') $('#arena-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else window.scrollTo({ top: 0, behavior: 'smooth' });
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
    const count = counts[id] ?? joined.filter(e => String(e.tournament_id) === id).length;
    const full = t.status === 'full' || count >= Number(t.max_players);
    return '<article class="tour" data-detail="' + esc(id) + '" role="button" tabindex="0" aria-label="View tournament details for ' + esc(t.title) + '"><div class="tour-banner"></div><div class="tour-body"><div class="tour-top"><div><h3>' + esc(t.title) + '</h3><p>' + esc(mode) + ' tournament • online registration</p></div><span class="tag">' + esc(mode) + '</span></div><div class="meta"><span>👥 ' + count + ' / ' + Number(t.max_players) + ' players</span><span>' + esc(t.status || 'open').toUpperCase() + '</span></div><div class="prize-row"><div class="prize"><b>' + prize + ' pts</b><small>DISPLAYED PRIZE POOL</small></div><button class="join" data-join="' + esc(id) + '" ' + ((has || full || t.status !== 'open') ? 'disabled' : '') + '>' + (has ? 'JOINED ✓' : full ? 'FULL' : currentUser ? 'REGISTER • ' + entry + ' PTS' : 'SIGN IN TO JOIN') + '</button></div></div></article>';
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
    .select('id,title,description,game_mode,entry_points,prize_pool_points,max_players,status,starts_at')
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
  target.innerHTML = !currentUser ? '<div class="empty-state"><span>◷</span><h3>Your match timeline</h3><p>Sign in to see your registrations, lobby details, and published results.</p><button id="historySignIn" class="join">Sign in</button></div>' : rows.length ? rows.slice().sort((a,b) => new Date(b.created_at)-new Date(a.created_at)).map(e => {
    const room=roomFor(e.tournament_id), result=resultFor(e.tournament_id), roster=rosterRows[String(e.tournament_id)]??[], t=tournaments.find(x=>String(x.id)===String(e.tournament_id));
    return '<article class="history-card"><div class="history-card-top"><span class="history-symbol">✦</span><span class="status-chip">REGISTERED</span></div><h3>'+esc(t?.title || 'BattleForge tournament')+'</h3><p class="history-meta">'+esc(e.in_game_name)+' · '+esc(new Date(e.created_at).toLocaleString())+'</p>'+
    (room ? '<div class="room-card"><small class="room-label">MATCH ROOM</small><div class="room-value">ID <b>'+esc(room.room_id||'Not set')+'</b></div><div class="room-value">Password <b>'+esc(room.room_password||'Not set')+'</b></div>'+(roster.length?'<div class="roster"><strong>PLAYER LOBBY · '+roster.length+'</strong><div class="roster-chips">'+roster.map((x,i)=>'<span class="player-chip"><i>'+(i+1)+'</i>'+esc(x.in_game_name)+'</span>').join('')+'</div></div>':'')+'</div>' : '<p class="history-pending">Room details will appear here after the organiser publishes them.</p>')+
    (result ? '<div class="result-banner"><small>VERIFIED RESULT</small><b>'+(result.placement?'Place #'+Number(result.placement)+' · ':'')+Number(result.kills)+' kills</b>'+(result.note?'<p>'+esc(result.note)+'</p>':'')+'</div>' : '')+'</article>';
  }).join('') : '<div class="empty-state"><span>◷</span><h3>No matches yet</h3><p>Join a tournament from the Arena page and your registration will show up here.</p><button class="join" data-go="arena">Explore tournaments</button></div>';
}

async function loadAdminRoom() {
  if (!isAdmin) return;
  const id = Number($('#adminTournament')?.value);
  const selectedTournament = tournaments.find(t => Number(t.id) === id);
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
  if (!currentUser || !isAdmin) { toast('Admin access required.'); return; }
  const options = tournaments.map(t => `<option value="${esc(t.id)}">${esc(t.title)} (${esc(t.game_mode)})</option>`).join('');
  const openCount = tournaments.filter(t => t.status === 'open').length;
  const closedCount = tournaments.filter(t => t.status === 'closed' || t.status === 'full').length;
  const playerTotal = Object.values(counts).reduce((sum, n) => sum + Number(n || 0), 0);
  modal(`<div class="admin-dashboard-head"><div class="eyebrow"><span class="live-dot"></span> ORGANISER CONTROL CENTRE</div><h2>Admin dashboard</h2><p>Everything you need to run a match, from one place.</p></div>
    <div class="admin-metrics"><div><small>TOURNAMENTS</small><b>${tournaments.length}</b></div><div><small>OPEN</small><b>${openCount}</b></div><div><small>REGISTRATIONS</small><b>${playerTotal}</b></div><div><small>CLOSED / FULL</small><b>${closedCount}</b></div></div>
    <div class="admin-quick-grid"><button class="admin-quick" data-admin-jump="adminCreateSection"><span>＋</span><b>Create match</b><small>Set mode, slots & rules</small></button><button class="admin-quick" data-admin-jump="adminManageSection"><span>⚙</span><b>Manage match</b><small>Status, room & description</small></button><button class="admin-quick" data-admin-jump="adminPlayersSection"><span>♙</span><b>Players & results</b><small>Review entries and kills</small></button></div>
    <div id="adminCreateSection" class="admin-section"><div class="admin-section-title"><span>01</span><div><h3>Create tournament</h3><p>Set the match details players will see.</p></div></div>
    <label class="field">TOURNAMENT TITLE<input id="adminTitle" maxlength="80" placeholder="Weekend Solo Cup"></label>
    <div class="admin-form-grid"><label class="field">GAME MODE<select id="adminMode"><option>SOLO</option><option>DUO</option><option>SQUAD</option></select></label><label class="field">MAX PLAYERS<input id="adminMax" type="number" min="1" max="500" value="48"></label></div>
    <div class="admin-form-grid"><label class="field">ENTRY COINS<input id="adminEntry" type="number" min="0" value="0"></label><label class="field">DISPLAYED PRIZE (COINS)<input id="adminPrize" type="number" min="0" value="0"></label></div>
    <label class="field">START TIME (OPTIONAL)<input id="adminStarts" type="datetime-local"></label>
    <label class="field">MATCH DESCRIPTION & RULES<textarea id="adminDescription" maxlength="5000" rows="5" placeholder="Paste room instructions, start time, scoring, screenshot proof, and disqualification rules…"></textarea></label>
    <p class="admin-helper">Tip: include the exact start time, room release time, kill scoring, late-entry policy, and what proof players must submit.</p>
    <button id="adminCreateTournament" class="join full">＋ Create tournament</button></div>
    <div id="adminManageSection" class="admin-section"><div class="admin-section-title"><span>02</span><div><h3>Manage tournament</h3><p>Select a match first, then edit its settings.</p></div></div>
    <label class="field">SELECT TOURNAMENT<select id="adminTournament">${options || '<option value="">Create a tournament first</option>'}</select></label>
    <div class="admin-current-summary" id="adminSelectedSummary">${tournaments.length ? 'Select a tournament to load its current settings.' : 'No tournaments yet.'}</div>
    <label class="field">MATCH DESCRIPTION & RULES<textarea id="adminEditDescription" maxlength="5000" rows="5" placeholder="Player-facing rules and match instructions"></textarea></label>
    <button id="adminSaveDescription" class="outline full">Save description</button>
    <div class="admin-form-grid"><label class="field">ENTRY STATUS<select id="adminStatus"><option value="open">Open entries</option><option value="closed">Close entries</option><option value="full">Mark full</option></select></label><div class="field"><span>DESTRUCTIVE ACTION</span><button id="adminDeleteTournament" class="outline full danger-button">Delete tournament</button></div></div>
    <button id="adminSetStatus" class="join full secondary-action">Save entry status</button></div>
    <div class="admin-section"><div class="admin-section-title"><span>03</span><div><h3>Room & lobby</h3><p>Only publish these details when you are ready.</p></div></div>
    <label class="field">ROOM ID<input id="adminRoomId" maxlength="80" placeholder="Enter room ID"></label><label class="field">ROOM PASSWORD<input id="adminRoomPassword" maxlength="80" placeholder="Enter room password"></label>
    <label class="admin-check"><input id="adminRoomPublished" type="checkbox"><span><b>Publish room to registered players</b><small>Players will see room details and the eligible roster.</small></span></label>
    <button id="adminSaveRoom" class="join full">Save room settings</button></div>
    <div id="adminPlayersSection" class="admin-section"><div class="admin-section-title"><span>04</span><div><h3>Players & results</h3><p>Load registered players and publish verified match results.</p></div></div><button id="adminLoadEntries" class="outline full">Load players / record results</button><div id="adminEntries" class="admin-entries"></div></div>
    <div class="admin-footer-note"><span>ⓘ</span><p>Deleting permanently removes the tournament, registrations, room and results. Result publishing records results only; it does not transfer prize money or credit wallet coins.</p></div>`);
  $('#adminTournament')?.addEventListener('change', async () => { await loadAdminRoom(); syncAdminSelectedSummary(); });
  document.querySelectorAll('[data-admin-jump]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.adminJump)?.scrollIntoView({behavior:'smooth',block:'start'})));
  await loadAdminRoom(); syncAdminSelectedSummary();
}

function syncAdminSelectedSummary() {
  const id = Number($('#adminTournament')?.value);
  const t = tournaments.find(item => Number(item.id) === id);
  const el = $('#adminSelectedSummary');
  if (!el) return;
  if (!t) { el.textContent = 'Select a tournament to load its current settings.'; return; }
  const count = Number(counts[String(id)] ?? 0);
  const status = String(t.status || 'open').toUpperCase();
  el.innerHTML = `<div><b>${esc(t.title)}</b><small>${esc(t.game_mode || 'SOLO')} · ${count}/${Number(t.max_players || 0)} players</small></div><span class="status-chip">${esc(status)}</span><div><small>ENTRY</small><b>${Number(t.entry_points || 0)} coins</b></div><div><small>PRIZE DISPLAY</small><b>${Number(t.prize_pool_points || 0)} coins</b></div>`;
  if ($('#adminEditDescription')) $('#adminEditDescription').value = t.description || '';
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
    '<div class="detail-stats"><div><small>ENTRY FEE</small><b>' + entry + ' <i>PTS</i></b></div><div><small>PRIZE POOL</small><b>' + prize + ' <i>PTS</i></b></div><div><small>PLAYERS</small><b>' + count + '/' + Number(t.max_players) + '</b></div></div>' +
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
    const description = $('#adminDescription').value.trim();
    const { error } = await supabase.rpc('admin_create_tournament_with_description', { p_title:title, p_game_mode:mode, p_entry_points:entry, p_prize_pool_points:prize, p_max_players:max, p_starts_at:startsRaw ? new Date(startsRaw).toISOString() : null, p_description:description });
    button.disabled = false;
    if (error) return toast(error.message);
    await refreshData(); showAdmin(); toast('Tournament created.');
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
