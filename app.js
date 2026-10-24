import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

const SUPABASE_URL = 'https://izyttrbspxrcacwuhwer.supabase.co';
const SUPABASE_KEY = 'sb_publishable_79ln_ouADVGWi6H5ZTc6Qg_c3ifNfQ7';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { flowType: 'pkce', detectSessionInUrl: false } });

const $ = (s) => document.querySelector(s);
let balance = 0;
let history = [];
let tournaments = [];
let joined = [];
let currentUser = null;
let isAdmin = false;
let pendingResultEntry = null;
let counts = {};
let leaderboardPeriod = 'all';
let audioContext = null;
function playUiSound(kind = 'tap') { if (read('bf_sound_enabled', true) !== true) return; try { const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return; audioContext ||= new Ctx(); const osc = audioContext.createOscillator(); const gain = audioContext.createGain(); osc.type = 'sine'; osc.frequency.value = kind === 'success' ? 660 : 420; gain.gain.setValueAtTime(0.025, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.09); osc.connect(gain); gain.connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime + 0.1); } catch {} }

function read(k, fallback) {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; }
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
  $('#modal').classList.toggle('profile-modal', html.includes('profile-sheet'));
  $('#modal').classList.remove('hidden');
  if (html.includes('profile-sheet')) {
    const card = $('#modal .modal-card');
    if (card) card.scrollTop = 0;
  }
}
function close() { $('#modal').classList.add('hidden'); $('#modal').classList.remove('profile-modal'); }
function setPage(tab) {
  const target = tab === 'arena-list' ? 'arena' : (['arena','wallet','history','rules','leaderboard'].includes(tab) ? tab : 'arena');
  document.querySelectorAll('.page-view').forEach(page => page.classList.toggle('active', page.dataset.page === target));
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
  modal('<h2>Deposit</h2><p>1. Enter the amount and your UPI ID. 2. Pay the exact amount to BattleForge. 3. Tick the box and submit.</p><p class="notice">Minimum deposit: ₹30. Deposits are manually verified and may take up to 24 hours to appear in your wallet.</p><form id="depositRequestForm"><label class="field">AMOUNT (₹)<input id="depositAmount" type="number" min="30" max="50000" step="1" inputmode="numeric" placeholder="100" required></label><label class="field">YOUR PAYING UPI ID<input id="depositPayerUpi" maxlength="100" autocomplete="off" placeholder="yourname@upi" required></label><div class="room-card"><small class="room-label">PAY TO THIS UPI ID</small><div class="room-value"><b id="depositReceiverUpi">kjaman@fam</b><button type="button" id="copyDepositUpi" class="outline">Copy UPI ID</button></div><p>Pay the exact amount using your UPI app. Never share your UPI PIN or OTP.</p></div><div class="wallet-total"><span id="depositCountdown">02:00</span></div><p class="notice">Complete your payment within 2 minutes. The countdown is not proof of payment.</p><label class="admin-check" style="display:flex;align-items:flex-start;gap:10px"><input id="depositPaidCheckbox" type="checkbox" required style="width:18px;height:18px;flex-shrink:0;accent-color:var(--lime)"><span><b>I have paid</b><small>I confirm I sent the exact amount to the UPI ID shown above.</small></span></label><button type="submit" id="createDepositRequest" class="join full">Submit payment for verification</button></form>');
  if (depositTimerInterval) clearInterval(depositTimerInterval);
  const expires = Date.now() + 120000;
  const tick = () => { const el=$('#depositCountdown'); if (!el) { clearInterval(depositTimerInterval); return; } const left=Math.max(0,Math.ceil((expires-Date.now())/1000)); el.textContent=String(Math.floor(left/60)).padStart(2,'0')+':'+String(left%60).padStart(2,'0'); if (!left) { el.textContent='00:00'; clearInterval(depositTimerInterval); toast('2-minute timer ended. If you already paid, you can still submit it for manual review.'); } };
  tick(); depositTimerInterval=setInterval(tick,1000);
}
function showWithdrawalForm() {
  if (!currentUser) { showAuth(); return; }
  modal('<h2>Withdrawal request</h2><p>Enter the exact account-holder name and destination UPI ID.</p><p class=\"notice\">Withdrawals can take up to 24 hours to process. Minimum withdrawal: ₹100. Only money earned from playing matches is withdrawable; match earnings can also be used for entry fees. Deposited funds are not withdrawable.</p><form id=\"withdrawalRequestForm\"><label class=\"field\">EXACT ACCOUNT HOLDER NAME<input id=\"withdrawName\" maxlength=\"120\" autocomplete=\"name\" placeholder=\"Name as shown by your bank/UPI app\" required></label><label class=\"field\">YOUR RECEIVING UPI ID<input id=\"withdrawUpi\" maxlength=\"100\" autocomplete=\"off\" placeholder=\"yourname@upi\" required></label><label class=\"field\">AMOUNT (₹)<input id=\"withdrawAmount\" type=\"number\" min=\"100\" max=\"50000\" step=\"1\" inputmode=\"numeric\" placeholder=\"100\" required></label><div class=\"room-card\"><div class=\"room-value\">Withdrawal fee <b>2%</b></div><div class=\"room-value\">You receive <b id=\"withdrawNet\">₹0.00</b></div></div><p class=\"notice\">This creates a review request only. It does not transfer money. Never enter your UPI PIN or OTP.</p><button type=\"submit\" id=\"createWithdrawalRequest\" class=\"join full\">Submit withdrawal request</button></form>');
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
  if (!Number.isInteger(amount) || amount < (isDeposit ? 30 : 100) || amount > 50000) return toast(isDeposit ? 'Minimum deposit is ₹30. Enter a whole amount up to ₹50,000.' : 'Minimum withdrawal is ₹100. Enter a whole amount up to ₹50,000.');
  if (!validUpi(upi)) return toast('Enter a valid UPI ID, like name@upi.');
  if (isDeposit && !$('#depositPaidCheckbox')?.checked) return toast('Tick “I have paid” after sending the payment.');
  if (!isDeposit && (!name || name.length < 2 || name.length > 120)) return toast('Enter the exact account-holder name.');
  if (button) { button.disabled = true; button.textContent = 'Submitting…'; }
  let data, error;
  try { ({ data, error } = await supabase.rpc(isDeposit ? 'create_deposit_request' : 'create_withdrawal_request', isDeposit ? { p_amount: amount, p_payer_upi: upi } : { p_amount: amount, p_account_name: name, p_payout_upi: upi })); }
  catch (err) { error = err; }
  if (button) { button.disabled = false; button.textContent = isDeposit ? 'Submit deposit request' : 'Submit withdrawal request'; }
  if (error) { console.error(error); return toast(error.message || 'Could not save request. Check the payment SQL migrations in Supabase, then retry.'); }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) return toast('Request response was empty. Refresh requests before retrying to avoid duplicates.');
  close();
  if (isDeposit) {
    const { error: reportError } = await supabase.rpc('mark_deposit_payment_reported', { p_request_id: row.id });
    if (reportError) { console.error(reportError); modal('<h2>Deposit request saved</h2><p>Request ID: <b>'+esc(row.id)+'</b></p><p class=\"notice\">Your request is pending. Please contact support if the paid status does not appear.</p><button id=\"closeDepositTimer\" class=\"join full\">Close</button>'); $('#closeDepositTimer')?.addEventListener('click', async () => { close(); await loadPaymentRequests(); }); }
    else { modal('<h2>Payment submitted</h2><p>Request ID: <b>'+esc(row.id)+'</b></p><div class=\"room-card\"><div class=\"room-value\">Amount <b>₹'+Number(row.amount).toFixed(2)+'</b></div><div class=\"room-value\">Status <b>Pending verification</b></div></div><p>Your wallet will be credited only after the payment is manually verified. Verification may take up to 24 hours.</p><button id=\"closeDepositTimer\" class=\"join full\">Done</button>'); $('#closeDepositTimer')?.addEventListener('click', async () => { close(); await loadPaymentRequests(); }); }
    await loadPaymentRequests();
  } else { toast('Withdrawal request saved for review. No money has been sent.'); await loadPaymentRequests(); }
}
async function loadPaymentRequests() {
  const target=$('#paymentRequests'); if(!target) return;
  if(!currentUser) { target.innerHTML='<p class="notice">Sign in to view payment requests.</p>'; return; }
  const [dep,wd]=await Promise.all([supabase.from('deposit_requests').select('id,amount,status,created_at,expires_at,payer_upi').order('created_at',{ascending:false}).limit(10),supabase.from('withdrawal_requests').select('id,amount,fee_amount,net_amount,status,created_at,account_name,payout_upi').order('created_at',{ascending:false}).limit(10)]);
  if(dep.error||wd.error) { target.innerHTML='<p class="notice">Payment-request database is not ready. Apply supabase/006_payment_requests.sql in the Supabase SQL Editor.</p>'; return; }
  const rows=[...(dep.data||[]).map(x=>({...x,kind:'Deposit'})),...(wd.data||[]).map(x=>({...x,kind:'Withdrawal'}))].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,10);
  target.innerHTML=rows.length?rows.map(x=>'<div class="activity-row"><span class="activity-mark">'+(x.kind==='Deposit'?'＋':'↗')+'</span><div><b>'+x.kind+' · ₹'+Number(x.amount).toFixed(2)+'</b><small>'+esc(x.status.toUpperCase())+' · '+esc(new Date(x.created_at).toLocaleString())+'</small><small>Ref '+esc(x.id)+'</small></div><strong>'+(x.kind==='Withdrawal'?'Net ₹'+Number(x.net_amount).toFixed(2):'Pending check')+'</strong></div>').join(''):'<div class="empty-state"><b>No payment requests yet</b><p>Your requests will appear here.</p></div>';
}


async function loadAdminPaymentRequests() {
  const target = $('#adminPaymentRequests'); if (!target || !isAdmin) return;
  target.innerHTML = '<p class="notice">Loading payment requests…</p>';
  const [dep, wd] = await Promise.all([
    supabase.from('deposit_requests').select('id,user_id,amount,payer_upi,receiver_upi,status,created_at,expires_at,payment_reference,admin_note').order('created_at',{ascending:false}).limit(100),
    supabase.from('withdrawal_requests').select('id,user_id,amount,fee_amount,net_amount,account_name,payout_upi,status,created_at,reviewed_at,payout_reference,admin_note').order('created_at',{ascending:false}).limit(100)
  ]);
  if (dep.error || wd.error) { target.innerHTML = '<p class="notice">Could not load requests. Apply Supabase migrations 006, 008 and 009, then reload.</p>'; console.error(dep.error || wd.error); return; }
  const rows = [...(dep.data||[]).map(x=>({...x,kind:'deposit'})), ...(wd.data||[]).map(x=>({...x,kind:'withdrawal'}))].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  const playerIds=[...new Set(rows.map(x=>x.user_id).filter(Boolean))];
  const {data:playerAccounts,error:playerAccountsError}=playerIds.length?await supabase.from('player_accounts').select('user_id,player_number,username').in('user_id',playerIds):{data:[],error:null};
  if(playerAccountsError) console.warn('Could not load player IDs for admin payment requests',playerAccountsError);
  const playerMap=new Map((playerAccounts||[]).map(p=>[p.user_id,p]));
  target.innerHTML = rows.length ? rows.map(x => { const player=playerMap.get(x.user_id)||{}; return `<article class="panel" style="margin:12px 0;padding:14px"><div class="admin-section-title"><div><h3>${x.kind==='deposit'?'Deposit':'Withdrawal'} · ₹${Number(x.amount).toFixed(2)}</h3><p>${esc(x.status.toUpperCase())} · ${esc(new Date(x.created_at).toLocaleString())}</p></div></div><p><b>Request ID:</b> ${esc(x.id)}</p><p><b>Player ID:</b> ${esc(player.player_number||'Not assigned')} · <b>Username:</b> ${esc(player.username||'Not set')}</p><p><b>Auth User ID:</b> ${esc(x.user_id)}</p>${x.kind==='deposit'?`<p><b>Player UPI:</b> ${esc(x.payer_upi)}<br><b>Receiving UPI:</b> ${esc(x.receiver_upi||'kjaman@fam')}<br><b>Expires:</b> ${esc(new Date(x.expires_at).toLocaleString())}<br><b>Payment reference:</b> ${esc(x.payment_reference||'Not supplied')}</p>`:`<p><b>Account holder:</b> ${esc(x.account_name)}<br><b>Withdrawal UPI:</b> ${esc(x.payout_upi)}<br><b>Fee (2%):</b> ₹${Number(x.fee_amount).toFixed(2)}<br><b>Send to player:</b> ₹${Number(x.net_amount).toFixed(2)}<br><b>Payout reference:</b> ${esc(x.payout_reference||'Not sent')}</p>`}<p><b>Admin note:</b> ${esc(x.admin_note||'—')}</p>${(['pending','reported_paid'].includes(x.status)&&x.kind==='deposit')?`<label class="field">UPI transaction reference<input id="depRef-${esc(x.id)}" placeholder="Reference / UTR (optional)"></label><label class="field">Admin note<input id="depNote-${esc(x.id)}" placeholder="Optional note"></label><div class="wallet-actions"><button class="join" data-payment-action="verify-deposit" data-request-id="${esc(x.id)}">Verify & credit wallet</button><button class="outline" data-payment-action="reject-deposit" data-request-id="${esc(x.id)}">Reject</button></div>`:''}${x.kind==='withdrawal'&&['pending','approved'].includes(x.status)?`<label class="field">Payout UPI reference / UTR<input id="wdRef-${esc(x.id)}" placeholder="Required after you send payment"></label><label class="field">Admin note<input id="wdNote-${esc(x.id)}" placeholder="Optional note"></label><div class="wallet-actions"><button class="join" data-payment-action="paid-withdrawal" data-request-id="${esc(x.id)}">Mark paid</button><button class="outline" data-payment-action="reject-withdrawal" data-request-id="${esc(x.id)}">Reject & refund earned coins</button></div>`:''}<div class="wallet-actions"><button class="outline danger-button" data-delete-payment-kind="${x.kind}" data-request-id="${esc(x.id)}">Delete stuck request</button></div></article>`; }).join('') : '<div class="empty-state"><b>No payment requests</b><p>New requests will appear here.</p></div>';
}
async function handleAdminPaymentAction(button) {
  if (!isAdmin) return toast('Admin access required.');
  const id = button.dataset.requestId, action = button.dataset.paymentAction;
  if (!id || !action) return;
  const isDeposit = action.endsWith('deposit');
  let rpc, args;
  if (action==='verify-deposit' || action==='reject-deposit') {
    rpc='admin_process_deposit'; args={p_request_id:id,p_action:action==='verify-deposit'?'verify':'reject',p_payment_reference:$('#depRef-'+id)?.value.trim()||null,p_note:$('#depNote-'+id)?.value.trim()||null};
  } else {
    rpc='admin_process_withdrawal'; args={p_request_id:id,p_action:action==='paid-withdrawal'?'paid':'reject',p_payout_reference:$('#wdRef-'+id)?.value.trim()||null,p_note:$('#wdNote-'+id)?.value.trim()||null};
    if(action==='paid-withdrawal'&&!args.p_payout_reference) return toast('Enter the UPI transaction reference after sending the payout.');
  }
  const confirmation = action==='verify-deposit' ? 'Confirm you checked the actual bank/UPI transaction and want to credit this deposit?' : action==='paid-withdrawal' ? 'Confirm you have already sent the net payout to the player?' : 'Confirm this action?';
  if(!window.confirm(confirmation)) return;
  button.disabled=true;
  try {
    const {error}=await supabase.rpc(rpc,args);
    if(error){
      console.error('BattleForge payment action failed', {rpc,args,error});
      toast('Could not process request: '+(error.message||error.details||'Supabase error')+(error.code?' ('+error.code+')':''));
      return;
    }
    toast(action==='verify-deposit'?'Deposit verified; coins credited to deposited balance.':action==='reject-deposit'?'Deposit request rejected.':action==='paid-withdrawal'?'Withdrawal marked paid.':'Withdrawal rejected; earned coins returned.');
    await loadAdminPaymentRequests(); await loadPaymentRequests(); await loadWalletSummary();
  } catch (error) {
    console.error('BattleForge payment action threw an exception', error);
    toast('Payment action failed: '+(error?.message||'Unexpected error. Please reload and retry.'));
  } finally { button.disabled=false; }
}
async function loadWalletSummary() {
  if(!currentUser) return;
  const {data,error}=await supabase.rpc('get_wallet_summary');
  if(error){console.error('Wallet ledger unavailable',error); const total=$('#walletBalance'); if(total) total.textContent='—'; const old=$('#walletActivity'); if(old) old.innerHTML='<p class=\"notice\">Wallet ledger is unavailable. Please contact support; no demo balance is shown.</p>'; return;}
  const row=Array.isArray(data)?data[0]:data; if(!row)return;
  balance=Number(row.total_balance||0);
  const total=$('#walletBalance'); if(total) total.textContent=String(Number(row.total_balance||0));
  const old=$('#walletActivity'); if(old) { const {data:player}=await supabase.from('player_accounts').select('player_number').eq('user_id',currentUser.id).maybeSingle(); const playerNo=player?.player_number; const refLink=playerNo?window.location.origin+window.location.pathname+'?ref='+playerNo:''; old.insertAdjacentHTML('afterbegin',`<p class="notice"><b>Your BattleForge Player ID: ${esc(playerNo||'Loading')}</b><br>Share your referral link: friend’s first completed withdrawal earns you ₹5 in entry-fee-only credits.<br>${refLink?`<button type="button" class="outline" id="copyReferralLink">Copy referral link</button>`:''}<br>Entry-fee-only balance: ${Number(row.deposited_balance||0).toFixed(2)} · Match earnings: ${Number(row.earned_balance||0).toFixed(2)}. Only match earnings can be withdrawn.</p>`); $('#copyReferralLink')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(refLink);toast('Referral link copied!')}catch{toast(refLink)}}); }
}

function renderWallet() {
  const total = $('#walletBalance'); if (total) total.textContent = currentUser ? String(balance) : '—';
  const activity = $('#walletActivity'); if (!activity) return;
  activity.innerHTML = history.length ? history.slice().reverse().slice(0,5).map(item => '<div class="activity-row"><span class="activity-mark">◈</span><div><b>' + esc(item.title || item.type || 'Wallet activity') + '</b><small>' + esc(item.date || '') + '</small></div><strong>' + esc(item.amount ?? '') + ' pts</strong></div>').join('') : '<div class="empty-state"><span>◷</span><b>No wallet activity yet</b><p>Verified wallet activity will appear here when available.</p></div>' ;
}

async function render() {
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
  }).join('') : '<p class="notice">No tournaments are published yet.</p>';
  const profileBtn=$('#profileBtn'); if(profileBtn){ const {data:profileAvatar}=currentUser?await supabase.from('player_accounts').select('avatar_url,username').eq('user_id',currentUser.id).maybeSingle():{data:null}; const avatar=profileAvatar?.avatar_url||'assets/default-avatar.svg'; profileBtn.innerHTML=`<img class="header-avatar-image" src="${esc(avatar)}" alt="" onerror="this.onerror=null;this.src='assets/default-avatar.svg'"><span class="header-avatar-label">${currentUser?esc(profileAvatar?.username||'Profile'):'Sign in'}</span>`; profileBtn.setAttribute('aria-label',currentUser?'Player profile':'Sign in'); }
}

let usernameSetupOpen = false;
async function usernameIsAvailable(username) {
  const {data,error}=await supabase.from('player_accounts').select('user_id').ilike('username',username).limit(1);
  if(error) throw error;
  return !data?.some(row=>row.user_id!==currentUser?.id);
}
async function requireUsernameSetup() {
  if(!currentUser || usernameSetupOpen) return;
  const {data,error}=await supabase.from('player_accounts').select('username').eq('user_id',currentUser.id).maybeSingle();
  if(error){console.warn('Could not verify username setup',error);return;}
  if(data?.username && /^[A-Za-z0-9_]{3,24}$/.test(data.username)) return;
  usernameSetupOpen=true;
  modal(`<div class="username-onboarding"><div class="eyebrow">ONE LAST STEP</div><h2>Choose your BattleForge username</h2><p>You must set a unique username before using the app. This applies to Google and email accounts.</p><label class="field">USERNAME<input id="requiredUsername" type="text" minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" autocomplete="nickname" placeholder="YourUniqueName"></label><p class="profile-help">3–24 letters, numbers, or underscores. No spaces.</p><p id="requiredUsernameStatus" class="profile-help" aria-live="polite"></p><button id="saveRequiredUsername" class="join full">Save username & continue</button><button id="requiredUsernameLogout" class="outline full">Log out</button></div>`);
}
async function saveRequiredUsername() {
  const input=$('#requiredUsername'), status=$('#requiredUsernameStatus'), button=$('#saveRequiredUsername');
  const username=(input?.value||'').trim();
  if(!/^[A-Za-z0-9_]{3,24}$/.test(username)){if(status)status.textContent='Use 3–24 letters, numbers, or underscores.';return;}
  button.disabled=true; if(status)status.textContent='Checking availability…';
  try {
    if(!await usernameIsAvailable(username)){if(status)status.textContent='Username not available. Please choose another.';toast('Username not available.');return;}
    const {error}=await supabase.rpc('update_player_profile',{p_username:username,p_avatar_url:null});
    if(error){const msg=String(error.message||'');if(/duplicate|unique|username.*taken|already exists/i.test(msg)){if(status)status.textContent='Username not available. Please choose another.';toast('Username not available.');return;}throw error;}
    usernameSetupOpen=false;close();await refreshData();toast('Username saved. Welcome to BattleForge!');
  } catch(error){if(status)status.textContent=error?.message||'Could not save username.';toast(error?.message||'Could not save username.');}
  finally{if(button)button.disabled=false;}
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
  if(currentUser){ await requireUsernameSetup(); if(usernameSetupOpen) return; }
  const { data, error } = await supabase.from('tournaments')
    .select('id,title,description,game_mode,entry_points,per_kill_points,prize_pool_points,max_players,status,starts_at,is_past_match')
    .eq('is_past_match', false)
    .order('starts_at', { ascending: true, nullsFirst: false }).order('id');
  if (error) {
    toast('Could not load online tournaments. Check Supabase setup.');
    console.error(error);
    tournaments = [];
  } else tournaments = data ?? [];

  if (currentUser) {
    try {
      const { data: notices, error: noticeError } = await supabase.from('notification_broadcasts').select('id,title,message,created_at').order('created_at', { ascending: false });
      if (!noticeError && Array.isArray(notices)) {
        const prior = window.battleForgeBroadcasts || [];
        const priorIds = new Set(prior.map(n=>String(n.id)));
        window.battleForgeBroadcasts = notices;
        const seen = read('bf_notifications_seen_ids',[]).map(String);
        const newest = notices.find(n=>!priorIds.has(String(n.id)) && !seen.includes(String(n.id)));
        // Seen IDs are persisted locally, so read announcements never retrigger the alert on refresh.
        if (newest && prior.length) toast('📣 ' + newest.title);
        updateNotificationBadge();
      }
    } catch (noticeError) { console.warn('Could not load announcements', noticeError); }
  }

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
  if (currentUser) await loadWalletSummary();
}
function showAuth() {
  const referralFromLink = new URLSearchParams(window.location.search).get('ref') || '';
  modal('<h2>Log in to BattleForge</h2><p>New players must choose a unique username. Referral code is optional and can be skipped.</p><button id="googleSignInBtn" class="join full google-sign-in"><span aria-hidden="true">G</span> Continue with Google</button><div class="auth-divider"><span>OR USE EMAIL</span></div><label class="field">USERNAME (REQUIRED)<input id="signupUsername" type="text" minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" autocomplete="nickname" placeholder="Letters, numbers, underscores"></label><p class="profile-help">3–24 characters. Only letters, numbers, and underscores. Must be unique.</p><label class="field">EMAIL<input id="authEmail" type="email" autocomplete="email" placeholder="you@example.com"></label><label class="field">PASSWORD<input id="authPassword" type="password" autocomplete="new-password" minlength="8" placeholder="At least 8 characters"></label><label class="field">REFERRAL CODE / PLAYER ID (OPTIONAL)<input id="referralPlayerNumber" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="Enter referral code or skip" value="' + esc(referralFromLink) + '"></label><button id="signInBtn" class="join full">Log in with email</button><button id="signUpBtn" class="outline full">Create account with email</button><p class="notice">Email confirmation may be required. Never share your password or OTP.</p>');
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
    await refreshData();
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
  const username = ($('#signupUsername')?.value || '').trim();
  if (!email || !password || password.length < 8) { toast('Enter a valid email and password (8+ characters).'); return; }
  if (kind === 'signup' && !/^[A-Za-z0-9_]{3,24}$/.test(username)) { toast('Choose a username of 3–24 letters, numbers, or underscores.'); return; }
  const btn = kind === 'signin' ? $('#signInBtn') : $('#signUpBtn');
  if (btn) btn.disabled = true;
  const result = kind === 'signin'
    ? await supabase.auth.signInWithPassword({ email, password })
    : await supabase.auth.signUp({ email, password, options: { data: { username, referral_player_number: ($('#referralPlayerNumber')?.value || new URLSearchParams(window.location.search).get('ref') || '').trim() || null } } });
  if (btn) btn.disabled = false;
  if (result.error) { const msg=String(result.error.message||''); toast(kind==='signup' && /duplicate|unique|username.*taken|already exists/i.test(msg) ? 'Username not available. Please choose another.' : result.error.message); return; }
  if (kind === 'signup' && !result.data.session) {
    modal('<h2>Check your email</h2><p>Supabase may require email confirmation. Open the confirmation email, then return and sign in.</p><button id="backToSignIn" class="join full">Back to sign in</button>');
    return;
  }
  close();
  await refreshData();
  toast(kind === 'signin' ? 'Signed in successfully.' : 'BattleForge account created.');
}
async function showProfile() {
  if (!currentUser) { showAuth(); return; }
  const [{ data: account, error: accountError }, { data: wallet, error: walletError }, { data: ledger }, { data: paidWithdrawals }, { data: depositHistory }, { data: referralStatsResult }, { data: myResults }] = await Promise.all([
    supabase.from('player_accounts').select('player_number,username,avatar_url,username_change_count,created_at').eq('user_id', currentUser.id).maybeSingle(),
    supabase.from('wallet_accounts').select('deposited_balance,earned_balance').eq('user_id', currentUser.id).maybeSingle(),
    supabase.from('wallet_ledger').select('entry_type,amount,note,created_at').eq('user_id', currentUser.id).order('created_at', {ascending:false}),
    supabase.from('withdrawal_requests').select('id,amount,fee_amount,net_amount,status,created_at').eq('user_id', currentUser.id).order('created_at',{ascending:false}),
    supabase.from('deposit_requests').select('id,amount,status,created_at,payment_reference').eq('user_id',currentUser.id).order('created_at',{ascending:false}),
    supabase.rpc('get_my_referral_stats'),
    supabase.from('tournament_results').select('tournament_id,placement,kills,note,earned_points,created_at').eq('user_id',currentUser.id).eq('published',true).order('created_at',{ascending:false})
  ]);
  if (accountError || walletError) console.warn('Profile load issue',accountError||walletError);
  const a=account||{}, w=wallet||{}, notices=window.battleForgeBroadcasts||[];
  const referralLink=a.player_number?window.location.origin+window.location.pathname+'?ref='+a.player_number:'';
  const referralStats=referralStatsResult||{}; const totalReferrals=Number(referralStats.invited_count||0), rewarded=Number(referralStats.rewarded_count||0);
  const resultRows=myResults||[], wins=resultRows.filter(x=>Number(x.placement)===1).length, kills=resultRows.reduce((n,x)=>n+Number(x.kills||0),0);
  const led=ledger||[], withdrawals=paidWithdrawals||[];
  modal(`<div class="profile-sheet"><div class="profile-top"><img id="profileAvatarPreview" class="profile-photo" src="${esc(a.avatar_url||'')}" alt="Profile photo" onerror="this.style.display='none'"><div><div class="eyebrow">PLAYER PROFILE</div><h2>${esc(a.username||currentUser.user_metadata?.full_name||'Player')}</h2><p>Player ID <b>${esc(a.player_number||'Loading')}</b></p></div></div>
  <div class="profile-metrics"><div><small>TOTAL BALANCE</small><b>₹${(Number(w.deposited_balance||0)+Number(w.earned_balance||0)).toFixed(2)}</b></div><div><small>ENTRY-FEE CREDITS</small><b>₹${Number(w.deposited_balance||0).toFixed(2)}</b></div><div><small>MATCH EARNINGS</small><b>₹${Number(w.earned_balance||0).toFixed(2)}</b></div><div><small>MATCH RESULTS</small><b>${resultRows.length}</b></div><div><small>WINS / KILLS</small><b>${wins} / ${kills}</b></div><div><small>WITHDRAWALS</small><b>${withdrawals.length}</b></div></div>
  <details class="profile-block profile-accordion" open><summary>Edit profile</summary><label class="field">USERNAME (LETTERS, NUMBERS, UNDERSCORES)<input id="profileUsername" maxlength="24" minlength="3" pattern="[A-Za-z0-9_]{3,24}" value="${esc(a.username||'')}" placeholder="ChooseUniqueName" autocomplete="nickname"></label><p class="profile-help">${Number(a.username_change_count||0)===0?'Your first username change is free.':'Each additional username change costs ₹5 from entry-fee-only credits.'} Only letters, numbers, and underscores; no spaces or other special characters.</p><label class="field">PROFILE PHOTO<input id="profilePhotoFile" type="file" accept="image/png,image/jpeg,image/webp"></label><button id="savePlayerProfile" class="join full">Save profile</button><p id="profileSaveStatus" class="profile-help"></p></section>
  </details><details class="profile-block profile-accordion"><summary>Referral centre</summary><p>Your code: <b>${esc(a.player_number||'—')}</b></p><label class="field">YOUR REFERRAL LINK<input id="profileReferralLink" readonly value="${esc(referralLink)}"></label><button id="copyProfileReferral" class="outline full">Copy referral link</button><div class="profile-metrics"><div><small>INVITED PLAYERS</small><b>${totalReferrals}</b></div><div><small>REWARDS EARNED</small><b>${rewarded} · ₹${(rewarded*5).toFixed(2)}</b></div><div><small>WAITING FOR FIRST PAID WITHDRAWAL</small><b>${totalReferrals-rewarded}</b></div></div><p class="profile-help">₹5 referral rewards are credited as non-withdrawable entry-fee balance after a referred player completes their first withdrawal.</p></section>
  </details><details class="profile-block profile-accordion"><summary>Full activity history</summary><div class="profile-history">${led.length?led.map(x=>`<div class="profile-history-row"><div><b>${esc(x.entry_type||'Wallet activity')}</b><small>${esc(new Date(x.created_at).toLocaleString())}${x.note?' · '+esc(x.note):''}</small></div><b>₹${Number(x.amount||0).toFixed(2)}</b></div>`).join(''):'<p class="profile-help">No wallet activity recorded yet.</p>'}</div></section>
  </details><details class="profile-block profile-accordion"><summary>Deposit history</summary><div class="profile-history">${(depositHistory||[]).length?(depositHistory||[]).map(x=>`<div class="profile-history-row"><div><b>${esc(String(x.status||'pending').toUpperCase())}</b><small>${esc(new Date(x.created_at).toLocaleString())}${x.payment_reference?' · Ref '+esc(x.payment_reference):''}</small></div><b>₹${Number(x.amount||0).toFixed(2)}</b></div>`).join(''):'<p class="profile-help">No deposit requests yet.</p>'}</div></section>
  </details><details class="profile-block profile-accordion"><summary>Withdrawal history</summary><div class="profile-history">${withdrawals.length?withdrawals.map(x=>`<div class="profile-history-row"><div><b>${esc(String(x.status||'pending').toUpperCase())}</b><small>${esc(new Date(x.created_at).toLocaleString())} · Fee ₹${Number(x.fee_amount||0).toFixed(2)}</small></div><b>₹${Number(x.net_amount??x.amount??0).toFixed(2)}</b></div>`).join(''):'<p class="profile-help">No withdrawal requests yet.</p>'}</div></section>
  </details><details class="profile-block profile-accordion"><summary>Match results history</summary><div class="profile-history">${resultRows.length?resultRows.map(x=>`<div class="profile-history-row"><div><b>${x.placement?'Place #'+Number(x.placement):'Result published'} · ${Number(x.kills||0)} kills</b><small>${esc(new Date(x.created_at).toLocaleString())}${x.note?' · '+esc(x.note):''}</small></div></div>`).join(''):'<p class="profile-help">No published results yet. Your tournament registrations are available under History.</p>'}</div></details><details class="profile-block profile-accordion"><summary>Rules, wallet & support</summary><div class="profile-rules"><p><b>01 · Correct IGN:</b> register with the exact Free Fire in-game name you will use in the match.</p><p><b>02 · Respect timing:</b> join the published room on time and follow organiser lobby instructions.</p><p><b>03 · Fair play only:</b> no hacks, cheats, exploits, teaming outside the selected format, harassment, or deliberate match disruption.</p><p><b>04 · Protect your account:</b> never share passwords, login codes, or OTPs. BattleForge will not ask for them.</p><p><b>05 · Read match notes:</b> each tournament can have its own map, schedule, scoring, lobby, and disqualification rules.</p><p><b>06 · Results & disputes:</b> follow organiser instructions for screenshots, score reporting, and result review; organiser decisions are final.</p><p><b>Wallet & withdrawals:</b> registrations and results are managed online. Wallet funds are credited after verification; deposits and withdrawals are manually reviewed. Withdrawal fee is 2%, so check the net payout before confirming.</p><a class="support-cta" href="https://t.me/battleforgeff" target="_blank" rel="noopener noreferrer"><span>✦</span><div><b>BattleForge support</b><small>Get help on Telegram</small></div><span>↗</span></a></div></details>
  <button id="signOutBtn" class="outline full">Log out</button><button id="switchAccountBtn" class="outline full">Switch account</button></div>`);
  $('#copyProfileReferral')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(referralLink);toast('Referral link copied!')}catch{toast(referralLink)}});
  $('#savePlayerProfile')?.addEventListener('click',savePlayerProfile);
}
async function savePlayerProfile() {
  const button=$('#savePlayerProfile'), status=$('#profileSaveStatus');
  const username=($('#profileUsername')?.value||'').trim(); const file=$('#profilePhotoFile')?.files?.[0];
  if(!/^[A-Za-z0-9_]{3,24}$/.test(username)){toast('Username must be 3–24 letters, numbers, or underscores only.');return;}
  button.disabled=true; button.textContent='Saving…';
  try {
    let avatarUrl;
    if(file){
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>3*1024*1024) throw new Error('Choose a JPG, PNG, or WebP image up to 3 MB.');
      const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
      const path=currentUser.id+'/'+Date.now()+'.'+ext;
      const {error:uploadError}=await supabase.storage.from('player-avatars').upload(path,file,{upsert:true,contentType:file.type}); if(uploadError) throw uploadError;
      const {data:urlData}=supabase.storage.from('player-avatars').getPublicUrl(path); avatarUrl=urlData.publicUrl;
    }
    if(!await usernameIsAvailable(username)){const msg='Username not available. Please choose another.';if(status)status.textContent=msg;toast(msg);return;}
    const {error}=await supabase.rpc('update_player_profile',{p_username:username,p_avatar_url:avatarUrl||null});
    if(error){if(/duplicate|unique|username.*taken|already exists/i.test(String(error.message||'')))throw new Error('Username not available. Please choose another.');throw error;}
    if(status) status.textContent='Profile saved.'; toast('Profile updated!'); await refreshData(); await showProfile();
  } catch(error){console.error('Profile update failed',error);toast(error?.message||'Could not save profile.');if(status)status.textContent=error?.message||'Could not save profile.';}
  finally{if(button){button.disabled=false;button.textContent='Save profile';}}
}
function showNotifications() {
  const items=window.battleForgeBroadcasts||[];
  const seen=read('bf_notifications_seen_ids',[]); const ids=Array.isArray(seen)?seen.map(String):[];
  modal(`<div class="notification-sheet"><div class="eyebrow">BATTLEFORGE UPDATES</div><h2>Notifications</h2><p class="profile-help">Announcements from the BattleForge admins.</p>${items.length?items.map(n=>`<article class="notification-card ${ids.includes(String(n.id))?'':'unread'}"><div class="notification-card-top"><b>${esc(n.title)}</b><small>${esc(new Date(n.created_at).toLocaleString())}</small></div><p>${esc(n.message)}</p></article>`).join(''):'<div class="empty-state"><span>♢</span><h3>You’re all caught up</h3><p>Admin announcements will appear here.</p></div>'}<button id="markNotificationsRead" class="join full">Mark all as read</button></div>`);
  $('#markNotificationsRead')?.addEventListener('click',()=>{localStorage.setItem('bf_notifications_seen_ids',JSON.stringify(items.map(n=>String(n.id))));updateNotificationBadge();close();toast('Notifications marked as read.');});
}
function updateNotificationBadge(){const items=window.battleForgeBroadcasts||[];const seen=read('bf_notifications_seen_ids',[]);const unread=items.filter(n=>!seen.map(String).includes(String(n.id))).length;const badge=$('#notificationBadge');if(badge){badge.textContent=unread>99?'99+':String(unread);badge.classList.toggle('hidden',unread===0);}}
async function loadLeaderboard(period = leaderboardPeriod) {
  leaderboardPeriod = period; const target = $('#leaderboardContent'); if (!target) return; target.innerHTML = '<p class="notice">Loading leaderboard…</p>';
  document.querySelectorAll('[data-lb-period]').forEach(b => { const active = b.dataset.lbPeriod === period; b.classList.toggle('join', active); b.classList.toggle('outline', !active); });
  const { data, error } = await supabase.rpc('get_earnings_leaderboard', { p_period: period });
  if (error) { console.warn('Leaderboard unavailable', error); target.innerHTML = '<p class="notice">Leaderboard is not available yet. Please try again later.</p>'; return; }
  const rows = Array.isArray(data) ? data : [];
  target.innerHTML = rows.length ? rows.map((r,i) => `<article class="leader-row"><span class="leader-rank">${i===0?'👑':String(i+1).padStart(2,'0')}</span><div class="leader-player"><b>${esc(r.username || ('Player '+(r.player_number || '')))}</b><small>${period==='all'?'ALL-TIME':period==='month'?'THIS MONTH':'TODAY'}</small></div><strong>₹${Number(r.total_earned||0).toLocaleString('en-IN',{maximumFractionDigits:2})}</strong></article>`).join('') : '<div class="empty-state"><span>🏆</span><b>No verified earnings yet</b><p>Published match rewards will appear here.</p></div>';
}

async function showHistory() {
  const target = $('#historyContent'); if (!target) return;
  if (!currentUser) { target.innerHTML='<div class="empty-state"><span>◷</span><h3>Past matches</h3><p>Sign in to view match archives and results.</p><button id="historySignIn" class="join">Sign in</button></div>'; return; }
  target.innerHTML='<p class="notice">Loading past matches…</p>';
  const {data: matches, error}=await supabase.from('tournaments').select('id,title,game_mode,starts_at,created_at,description,is_past_match').eq('is_past_match',true).order('starts_at',{ascending:false,nullsFirst:false}).order('created_at',{ascending:false});
  if(error){target.innerHTML='<p class="notice">Past Matches needs the latest BattleForge database migration. Please try again after it is applied.</p>';return;}
  if(!matches?.length){target.innerHTML='<div class="empty-state"><span>🏆</span><h3>No past matches yet</h3><p>Matches will appear here when an admin moves them to Past Matches.</p></div>';return;}
  const {data: publishedResults}=await supabase.from('tournament_results').select('tournament_id,placement,kills,note,earned_points,created_at').eq('user_id',currentUser.id).eq('published',true);
  const mine=publishedResults||[];
  target.innerHTML=matches.map(t=>{const r=mine.find(x=>String(x.tournament_id)===String(t.id));return `<button type="button" class="history-card past-match-card" data-past-match="${esc(t.id)}"><div class="history-card-top"><span class="history-symbol">✦</span><span class="status-chip">${r?'RESULTS PUBLISHED':'PENDING RESULTS'}</span></div><h3>${esc(t.title)}</h3><p class="history-meta">${esc(t.game_mode||'MATCH')} · ${esc(t.starts_at?new Date(t.starts_at).toLocaleString():'Date not set')}</p><div class="result-banner"><small>${r?'YOUR RESULT':'RESULT STATUS'}</small><b>${r?((r.placement?'Rank #'+Number(r.placement)+' · ':'')+Number(r.kills||0)+' kills · '+Number(r.earned_points||0)+' points earned'):'Pending Results'}</b><p>Tap to view match details ↗</p></div></button>`}).join('');
}

async function openPastMatchDetails(id) {
  if(!currentUser) return showAuth();
  const {data:t,error}=await supabase.from('tournaments').select('id,title,game_mode,starts_at,description,is_past_match').eq('id',Number(id)).eq('is_past_match',true).maybeSingle();
  if(error||!t){toast('Could not load this past match.');return;}
  const {data:results}=await supabase.from('tournament_results').select('user_id,placement,kills,note,earned_points,published,created_at').eq('tournament_id',Number(id)).eq('published',true).order('placement',{ascending:true,nullsFirst:false});
  const rows=results||[];
  const {data:profiles}=rows.length?await supabase.from('profiles').select('id,display_name').in('id',rows.map(r=>r.user_id)): {data:[]};
  const names=Object.fromEntries((profiles||[]).map(p=>[p.id,p.display_name]));
  const mine=rows.find(r=>r.user_id===currentUser.id);
  modal(`<div class="match-detail-sheet"><div class="eyebrow">PAST MATCH DETAILS</div><h2>${esc(t.title)}</h2><p>${esc(t.game_mode||'MATCH')} · ${esc(t.starts_at?new Date(t.starts_at).toLocaleString():'Date not set')}</p>${rows.length?`<div class="result-banner"><small>YOUR PERFORMANCE</small><b>${mine?((mine.placement?'Rank #'+Number(mine.placement)+' · ':'')+Number(mine.kills||0)+' kills'):'No published result for your account'}</b>${mine?.note?`<p>${esc(mine.note)}</p>`:''}</div><h3>Final rankings</h3><div class="past-results-table">${rows.map((r,i)=>`<div class="profile-history-row"><div><b>#${r.placement||'—'} · ${esc(names[r.user_id]||'Player')}</b><small>${Number(r.kills||0)} kills · ${Number(r.earned_points||0)} points earned${r.note?' · '+esc(r.note):''}</small></div>${r.user_id===currentUser.id?'<b>YOU</b>':''}</div>`).join('')}</div>`:'<div class="result-banner"><small>RESULT STATUS</small><b>Pending Results</b><p>The admin has not published the final rankings yet. Check back later.</p></div>'}<button class="outline full" id="pastMatchClose">Close</button></div>`);
  $('#pastMatchClose')?.addEventListener('click',close);
}

async function loadAdminRoom() {
  if (!isAdmin) return;
  const id = Number($('#adminRoomTournament')?.value || $('#adminTournament')?.value);
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
  const { data: adminTournamentRows, error: adminTournamentError } = await supabase.from('tournaments').select('id,title,game_mode,status,is_past_match,starts_at').order('id', { ascending: false });
  const adminAllTournaments = adminTournamentError ? tournaments : (adminTournamentRows || []);
  const options = adminAllTournaments.map(t => `<option value="${esc(t.id)}">${esc(t.title)} (${esc(t.game_mode || 'Match')})${t.is_past_match ? ' · Past' : ''}</option>`).join('');
  const openCount = tournaments.filter(t => t.status === 'open').length;
  const closedCount = tournaments.filter(t => t.status === 'closed' || t.status === 'full').length;
  const playerTotal = Object.values(counts).reduce((sum, n) => sum + Number(n || 0), 0);
  modal(`<div class="admin-dashboard-head"><div class="eyebrow"><span class="live-dot"></span> ORGANISER CONTROL CENTRE</div><h2>Admin dashboard</h2><p>Everything you need to run a match, from one place.</p><div class="admin-section" data-admin-page="players" id="adminPlayerManager"><div class="admin-section-title"><div><h3>Player account manager</h3><p>Search by numeric Player ID, inspect full histories, and adjust balances.</p></div></div><label class="field">PLAYER ID<input id="adminPlayerNumber" type="number" min="1" step="1" placeholder="100001"></label><button id="adminFindPlayer" class="join full">Find player & load full history</button><div id="adminPlayerDetails"></div><div class="admin-form-grid"><label class="field">BALANCE TYPE<select id="adminBalanceBucket"><option value="deposited">Entry-fee-only balance</option><option value="earned">Withdrawable match earnings</option></select></label><label class="field">AMOUNT (+ add / − deduct)<input id="adminBalanceAmount" type="number" step="0.01" placeholder="50 or -20"></label></div><label class="field">REASON / AUDIT NOTE<input id="adminBalanceNote" maxlength="300" placeholder="Correction reason"></label><button id="adminAdjustBalance" class="join full">Apply balance adjustment</button></div><p></p></div>
    <div class="admin-metrics"><div><small>TOURNAMENTS</small><b>${tournaments.length}</b></div><div><small>OPEN</small><b>${openCount}</b></div><div><small>REGISTRATIONS</small><b>${playerTotal}</b></div><div><small>CLOSED / FULL</small><b>${closedCount}</b></div></div>
    <div class="admin-section" data-admin-page="payments"><div class="admin-section-title"><span>₹</span><div><h3>Payments & withdrawals</h3><p>Review full request details, verify UPI deposits, credit deposited coins, and mark manually sent withdrawals as paid.</p></div></div><button id="adminLoadPayments" class="join full">Open payment request queue</button><div id="adminPaymentRequests"></div></div><div class="admin-quick-grid admin-home-menu"><button class="admin-quick" data-admin-page-open="create"><span>＋</span><b>Create match</b><small>New tournament setup</small></button><button class="admin-quick" data-admin-page-open="manage"><span>⚙</span><b>Manage matches</b><small>Edit status and rewards</small></button><button class="admin-quick" data-admin-page-open="players"><span>♙</span><b>Search players</b><small>Player lookup & results</small></button><button class="admin-quick" data-admin-page-open="results"><span>🏆</span><b>Match rankings</b><small>Drag ranks, edit kills & prizes</small></button><button class="admin-quick" data-admin-page-open="payments"><span>₹</span><b>Payments</b><small>Deposits & withdrawals</small></button><button class="admin-quick" data-admin-page-open="room"><span>🎮</span><b>Room & lobby</b><small>Room ID and password</small></button><button class="admin-quick" data-admin-page-open="notifications"><span>✉</span><b>Announcements</b><small>Send or delete broadcasts</small></button></div><div class="admin-page-back hidden" id="adminPageBack"><button class="outline" id="adminBackHome">← All admin options</button><span id="adminPageTitle">Admin section</span></div><div class="admin-legacy-quick hidden"><button class="admin-quick" data-admin-jump="adminCreateSection"><span>＋</span><b>Create match</b><small>Set mode, slots & rules</small></button><button class="admin-quick" data-admin-jump="adminManageSection"><span>⚙</span><b>Manage match</b><small>Status, room & description</small></button><button class="admin-quick" data-admin-jump="adminPlayersSection"><span>♙</span><b>Players & results</b><small>Review entries and kills</small></button></div></div>
    <div class="admin-section" data-admin-page="notifications" id="adminBroadcastSection"><div class="admin-section-title"><span>✉</span><div><h3>Notify all users</h3><p>Send a custom announcement to the BattleForge notification feed.</p></div></div><label class="field">NOTIFICATION TITLE<input id="adminBroadcastTitle" maxlength="80" placeholder="Tournament update"></label><label class="field">MESSAGE<textarea id="adminBroadcastMessage" maxlength="1000" rows="4" placeholder="Write your announcement for all players…"></textarea></label><button id="adminSendBroadcast" class="join full">Send to all users</button><div id="adminBroadcastStatus" class="admin-helper" aria-live="polite"></div></div><div class="admin-section-title" data-admin-page="notifications"><div><h3>Manage sent notifications</h3><p>Remove an outdated announcement from every user’s feed.</p></div></div><button id="adminLoadBroadcasts" data-admin-page="notifications" class="outline full">Load sent notifications</button><div id="adminBroadcastList" data-admin-page="notifications"></div>
    <div id="adminCreateSection" data-admin-page="create" class="admin-section"><div class="admin-section-title"><span>01</span><div><h3>Create tournament</h3><p>Set the match details players will see.</p></div></div>
    <label class="field">TOURNAMENT TITLE<input id="adminTitle" maxlength="80" placeholder="Weekend Solo Cup"></label>
    <div class="admin-form-grid"><label class="field">GAME MODE<select id="adminMode"><option>SOLO</option><option>DUO</option><option>SQUAD</option></select></label><label class="field">MAX PLAYERS<input id="adminMax" type="number" min="1" max="500" value="48"></label></div>
    <div class="admin-form-grid"><label class="field">ENTRY FEE (PTS)<input id="adminEntry" type="number" min="0" value="0"></label><label class="field">PER-KILL REWARD (PTS)<input id="adminPerKill" type="number" min="0" value="0"></label><label class="field">DISPLAYED PRIZE POOL (PTS)<input id="adminPrize" type="number" min="0" value="0"></label></div>
    <label class="field">START TIME (OPTIONAL)<input id="adminStarts" type="datetime-local"></label>
    <label class="field">MATCH DESCRIPTION & RULES<textarea id="adminDescription" maxlength="5000" rows="5" placeholder="Paste room instructions, start time, scoring, screenshot proof, and disqualification rules…"></textarea></label>
    <p class="admin-helper">Tip: include the exact start time, room release time, kill scoring, late-entry policy, and what proof players must submit.</p>
    <button id="adminCreateTournament" class="join full">＋ Create tournament</button></div>
    <div id="adminManageSection" data-admin-page="manage" class="admin-section"><div class="admin-section-title"><span>02</span><div><h3>Manage tournament</h3><p>Select a match first, then edit its settings.</p></div></div>
    <label class="field">SELECT TOURNAMENT<select id="adminTournament">${options || '<option value="">Create a tournament first</option>'}</select></label>
    <button id="adminMarkPastMatch" class="outline full">Move selected match to Past Matches</button><p class="admin-helper">This works even with just one registered player. Players will see Pending Results until you publish the rankings.</p>
    <div class="admin-current-summary" id="adminSelectedSummary">${tournaments.length ? 'Select a tournament to load its current settings.' : 'No tournaments yet.'}</div>
    <div class="admin-form-grid"><label class="field">ENTRY FEE (PTS)<input id="adminEditEntry" type="number" min="0" max="1000000"></label><label class="field">PER-KILL REWARD (PTS)<input id="adminEditPerKill" type="number" min="0" max="1000000"></label></div><button id="adminSaveRewards" class="join full">Save entry fee & per-kill reward</button>
    <label class="field">MATCH DESCRIPTION & RULES<textarea id="adminEditDescription" maxlength="5000" rows="5" placeholder="Player-facing rules and match instructions"></textarea></label>
    <button id="adminSaveDescription" class="outline full">Save description</button>
    <div class="admin-form-grid"><label class="field">ENTRY STATUS<select id="adminStatus"><option value="open">Open entries</option><option value="closed">Close entries</option><option value="full">Mark full</option></select></label><div class="field"><span>DESTRUCTIVE ACTION</span><button id="adminDeleteTournament" class="outline full danger-button">Delete tournament</button></div></div>
    <button id="adminSetStatus" class="join full secondary-action">Save entry status</button></div>
    <div class="admin-section" data-admin-page="room"><div class="admin-section-title"><span>03</span><div><h3>Room & lobby</h3><p>Only publish these details when you are ready.</p></div></div>
    <label class="field">SELECT MATCH FOR ROOM DETAILS<select id="adminRoomTournament">${options || '<option value="">Create a tournament first</option>'}</select></label><p class="admin-helper">Choose the exact match these room credentials belong to. Only players registered for this match will see them.</p>
    <label class="field">ROOM ID<input id="adminRoomId" maxlength="80" placeholder="Enter room ID"></label><label class="field">ROOM PASSWORD<input id="adminRoomPassword" maxlength="80" placeholder="Enter room password"></label>
    <label class="admin-check"><input id="adminRoomPublished" type="checkbox"><span><b>Publish room to registered players</b><small>Players will see room details and the eligible roster.</small></span></label>
    <button id="adminSaveRoom" class="join full">Save room settings</button></div>
    <div id="adminPlayersSection" data-admin-page="players" class="admin-section"><div class="admin-section-title"><span>04</span><div><h3>Search players</h3><p>Find a player account by Player ID and manage their account.</p></div></div><button id="adminLoadEntries" class="outline full">Load player search</button><div id="adminEntries" class="admin-entries"></div></div>
    <div id="adminResultsSection" data-admin-page="results" class="admin-section"><div class="admin-section-title"><span>🏆</span><div><h3>Match rankings</h3><p>All registered players appear automatically. Drag to rank, enter kills and total prize, then publish rewards. You can edit results later.</p></div></div><label class="field">SELECT MATCH<select id="adminResultsTournament"><option value="">Choose a match…</option>${options}</select></label><button id="adminLoadResultsRoster" class="join full">Load registered players</button><div id="adminResultsRoster"><p class="admin-helper">Choose a match above, then load the registered players.</p></div></div>
    <div class="admin-footer-note"><span>ⓘ</span><p>Deleting permanently removes the tournament, registrations, room and results. Confirmed results are visible to players and credit the entered reward to their earned wallet.</p></div>`);
  $('#adminSendBroadcast')?.addEventListener('click', sendAdminBroadcast);
  $('#adminLoadBroadcasts')?.addEventListener('click', loadAdminBroadcasts);
  $('#adminTournament')?.addEventListener('change', async () => { await loadAdminRoom(); syncAdminSelectedSummary(); });
  $('#adminResultsTournament')?.addEventListener('change', loadAdminEntries);
  $('#adminLoadResultsRoster')?.addEventListener('click', loadAdminEntries);
  $('#adminLoadEntries')?.addEventListener('click', () => openAdminPage('players'));
  $('#adminRoomTournament')?.addEventListener('change', loadAdminRoom);
  const adminPages={home:null,create:'Create match',manage:'Manage matches',players:'Search players',results:'Match rankings',payments:'Payments & withdrawals',room:'Room & lobby',notifications:'Announcements'};
  const openAdminPage=(page)=>{document.querySelectorAll('[data-admin-page]').forEach(el=>el.classList.toggle('hidden',el.dataset.adminPage!==page));document.querySelectorAll('.admin-home-menu').forEach(el=>el.classList.toggle('hidden',page!=='home'));$('#adminPageBack')?.classList.toggle('hidden',page==='home');if($('#adminPageTitle'))$('#adminPageTitle').textContent=adminPages[page]||'Admin section';};
  document.querySelectorAll('[data-admin-page-open]').forEach(button=>button.addEventListener('click',()=>openAdminPage(button.dataset.adminPageOpen)));
  $('#adminBackHome')?.addEventListener('click',()=>openAdminPage('home'));
  document.querySelectorAll('[data-admin-jump]').forEach(button=>button.addEventListener('click',()=>{const map={adminCreateSection:'create',adminManageSection:'manage',adminPlayersSection:'players'};openAdminPage(map[button.dataset.adminJump]||'home');document.getElementById(button.dataset.adminJump)?.scrollIntoView({behavior:'smooth',block:'start'});}));
  const roomSelect = $('#adminRoomTournament');
  if (roomSelect) roomSelect.value = $('#adminTournament')?.value || roomSelect.value;
  openAdminPage('home');
  await loadAdminRoom(); syncAdminSelectedSummary();
}

async function loadAdminBroadcasts() {
  if (!isAdmin) return; const box = $('#adminBroadcastList'); if (!box) return; box.innerHTML = '<p class="admin-helper">Loading…</p>';
  const {data,error}=await supabase.from('notification_broadcasts').select('id,title,message,created_at').order('created_at',{ascending:false}).limit(20);
  if(error){box.innerHTML='<p class="notice">Could not load notifications. Apply the latest database migration.</p>';return;}
  box.innerHTML=(data||[]).map(n=>`<article class="notification-card"><div class="notification-card-top"><b>${esc(n.title)}</b><small>${esc(new Date(n.created_at).toLocaleString())}</small></div><p>${esc(n.message)}</p><button class="outline danger-button" data-delete-broadcast="${esc(n.id)}">Delete notification</button></article>`).join('')||'<p class="admin-helper">No sent notifications.</p>';
}
async function deleteAdminBroadcast(id) {
  if(!isAdmin || !window.confirm('Delete this announcement from every user’s notification feed?')) return;
  const {error}=await supabase.rpc('admin_delete_broadcast_notification',{p_notification_id:Number(id)});
  if(error){console.error('Broadcast deletion failed:',error);const msg=String(error.message||'');toast(/function .*admin_delete_broadcast_notification.*does not exist|could not find the function|schema cache/i.test(msg)?'Database migration missing. Apply 202610240001_leaderboard_notification_controls.sql in Supabase.':'Could not delete notification: '+msg);return;}
  window.battleForgeBroadcasts=(window.battleForgeBroadcasts||[]).filter(n=>String(n.id)!==String(id)); updateNotificationBadge(); await loadAdminBroadcasts(); toast('Notification deleted.');
}

async function sendAdminBroadcast() {
  if (!currentUser || !isAdmin) { toast('Admin access required.'); return; }
  const title = ($('#adminBroadcastTitle')?.value || '').trim();
  const message = ($('#adminBroadcastMessage')?.value || '').trim();
  const status = $('#adminBroadcastStatus');
  const button = $('#adminSendBroadcast');
  if (!title || !message) { toast('Enter a title and message first.'); return; }
  if (!window.confirm('Send this announcement to every BattleForge user?')) return;
  button.disabled = true; button.textContent = 'Sending…';
  try {
    const { data, error } = await supabase.rpc('admin_broadcast_notification', { p_title: title, p_message: message });
    if (error) throw error;
    $('#adminBroadcastTitle').value = ''; $('#adminBroadcastMessage').value = '';
    if (status) status.textContent = 'Announcement published to all users.';
    toast('Announcement sent to all users.');
  } catch (error) {
    console.error('Broadcast failed', error);
    if (status) status.textContent = 'Could not send: ' + (error?.message || 'check notification migration');
    toast('Announcement failed. Check the notification setup.');
  } finally { button.disabled = false; button.textContent = 'Send to all users'; }
}

function syncAdminSelectedSummary() {
  const id = Number($('#adminTournament')?.value);
  const t = tournaments.find(item => Number(item.id) === id);
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
  const selector = $('#adminResultsTournament') || $('#adminTournament');
  const id = Number(selector?.value);
  if (!id) { toast('Choose a match to rank first.'); return; }
  const list = $('#adminResultsRoster') || $('#adminEntries');
  if (!list) return;
  list.innerHTML = '<p class="admin-helper">Loading registered players and saved results…</p>';
  const [{ data: entries, error }, { data: saved, error: savedError }] = await Promise.all([
    supabase.rpc('admin_list_tournament_entries', { p_tournament_id: id }),
    supabase.from('tournament_results').select('entry_id,placement,kills,earned_points,published').eq('tournament_id', id)
  ]);
  if (error) { list.innerHTML = `<p class="notice">${esc(error.message)}</p>`; return; }
  if (savedError) { list.innerHTML = `<p class="notice">Could not load saved rankings: ${esc(savedError.message)}</p>`; return; }
  if (!entries?.length) { list.innerHTML = '<p class="notice">No registered players found. You can still prepare ranking placeholders, but rewards can only be sent to verified registered accounts.</p><div id="adminRankingRows" class="admin-ranking-rows"></div><button id="adminAddRankingPlaceholder" class="outline full">＋ Add placeholder player (—)</button><button id="adminConfirmAllResults" class="join full" disabled>Publish / update rankings & prizes</button>'; $('#adminAddRankingPlaceholder')?.addEventListener('click',()=>addRankingPlaceholder()); return; }
  const resultByEntry = new Map((saved || []).map(r => [String(r.entry_id), r]));
  const ordered = [...entries].sort((a,b) => {
    const ar=resultByEntry.get(String(a.entry_id))?.placement, br=resultByEntry.get(String(b.entry_id))?.placement;
    return (ar ?? 999999)-(br ?? 999999) || new Date(a.created_at||0)-new Date(b.created_at||0);
  });
  list.innerHTML = `<p class="notice">${(saved||[]).some(r=>r.published) ? 'Published results loaded. Changes can be saved again; wallet credits will be adjusted by the difference.' : 'Pending Results — arrange every player before publishing.'} Drag the ☰ handle to reorder.</p>
    <div class="admin-ranking-head"><span>RANK / PLAYER</span><span>KILLS</span><span>TOTAL PRIZE (PTS)</span></div>
    <div id="adminRankingRows" class="admin-ranking-rows">${ordered.map((e,i)=>{const r=resultByEntry.get(String(e.entry_id))||{};return `<div class="admin-ranking-row" draggable="true" data-result-row="${esc(e.entry_id)}" data-ign="${esc(e.in_game_name)}"><div class="ranking-player-cell"><span class="ranking-drag" aria-label="Drag to reorder">☰</span><span class="ranking-bracket">[${i+1}]</span><div><b>${esc((e.in_game_name||'').trim() || '-')}</b><small>${r.published?'Published':'Pending Results'}</small></div></div><label class="ranking-input"><span>Kills</span><input aria-label="Kills for ${esc(e.in_game_name)}" class="result-kills" type="number" min="0" step="1" value="${Number(r.kills||0)}"></label><label class="ranking-input"><span>Total prize</span><input aria-label="Total prize for ${esc(e.in_game_name)}" class="result-reward" type="number" min="0" max="1000000" step="1" value="${Number(r.earned_points||0)}"></label><input class="result-rank" type="hidden" value="${i+1}"></div>`}).join('')}</div>
    <label class="field">ADMIN NOTE (OPTIONAL)<input id="adminBulkResultNote" maxlength="500" placeholder="Verified by screenshot"></label>
    <button id="adminAddRankingPlaceholder" class="outline full">＋ Add placeholder player (—)</button><button id="adminConfirmAllResults" class="join full">Publish / update rankings & prizes</button>
    <p class="notice">Each prize is the total points to credit. Re-publishing updates the final result and credits/debits only the difference, preventing duplicate payouts.</p>`;
  const rowsBox=$('#adminRankingRows'); let dragged=null;
  rowsBox.querySelectorAll('.admin-ranking-row').forEach(row=>{
    row.addEventListener('dragstart',e=>{dragged=row;row.classList.add('dragging');e.dataTransfer.effectAllowed='move';});
    row.addEventListener('dragend',()=>{row.classList.remove('dragging');dragged=null;syncRankingPositions();});
    row.addEventListener('dragover',e=>{e.preventDefault();if(!dragged||dragged===row)return;const rect=row.getBoundingClientRect();rowsBox.insertBefore(dragged,e.clientY<rect.top+rect.height/2?row:row.nextSibling);});
  });
  syncRankingPositions();
  $('#adminAddRankingPlaceholder')?.addEventListener('click',()=>addRankingPlaceholder());
}
function addRankingPlaceholder(){const box=$('#adminRankingRows');if(!box)return;const row=document.createElement('div');row.className='admin-ranking-row ranking-placeholder';row.dataset.resultRow='';row.dataset.ign='—';row.innerHTML='<div class="ranking-player-cell"><span class="ranking-drag">☰</span><span class="ranking-bracket">[—]</span><div><b>—</b><small>Placeholder — not linked to a player account</small></div></div><label class="ranking-input"><span>Kills</span><input class="result-kills" type="number" min="0" value="0"></label><label class="ranking-input"><span>Total prize</span><input class="result-reward" type="number" min="0" value="0"></label><input class="result-rank" type="hidden"><button type="button" class="outline" data-remove-placeholder>Remove</button>';box.appendChild(row);row.querySelector('[data-remove-placeholder]').addEventListener('click',()=>{row.remove();syncRankingPositions();});syncRankingPositions();
}
function syncRankingPositions(){const rows=[...document.querySelectorAll('#adminRankingRows .admin-ranking-row')];rows.forEach((row,i)=>{row.querySelector('.ranking-bracket').textContent=`[${i+1}]`;row.querySelector('.result-rank').value=String(i+1);});}
async function publishBulkResults(button) {
  if (!isAdmin) return toast('Admin access required.');
  const tournamentId = Number(($('#adminResultsTournament')||$('#adminTournament'))?.value);
  const rows = [...document.querySelectorAll('#adminRankingRows [data-result-row]')];
  if (!tournamentId || !rows.length) return toast('Choose a match and load its players first.');
  if(rows.some(row=>!row.dataset.resultRow)){return toast('Remove the — placeholder rows or replace them with a registered player. Rewards require a verified player account.');}
  const results = rows.map((row,i) => ({entry_id:row.dataset.resultRow,placement:i+1,kills:Number(row.querySelector('.result-kills').value),reward:Number(row.querySelector('.result-reward').value),in_game_name:row.dataset.ign,note:$('#adminBulkResultNote')?.value.trim()||''}));
  if(results.some(r=>!Number.isInteger(r.kills)||r.kills<0||!Number.isInteger(r.reward)||r.reward<0||r.reward>1000000))return toast('Kills and total prize must be whole non-negative numbers.');
  if(!confirm(`Publish/update rankings for ${results.length} players? Total prize credit: ${results.reduce((n,r)=>n+r.reward,0).toLocaleString()} points. Existing prizes will be adjusted, not double-credited.`))return;
  button.disabled=true;button.textContent='Saving rankings…';
  const {error}=await supabase.rpc('admin_publish_match_results',{p_tournament_id:tournamentId,p_results:results});
  button.disabled=false;button.textContent='Publish / update rankings & prizes';
  if(error)return toast(error.message);
  toast('Rankings saved and wallet balances reconciled.');await loadAdminEntries();
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
    (canJoin ? '<button id="detailsJoin" class="join full">Join tournament · ' + entry + ' pts</button>' : has ? '<button class="join full" disabled>REGISTERED ✓</button>' : !currentUser ? '<button id="detailsSignIn" class="join full">Sign in to join</button>' : '<button class="join full" disabled>' + (full ? 'TOURNAMENT FULL' : 'REGISTRATION CLOSED') + '</button>'));
  $('#detailsJoin')?.addEventListener('click', () => startJoin(t));
  $('#detailsSignIn')?.addEventListener('click', showAuth);
}
function startJoin(tournament) {
  if (!currentUser) { showAuth(); return; }
  const already = joined.some(x => String(x.tournament_id) === String(tournament.id));
  if (already) { toast('You are already registered.'); return; }
  modal('<h2>Register for ' + esc(tournament.title) + '</h2><p>Registration will be saved to the BattleForge database. Entry fees must be enabled in the server wallet before charging players.</p><label class="field">FREE FIRE IN-GAME NAME<input id="ign" maxlength="24" minlength="2" placeholder="Your IGN"></label><button id="confirmJoin" class="join full">Confirm online registration</button>');
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
$('#profileBtn').onclick = showProfile; $('#notificationBell')?.addEventListener('click', showNotifications);
$('#openDeposit')?.addEventListener('click', showDepositForm);
$('#openWithdrawal')?.addEventListener('click', showWithdrawalForm);
$('#refreshPaymentRequests')?.addEventListener('click', loadPaymentRequests);
$('#adminBtn').onclick = showAdmin;
$('#modalContent').addEventListener('submit', async e => {
  if (e.target.id === 'depositRequestForm' || e.target.id === 'withdrawalRequestForm') {
    e.preventDefault();
    await createPaymentRequest(e.target.id === 'depositRequestForm' ? 'deposit' : 'withdrawal');
  }
});
$('#modalContent').addEventListener('click', async e => {
  const deleteBroadcast = e.target.closest('[data-delete-broadcast]'); if (deleteBroadcast) await deleteAdminBroadcast(deleteBroadcast.dataset.deleteBroadcast);
  if (e.target.id === 'copyDepositUpi') { try { await navigator.clipboard.writeText(RECEIVING_UPI_ID); toast('UPI ID copied.'); } catch { toast('UPI ID: '+RECEIVING_UPI_ID); } }
  if (e.target.id === 'createDepositRequest' && e.target.form?.id !== 'depositRequestForm') await createPaymentRequest('deposit');
  if (e.target.id === 'createWithdrawalRequest' && e.target.form?.id !== 'withdrawalRequestForm') await createPaymentRequest('withdrawal');
  if (e.target.id === 'googleSignInBtn') await googleSignIn();
  if (e.target.id === 'saveRequiredUsername') await saveRequiredUsername();
  if (e.target.id === 'requiredUsernameLogout') { usernameSetupOpen=false; await supabase.auth.signOut(); close(); await refreshData(); showAuth(); }
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
  if (button.id === 'adminLoadPayments') { await loadAdminPaymentRequests(); return; }
  if (button.dataset.paymentAction) { await handleAdminPaymentAction(button); return; }
  if (button.id === 'adminFindPlayer') { if(!isAdmin)return toast('Admin access required.'); const n=Number($('#adminPlayerNumber')?.value); if(!Number.isSafeInteger(n)||n<1)return toast('Enter a valid numeric Player ID.'); button.disabled=true; const box=$('#adminPlayerDetails'); box.textContent='Loading player history…'; const {data,error}=await supabase.rpc('admin_get_player_details',{p_player_number:n}); button.disabled=false; if(error){box.textContent=error.message;return;} window.battleForgeAdminPlayer=data; const hist=(data.wallet_history||[]).map(x=>`<div class=\"activity-row\"><div><b>${esc(x.entry_type)} · ${esc(x.bucket)}</b><small>${esc(x.created_at)} · ${esc(x.note||'')}</small></div><strong>${Number(x.amount||0)>0?'+':''}${Number(x.amount||0).toFixed(2)}</strong></div>`).join(''); const deps=(data.deposits||[]).map(x=>`<div class=\"activity-row\"><div><b>Deposit ₹${Number(x.amount).toFixed(2)}</b><small>${esc(x.status)} · ${esc(x.created_at)} · ${esc(x.id)}</small></div></div>`).join(''); const wds=(data.withdrawals||[]).map(x=>`<div class=\"activity-row\"><div><b>Withdrawal ₹${Number(x.amount).toFixed(2)}</b><small>${esc(x.status)} · ${esc(x.created_at)} · ${esc(x.id)}</small></div><strong>Net ₹${Number(x.net_amount||0).toFixed(2)}</strong></div>`).join(''); box.innerHTML=`<div class=\"room-card\"><h3>Player #${esc(data.player_number)}</h3><p>${esc(data.email||'No email')} · Joined ${esc(data.created_at)}</p><p>Auth UID: ${esc(data.user_id)}</p><p>Referrer Player ID: ${esc(data.referred_by_player_number||'None')}</p><p>Entries: ${Number(data.stats?.entries||0)} · Deposits: ${Number(data.stats?.deposits||0)} · Withdrawals: ${Number(data.stats?.withdrawals||0)} · Paid withdrawals: ${Number(data.stats?.paid_withdrawals||0)}</p><p>Entry-only balance: ₹${Number(data.wallet?.deposited_balance||0).toFixed(2)} · Earned balance: ₹${Number(data.wallet?.earned_balance||0).toFixed(2)} · Total: ₹${Number(data.wallet?.total_balance||0).toFixed(2)}</p></div><h3>Wallet ledger</h3>${hist||'<p>No ledger entries.</p>'}<h3>Deposit history</h3>${deps||'<p>No deposits.</p>'}<h3>Withdrawal history</h3>${wds||'<p>No withdrawals.</p>'}`; return; }
  if (button.id === 'adminAdjustBalance') { if(!isAdmin)return toast('Admin access required.'); const n=Number($('#adminPlayerNumber')?.value),amount=Number($('#adminBalanceAmount')?.value),bucket=$('#adminBalanceBucket')?.value,note=$('#adminBalanceNote')?.value.trim(); if(!Number.isSafeInteger(n)||n<1||!Number.isFinite(amount)||amount===0||!note||note.length<3)return toast('Enter Player ID, non-zero amount, and reason.'); if(!window.confirm(`Apply ${amount>0?'credit':'deduction'} of ₹${Math.abs(amount).toFixed(2)} to Player #${n} (${bucket})?`))return; button.disabled=true; const {data,error}=await supabase.rpc('admin_adjust_player_balance',{p_player_number:n,p_bucket:bucket,p_amount:amount,p_note:note}); button.disabled=false; if(error)return toast(error.message); toast('Balance adjusted and audit logged.'); $('#adminBalanceAmount').value=''; const find=$('#adminFindPlayer'); if(find) find.click(); return; }
  if (button.dataset.deletePaymentKind) { if(!isAdmin)return toast('Admin access required.'); const reason=window.prompt('Why are you deleting this request? This is audited.'); if(!reason||reason.trim().length<3)return toast('Enter a reason to delete the request.'); if(!window.confirm('Delete this '+button.dataset.deletePaymentKind+' request? Pending withdrawal funds will be refunded; verified deposits and paid withdrawals cannot be deleted.'))return; button.disabled=true; const {error}=await supabase.rpc('admin_delete_payment_request',{p_kind:button.dataset.deletePaymentKind,p_request_id:button.dataset.requestId,p_note:reason.trim()}); button.disabled=false; if(error)return toast(error.message); toast('Request deleted safely.'); await loadAdminPaymentRequests(); await loadPaymentRequests(); await loadWalletSummary(); return; }
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
    if (!id) return toast('Choose a tournament.');
    const { data: tournament, error: lookupError } = await supabase.from('tournaments').select('id,title,is_past_match').eq('id', id).maybeSingle();
    if (lookupError || !tournament) return toast(lookupError?.message || 'Choose a valid tournament.');
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
    const id = Number($('#adminRoomTournament')?.value || $('#adminTournament')?.value); if (!id) return toast('Choose a tournament.');
    button.disabled = true;
    const { error } = await supabase.rpc('admin_set_tournament_room', { p_tournament_id:id, p_room_id:$('#adminRoomId').value.trim(), p_room_password:$('#adminRoomPassword').value.trim(), p_published:$('#adminRoomPublished').checked });
    button.disabled = false; if (error) return toast(error.message);
    toast('Match room saved. You can update it anytime.');
    await loadAdminEntries();
  }
  if (button.id === 'adminLoadEntries') await loadAdminEntries();
  if (button.id === 'adminConfirmAllResults') await publishBulkResults(button);
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
document.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => { setPage(button.dataset.tab); if (button.dataset.tab === 'leaderboard') loadLeaderboard(); });
document.querySelectorAll('[data-lb-period]').forEach(button => button.addEventListener('click', () => loadLeaderboard(button.dataset.lbPeriod)));
document.addEventListener('click', e => { if (e.target.closest('button')) playUiSound(); });
document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => setPage(button.dataset.go)));
document.querySelector('[data-home]')?.addEventListener('click', event => { event.preventDefault(); setPage('arena'); });
$('#historySignIn')?.addEventListener('click', showAuth);
document.addEventListener('click', async event => { const button=event.target.closest('#adminMarkPastMatch'); if(!button)return; if(!isAdmin)return toast('Admin access required.'); const id=Number($('#adminTournament')?.value); if(!id)return toast('Choose a match first.'); button.disabled=true; const {error}=await supabase.rpc('admin_mark_match_past',{p_tournament_id:id}); button.disabled=false; if(error)return toast(error.message); toast('Moved out of Arena. Now load players below to rank them.'); await refreshData(); await showHistory(); const pageButton=document.querySelector('[data-admin-page-open="players"]'); pageButton?.click(); const selector=$('#adminResultsTournament'); if(selector) selector.value=String(id); openAdminPage('results'); await loadAdminEntries(); });
$('#historyContent')?.addEventListener('click', event => { const match=event.target.closest('[data-past-match]'); if(match){openPastMatchDetails(match.dataset.pastMatch);return;} const button=event.target.closest('[data-go]'); if(button)setPage(button.dataset.go); if(event.target.closest('#historySignIn'))showAuth(); });
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
