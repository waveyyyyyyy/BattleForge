import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { PushNotifications } from '@capacitor/push-notifications';

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
let pushListenersInstalled = false;
let pushRegistrationInProgress = false;
let pushRegisteredUserId = null;
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
  const old=$('#walletActivity'); if(old) { const {data:player}=await supabase.from('player_accounts').select('player_number').eq('user_id',currentUser.id).maybeSingle(); const playerNo=player?.player_number; const refLink=playerNo?'https://github.com/waveyyyyyyy/BattleForge/releases/latest?ref='+encodeURIComponent(playerNo):''; old.insertAdjacentHTML('afterbegin',`<p class="notice"><b>Your BattleForge Player ID: ${esc(playerNo||'Loading')}</b><br>Share your public BattleForge download link. Your friend should enter Player ID ${esc(playerNo||'')} as the referral code when registering; you earn ₹5 in entry-fee-only credits after their first completed withdrawal.<br>${refLink?`<button type="button" class="outline" id="copyReferralLink">Copy referral link</button>`:''}<br>Entry-fee-only balance: ${Number(row.deposited_balance||0).toFixed(2)} · Match earnings: ${Number(row.earned_balance||0).toFixed(2)}. Only match earnings can be withdrawn.</p>`); $('#copyReferralLink')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(refLink);toast('Referral link copied!')}catch{toast(refLink)}}); }
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

async function setupBattleForgePush() {
  if (!currentUser || !Capacitor.isNativePlatform() || pushRegistrationInProgress || pushRegisteredUserId === currentUser.id) return;
  pushRegistrationInProgress = true;
  try {
    if (!pushListenersInstalled) {
      pushListenersInstalled = true;
      await PushNotifications.addListener('registration', async token => {
        if (!currentUser?.id || !token?.value) return;
        const { error } = await supabase.from('push_devices').upsert({
          user_id: currentUser.id, token: token.value, platform: Capacitor.getPlatform(), updated_at: new Date().toISOString()
        }, { onConflict: 'token' });
        if (error) console.warn('Could not save push token:', error.message);
      });
      await PushNotifications.addListener('registrationError', error => console.warn('Push registration failed:', error));
      await PushNotifications.addListener('pushNotificationReceived', notification => {
        if (notification?.title) toast('🔔 ' + notification.title);
        refreshData().catch(error => console.warn('Could not refresh after push:', error));
      });
      await PushNotifications.addListener('pushNotificationActionPerformed', () => {
        setPage('arena');
        refreshData().catch(error => console.warn('Could not refresh after opening push:', error));
        toast('Open Notifications or your match card to view the update.');
      });
    }
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') permission = await PushNotifications.requestPermissions();
    if (permission.receive === 'granted') { await PushNotifications.register(); pushRegisteredUserId = currentUser.id; }
  } catch (error) {
    console.warn('Push notifications are not configured on this build yet:', error);
  } finally { pushRegistrationInProgress = false; }
}

async function refreshData() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) console.warn(sessionError);
  currentUser = session?.user ?? null;
  isAdmin = false;
  if (currentUser) setupBattleForgePush().catch(error => console.warn('Push setup skipped:', error));
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
  modal('<h2>Welcome to BattleForge</h2><p>Create your account with a unique username. During registration, enter your friend’s referral code if you have one; it is optional.</p><button id="googleSignInBtn" class="join full google-sign-in"><span aria-hidden="true">G</span> Continue with Google</button><div class="auth-divider"><span>OR USE EMAIL</span></div><label class="field">USERNAME (REQUIRED)<input id="signupUsername" type="text" minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" autocomplete="nickname" placeholder="Letters, numbers, underscores"></label><p class="profile-help">3–24 characters. Only letters, numbers, and underscores. Must be unique.</p><label class="field">EMAIL<input id="authEmail" type="email" autocomplete="email" placeholder="you@example.com"></label><label class="field">PASSWORD<input id="authPassword" type="password" autocomplete="new-password" minlength="8" placeholder="At least 8 characters"></label><label class="field">REFERRAL CODE / PLAYER ID (OPTIONAL)<input id="referralPlayerNumber" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="Enter referral code or skip" value="' + esc(referralFromLink) + '"></label><button id="signInBtn" class="join full">Log in with email</button><button id="signUpBtn" class="outline full">Create account with email</button><p class="notice">Email confirmation may be required. Never share your password or OTP.</p>');
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
  </details><details cl
... (output truncated, full output saved to: /mnt/files/.composio/output/exec_took_stdout.txt)
To view the full output, run code: open('/mnt/files/.composio/output/exec_took_stdout.txt').read()
Or use COMPOSIO_BASH_TOOL: 'cat /mnt/files/.composio/output/exec_took_stdout.txt' / 'head -n 100 /mnt/files/.composio/output/exec_took_stdout.txt' / 'tail -n 100 /mnt/files/.composio/output/exec_took_stdout.txt'