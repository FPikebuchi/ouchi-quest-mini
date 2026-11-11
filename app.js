import { MEMBERS, MISSIONS, balance, completeMission, localDate, redeem, validateState } from './model.js';
import { updateStore, readRaw, replaceStore } from './store.js';
const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const number = value => value.toLocaleString('ja-JP');
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
let state, busy = false, day = localDate(), noticeTimer;
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ouchi-quest-mini') : null;
function memberName(id) { return state.members.find(x => x.id === id).name; }
function options() { return state.members.map(x => `<option value="${x.id}">${escape(x.name)}</option>`).join(''); }
function notify(message, error = false) {
  clearTimeout(noticeTimer); const el = $('#notice'); el.textContent = message;
  el.className = `visible${error ? ' error' : ''}`;
  noticeTimer = setTimeout(() => { el.className = ''; }, error ? 9000 : 4500);
}
function page() { return ['today', 'rewards', 'history', 'settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'today'; }
function memberCards() {
  return `<div class="members">${state.members.map(m => `<div class="member-card"><span class="avatar" aria-hidden="true">${escape(Array.from(m.name)[0])}</span><div><div class="member-name">${escape(m.name)}</div><div class="points">${number(balance(state, m.id))}<small>pt</small></div></div></div>`).join('')}</div>`;
}
function todayView() {
  const today = state.completions.filter(x => x.date === day);
  const dateLabel = new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  return `<section class="hero"><div><p class="eyebrow">${dateLabel} · TODAY'S QUEST</p><h1>${today.length === 3 ? '今日のおうち、<br>すっきり大成功。' : '小さな片付けが、<br>家族のごほうびに。'}</h1><p class="muted">${today.length === 3 ? '3つの「できた」が集まりました。また明日！' : '今日も、できることをひとつずつ。'}</p></div><div class="ring" style="--progress:${today.length * 120}deg" role="img" aria-label="今日の達成 ${today.length}/3"><div class="ring-content"><strong>${today.length}<span> / 3</span></strong><small>クエスト完了</small></div></div></section>
  <section aria-label="家族のポイント"><div class="section-title"><h2>みんなのポイント</h2><a class="text-link" href="#settings">家族名を編集</a></div>${memberCards()}</section>
  <div class="content-grid"><section><div class="section-title"><h2>今日のミッション</h2><p class="muted">毎日、3つの小さな一歩</p></div><div class="missions">${MISSIONS.map(m => {
    const done = today.find(x => x.missionId === m.id);
    return `<article class="mission${done ? ' done' : ''}"><div class="mission-icon">${icon(m.icon)}</div><div><div class="mission-top"><span class="room-tag">${m.room}</span><span class="point-tag">+${m.points} pt</span></div><h3>${m.title}</h3><p class="muted">${m.note}</p>${done ? `<div class="done-label">${icon('check')}<span>${escape(memberName(done.memberId))} が完了！</span></div>` : `<form class="mission-action" data-mission="${m.id}"><select name="member" aria-label="${m.room}の担当者" required><option value="">担当者を選ぶ</option>${options()}</select><button class="primary" type="submit">できた！</button></form>`}</div></article>`;
  }).join('')}</div><p class="saved-message">1ミッションにつき、家族のうち1人に1日1回加点。</p></section>
  <aside><div class="section-title"><h2>お部屋のすっきり度</h2></div><section class="panel" aria-label="今日の部屋別進捗">${MISSIONS.map(m => {
    const done = today.some(x => x.missionId === m.id);
    return `<div class="room-progress"><div class="room-line"><span>${m.room}</span><span>${done ? 'すっきり！ 100%' : 'これから 0%'}</span></div><div class="track" role="progressbar" aria-label="${m.room}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${done ? 100 : 0}"><span style="width:${done ? 100 : 0}%"></span></div></div>`;
  }).join('')}</section><div class="tip">${icon('gift')}<div><h3>がんばりを、ごほうびに。</h3><p>貯めたポイントでお小遣いや家族で決めたごほうびと交換しよう。</p><a href="#rewards" class="text-link">ごほうびを記録する →</a></div></div></aside></div>`;
}
function rewardsView() {
  return `<div class="page-intro"><p class="eyebrow">LITTLE REWARDS</p><h1>がんばったぶん、うれしいね。</h1><p class="muted">家族で決めた交換ルールで、お小遣いやごほうびを記録。</p></div>${memberCards()}
  <div class="section-title"><h2>ポイントを交換する</h2></div><form id="redeem-form" class="panel form-panel"><label class="field">だれのポイント？<select name="member" required>${options()}</select></label><div id="reward-balance" class="balance-note"></div><label class="field">交換するもの<select name="kind"><option value="reward">ごほうび</option><option value="money">お小遣い</option></select></label><label class="field">ごほうび・交換の名前<input name="label" maxlength="60" required placeholder="例：好きなおやつを選べる"></label><div class="form-row"><label class="field">使うポイント（pt）<input name="points" type="number" inputmode="numeric" min="1" max="1000000" step="1" required placeholder="例：30"></label><label class="field" id="yen-field" hidden>お小遣い（円）<input name="yen" type="number" inputmode="numeric" min="1" max="1000000" step="1" placeholder="例：100" disabled></label></div><p class="field-note">交換率は自由です。実際の送金や支払いは行わず、交換した事実を記録します。</p><button type="submit" class="primary full">交換内容を確認する</button></form>`;
}
function historyView() {
  return `<div class="page-intro"><p class="eyebrow">FAMILY MEMORIES</p><h1>「できた」の記録。</h1><p class="muted">完了したミッションと、ごほうびの交換履歴。</p></div><div class="panel"><label class="field">家族で絞り込む<select id="history-filter"><option value="all">みんな</option>${options()}</select></label><p class="muted">新しい順 · 直近100件を表示（バックアップには全件保存）</p><ul class="history-list" id="history-list"></ul></div>`;
}
function renderHistory() {
  const filter = $('#history-filter').value;
  const records = [...state.completions.map(x => ({ ...x, title: MISSIONS.find(m => m.id === x.missionId).title, detail: `${x.date.replaceAll('-', '/')} のミッション`, spent: false })), ...state.redemptions.map(x => ({ ...x, title: x.label, detail: x.kind === 'money' ? `お小遣い ${number(x.yen)}円` : 'ごほうび交換', spent: true }))].filter(x => filter === 'all' || x.memberId === filter).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 100);
  $('#history-list').innerHTML = records.length ? records.map(x => `<li class="history-item"><span class="avatar">${icon(x.spent ? 'gift' : 'check')}</span><div class="history-text"><strong>${escape(x.title)}</strong><small>${escape(memberName(x.memberId))} · ${escape(x.detail)}<br>${escape(new Date(x.createdAt).toLocaleString('ja-JP'))}</small></div><span class="history-delta${x.spent ? ' spent' : ''}">${x.spent ? '−' : '+'}${number(x.points)} pt</span></li>`).join('') : '<li class="empty">まだ記録はありません。<br>今日のミッションから始めてみよう。</li>';
}
function settingsView() {
  return `<div class="page-intro"><p class="eyebrow">OUR FAMILY</p><h1>家族と、データのこと。</h1><p class="muted">このiPhone 1台で、家族3人のがんばりを管理します。</p></div><div class="settings-grid"><section class="panel"><h2>家族の名前</h2><p class="muted">1〜20文字。名前を変えても記録は引き継がれます。</p><form id="members-form">${state.members.map((m, i) => `<label class="field">家族 ${i + 1}<input name="${m.id}" value="${escape(m.name)}" required maxlength="20" autocomplete="off"></label>`).join('')}<button type="submit" class="primary full">名前を保存する</button></form></section>
  <section class="panel"><h2>バックアップと復元</h2><p class="muted">機種変更前や定期的に、JSONを「ファイル」に保存してください。</p><div class="setting-actions"><button type="button" id="backup" class="primary">JSONを保存</button></div><p class="field-note">保存先を選べるiPhoneでは、共有から「ファイルに保存」を選べます。</p><label class="field file-field">復元するJSONファイル<input id="restore-file" type="file" accept=".json,application/json"></label><p class="field-note">復元は現在の記録を置き換えます。事前に現在のJSONを保存してください。形式・重複・残高を確認してから復元します。</p></section>
  <section class="panel"><h2>無料で、端末内だけに。</h2><p class="muted">広告・課金・会員登録・外部送信はありません。家族名、完了履歴、交換履歴はこのブラウザの端末内に保存します。</p><p class="field-note">サイトデータの削除や端末の故障で消えることがあります。Safariとホーム画面のアプリ、別のURLでは保存領域が異なる場合があるため、JSONで移してください。</p></section><section class="panel"><h2>毎日のルール</h2><p class="muted">毎日0時（端末の現地時間）に3件のミッションが新しくなります。ポイントと過去の記録は残ります。</p><p class="field-note">同じ日の同じミッションは1人分だけ。完了記録は取り消せません。交換の記録はお小遣いの自動支払いではありません。</p><p id="offline-status" class="field-note"></p></section></div>`;
}
function render() {
  if (!state) return;
  day = localDate();
  const route = page();
  document.querySelectorAll('.nav a').forEach(a => { const active = a.hash === `#${route}`; a.classList.toggle('active', active); active ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  $('#main').innerHTML = ({ today: todayView, rewards: rewardsView, history: historyView, settings: settingsView })[route]();
  if (route === 'rewards') updateRewardForm();
  if (route === 'history') renderHistory();
  if (route === 'settings') showOfflineStatus();
}
async function showOfflineStatus() {
  let ready = false;
  try { const r = await navigator.serviceWorker?.getRegistration(); ready = !!r?.active; } catch {}
  const el = $('#offline-status');
  if (el) el.textContent = ready ? 'オフライン準備済み。通信なしでも利用できます。' : 'オフライン準備中、またはこの環境では未対応です。初回は通信できる状態で開いてください。';
}
function updateRewardForm() {
  const form = $('#redeem-form');
  if (!form) return;
  const money = form.elements.kind.value === 'money';
  $('#yen-field').hidden = !money; form.elements.yen.disabled = !money; form.elements.yen.required = money;
  $('#reward-balance').textContent = `${memberName(form.elements.member.value)} の残高：${number(balance(state, form.elements.member.value))} pt`;
}
function confirmAction(title, description, buttonLabel = '記録する') {
  const dialog = $('#confirm-dialog');
  $('#confirm-title').textContent = title; $('#confirm-description').textContent = description;
  dialog.querySelector('[value="ok"]').textContent = buttonLabel;
  return new Promise(resolve => { dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true }); dialog.returnValue = 'cancel'; dialog.showModal(); });
}
async function action(work) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('#main button').forEach(b => b.disabled = true);
  try { await work(); } catch (error) { notify(error.message || '処理できませんでした。', true); }
  finally { busy = false; document.querySelectorAll('#main button').forEach(b => b.disabled = false); }
}
function changed() { channel?.postMessage('changed'); }
async function refresh() {
  if (busy || $('#confirm-dialog').open) return;
  try { state = validateState(await readRaw()); render(); } catch (e) { notify(e.message, true); }
}
document.addEventListener('submit', event => {
  const form = event.target;
  if (!form.matches('#members-form, #redeem-form, [data-mission]')) return;
  event.preventDefault();
  action(async () => {
    if (form.dataset.mission) {
      const missionId = form.dataset.mission, memberId = form.elements.member.value;
      // Confirm against the date actually rendered, so midnight cannot credit an old task to a new day.
      if (day !== localDate()) { await refreshAfterMutation(); throw new Error('日付が変わりました。今日の担当者を選び直してください。'); }
      state = await updateStore(s => completeMission(s, missionId, memberId));
      render(); changed(); notify('できたね！ポイントを保存しました。');
    } else if (form.id === 'members-form') {
      const names = MEMBERS.map(id => ({ id, name: form.elements[id].value.trim() }));
      state = await updateStore(s => ({ ...s, members: names })); render(); changed(); notify('家族の名前を保存しました。');
    } else {
      const data = new FormData(form);
      const record = { id: crypto.randomUUID(), memberId: data.get('member'), kind: data.get('kind'), label: data.get('label').trim(), points: Number(data.get('points')), yen: data.get('kind') === 'money' ? Number(data.get('yen')) : null };
      // Validate before showing a confirmation, then validate again against the latest balance inside the transaction.
      redeem(structuredClone(state), record);
      if (!await confirmAction('この内容で交換しますか？', `${memberName(record.memberId)}：${record.label}\n${number(record.points)} pt を使用${record.kind === 'money' ? ` / ${number(record.yen)}円` : ''}\n実際の受け渡しは家族で行ってください。`)) return;
      state = await updateStore(s => redeem(s, record)); render(); changed(); notify('ごほうびの交換を記録しました。');
    }
  });
});
async function refreshAfterMutation() { state = validateState(await readRaw()); render(); }
document.addEventListener('change', event => {
  if (event.target.closest('#redeem-form')) updateRewardForm();
  if (event.target.id === 'history-filter') renderHistory();
  if (event.target.id === 'restore-file') {
    const file = event.target.files[0]; event.target.value = '';
    if (!file) return;
    action(async () => {
      if (file.size > 15 * 1024 * 1024) throw new Error('15MB以下のJSONを選んでください。');
      let parsed;
      try { parsed = JSON.parse(await file.text()); } catch { throw new Error('JSONを読み取れません。ファイルを確認してください。'); }
      const candidate = validateState(parsed);
      if (!await confirmAction('バックアップを復元しますか？', `${candidate.members.map(x => x.name).join('・')}\n完了 ${candidate.completions.length}件 / 交換 ${candidate.redemptions.length}件\n現在の全データを置き換えます。事前に現在のJSONを保存してください。`, '置き換えて復元')) return;
      state = await replaceStore(candidate); render(); changed(); notify('バックアップを復元しました。');
    });
  }
});
async function downloadBackup() {
  // Use the in-memory state (kept in sync via refresh) so navigator.share runs within the tap.
  // iOS Safari rejects share() with NotAllowedError after an IndexedDB await.
  const raw = state ?? await readRaw();
  const file = new File([JSON.stringify(raw, null, 2)], `ouchi-quest-${localDate()}-${Date.now()}.json`, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'おうちクエストのバックアップ' }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file); const link = document.createElement('a');
  link.href = url; link.download = file.name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  notify('JSONを出力しました。保存先を確認してください。');
}
document.addEventListener('click', event => { if (event.target.closest('#backup')) action(downloadBackup); });
window.addEventListener('hashchange', () => { if ($('#confirm-dialog').open) $('#confirm-dialog').close('cancel'); render(); $('#main').focus({ preventScroll: true }); window.scrollTo(0, 0); });
channel?.addEventListener('message', refresh);
window.addEventListener('pageshow', () => { if (state) refresh(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state) refresh(); });
setInterval(() => { if (state && !busy && localDate() !== day) render(); }, 15000);
async function start() {
  try { state = await updateStore(); render(); }
  catch (e) {
    $('#main').innerHTML = `<section class="error-box"><h1>記録を開けませんでした</h1><p>${escape(e.message)}</p><p class="field-note">保存済みデータは自動で初期化しません。JSONを退避し、ページを開き直すか、正常なバックアップから復元してください。</p><button id="backup" class="secondary">保存済みJSONを取り出す</button><label class="field file-field">復元するJSONファイル<input id="restore-file" type="file" accept=".json,application/json"></label></section>`;
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    try { await navigator.serviceWorker.register('./sw.js'); } catch { /* App remains usable online. */ }
  }
}
start();
