export const FORMAT = 'ouchi-quest-mini';
export const MEMBERS = ['m1', 'm2', 'm3'];
export const MISSIONS = Object.freeze([
  { id: 'living', room: 'リビング', title: '床のものをおうちに戻す', note: 'おもちゃや本を、いつもの場所へ。', points: 10, icon: 'sofa' },
  { id: 'kitchen', room: 'キッチン', title: '食器を片付ける', note: 'テーブルをすっきり、気持ちよく。', points: 15, icon: 'cup' },
  { id: 'entrance', room: '玄関', title: '靴をそろえる', note: '明日の「いってきます」を整えよう。', points: 10, icon: 'door' }
]);
export function localDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function initialState() {
  return { format: FORMAT, version: 1, members: MEMBERS.map((id, i) => ({ id, name: `家族${i + 1}` })), completions: [], redemptions: [] };
}
export function balance(state, memberId) {
  return state.completions.filter(x => x.memberId === memberId).reduce((n, x) => n + x.points, 0)
    - state.redemptions.filter(x => x.memberId === memberId).reduce((n, x) => n + x.points, 0);
}
function requireThat(condition, message = 'バックアップの形式が正しくありません。') {
  if (!condition) throw new Error(message);
}
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
const textOK = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const positive = value => Number.isSafeInteger(value) && value > 0 && value <= 1000000;
const timestampOK = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
export function validateState(source) {
  requireThat(source && source.format === FORMAT && source.version === 1, 'おうちクエストmini（バージョン1）のJSONを選んでください。');
  requireThat(Array.isArray(source.members) && source.members.length === 3);
  const members = MEMBERS.map(id => {
    const found = source.members.filter(x => x && x.id === id);
    requireThat(found.length === 1 && textOK(found[0].name, 20), '家族名は1〜20文字、家族は3人必要です。');
    return { id, name: found[0].name.trim() };
  });
  requireThat(Array.isArray(source.completions) && Array.isArray(source.redemptions));
  requireThat(source.completions.length + source.redemptions.length <= 50000, '記録件数の上限（50,000件）を超えています。');
  const seen = new Set();
  const completions = source.completions.map(x => {
    requireThat(x && MEMBERS.includes(x.memberId) && validDate(x.date) && timestampOK(x.createdAt));
    const mission = MISSIONS.find(m => m.id === x.missionId);
    requireThat(mission && mission.points === x.points);
    const key = `${x.date}:${x.missionId}`;
    requireThat(!seen.has(key), '同じ日のミッションが重複しています。'); seen.add(key);
    return { date: x.date, missionId: x.missionId, memberId: x.memberId, points: x.points, createdAt: x.createdAt };
  });
  const redemptions = source.redemptions.map(x => {
    requireThat(x && textOK(x.id, 100) && !seen.has(`r:${x.id}`)); seen.add(`r:${x.id}`);
    requireThat(MEMBERS.includes(x.memberId) && positive(x.points) && textOK(x.label, 60) && timestampOK(x.createdAt));
    requireThat(x.kind === 'reward' || x.kind === 'money');
    requireThat(x.kind === 'money' ? positive(x.yen) : x.yen === null);
    return { id: x.id, memberId: x.memberId, kind: x.kind, label: x.label.trim(), points: x.points, yen: x.yen, createdAt: x.createdAt };
  });
  const result = { format: FORMAT, version: 1, members, completions, redemptions };
  MEMBERS.forEach(id => requireThat(Number.isSafeInteger(balance(result, id)) && balance(result, id) >= 0, 'ポイント残高がマイナスになるデータは復元できません。'));
  return result;
}
export function completeMission(state, missionId, memberId, now = new Date()) {
  const mission = MISSIONS.find(x => x.id === missionId);
  requireThat(mission && MEMBERS.includes(memberId), '担当者を選んでください。');
  const date = localDate(now);
  requireThat(!state.completions.some(x => x.date === date && x.missionId === missionId), 'このミッションは今日は完了済みです。');
  state.completions.push({ date, missionId, memberId, points: mission.points, createdAt: now.toISOString() });
  return validateState(state);
}
export function redeem(state, record, now = new Date()) {
  requireThat(!state.redemptions.some(x => x.id === record.id), 'この交換は記録済みです。');
  requireThat(MEMBERS.includes(record.memberId) && positive(record.points), '交換ポイントを1〜1,000,000の整数で入力してください。');
  requireThat(balance(state, record.memberId) >= record.points, 'ポイントが足りません。交換ポイントを確認してください。');
  state.redemptions.push({ ...record, createdAt: now.toISOString() });
  return validateState(state);
}
