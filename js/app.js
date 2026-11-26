/**
 * app.js — 화면 구성과 사용자 동작 처리
 * 계산 규칙은 progression.js, 저장은 storage.js에 있어요.
 */
import {
  CONFIG, LADDER_TYPES, buildLadder, stepUp, stepDown, isBodyweight, recommend,
  formatWeight, formatSets, nextGroup, shouldSuggestC, daysBetween,
} from './progression.js';
import { GROUPS } from './defaults.js';
import { loadState, saveState, exportBackup, parseBackup, defaultState, normalizeExercise } from './storage.js';
import { lineChartSVG } from './chart.js';

const app = document.getElementById('app');
const GROUP_KEYS = ['A', 'B', 'C'];
let state = loadState();
let view = { name: 'home', params: {} };
let storagePersisted = null;

// ───────────────────────── 유틸 ─────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad2 = (n) => String(n).padStart(2, '0');
const localDate = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayStr = () => localDate();
const mmss = (s) => `${Math.floor(s / 60)}:${pad2(s % 60)}`;

function num(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function fmtDate(d) {
  const [y, m, dd] = d.split('-').map(Number);
  const wd = '일월화수목금토'[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()];
  return `${m}/${dd} (${wd})`;
}
const agoText = (days) => (days <= 0 ? '오늘' : days === 1 ? '어제' : `${days}일 전`);

function persist() {
  if (!saveState(state)) toast('저장에 실패했어요. 폰 저장 공간을 확인해 주세요.');
}

const exById = (id) => state.exercises.find((e) => e.id === id);
const groupExercises = (g, includeHidden = false) => state.exercises.filter((e) => e.group === g && (includeHidden || !e.hidden));
const cmpSession = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.startedAt || '').localeCompare(String(b.startedAt || '')));
const sortedSessions = () => [...state.sessions].sort(cmpSession);

/** 종목별 기록 (오래된 것 → 최신). beforeId가 있으면 그 운동 직전까지만 */
function historyFor(exId, beforeId = null) {
  const out = [];
  for (const s of sortedSessions()) {
    if (beforeId && s.id === beforeId) break;
    const e = s.entries.find((x) => x.exerciseId === exId);
    if (e && e.sets.length) out.push({ date: s.date, sets: e.sets, memo: e.memo || '', sessionId: s.id });
  }
  return out;
}

function unitTag(ex) {
  switch (ex.ladder.type) {
    case 'barbell': return '원판 기준';
    case 'dumbbell': return '한 손 기준';
    case 'bodyweight': return '맨몸';
    case 'cable': return '케이블';
    case 'custom': return `${formatWeight(ex.ladder.step)}kg 간격`;
    default: return '머신';
  }
}

const countDone = (a) => Object.values(a.entries).reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);

// ───────────────────────── 공통 UI ─────────────────────────
function toast(msg, ms = 2800) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), ms);
}

/** 앱 안에서 띄우는 확인 창 (브라우저 confirm 대신) */
function confirmDialog(message, okLabel = '확인', danger = false) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'modal-backdrop';
    el.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <p>${esc(message)}</p>
      <div class="modal-actions">
        <button class="btn" data-r="0">취소</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(okLabel)}</button>
      </div></div>`;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (!b && e.target !== el) return;
      el.remove();
      resolve(b ? b.dataset.r === '1' : false);
    });
    document.body.appendChild(el);
  });
}

const header = (title, back = 'home', extra = '') => `
  <header class="top">
    ${back ? `<button class="back" data-action="go" data-to="${back}" aria-label="뒤로">‹ 뒤로</button>` : ''}
    <h1>${title}</h1>${extra}
  </header>`;

// ───────────────────────── 화면 전환 ─────────────────────────
function go(name, params = {}) {
  if (view.name === 'workout' && name !== 'workout') releaseWakeLock();
  view = { name, params };
  render();
  window.scrollTo(0, 0);
  if (name === 'workout') requestWakeLock();
}

function render() {
  if (view.name === 'workout' && !state.active) view = { name: 'home', params: {} };
  const fn = VIEWS[view.name] || VIEWS.home;
  app.innerHTML = fn();
  afterRender();
}

function afterRender() {
  if (view.name === 'settings') {
    const el = document.getElementById('app-version');
    if (el && 'caches' in window) {
      caches.keys().then((keys) => {
        const k = keys.find((x) => x.startsWith('gym-tracker-'));
        if (k) el.textContent = `앱 버전: ${k.replace('gym-tracker-', '')}`;
      }).catch(() => {});
    }
  }
}

// ───────────────────────── 홈 ─────────────────────────
function compactSummary(s) {
  return s.entries.map((e) => {
    const ex = exById(e.exerciseId);
    const name = ex?.name || e.name || '종목';
    const bw = ex ? isBodyweight(ex) : e.sets.every((x) => x.weight == null);
    const best = bw ? formatSets(e.sets, true) : `${formatWeight(Math.max(...e.sets.map((x) => x.weight || 0)))}kg`;
    return `${esc(name)} ${best}`;
  }).join(' · ');
}

function backupStatusHTML() {
  const lb = state.lastBackupAt;
  const has = state.sessions.length > 0;
  if (!lb) {
    return has
      ? `<button class="notice" data-action="go" data-to="backup">아직 백업한 적이 없어요. 폰을 바꾸거나 앱을 지우면 기록이 사라질 수 있으니 가끔 백업해 두세요 ›</button>`
      : `<p class="muted small center">마지막 백업: 없음</p>`;
  }
  const d = localDate(new Date(lb));
  const days = daysBetween(d, todayStr());
  if (has && days > CONFIG.BACKUP_REMIND_DAYS) {
    return `<button class="notice" data-action="go" data-to="backup">마지막 백업이 ${days}일 전이에요. 시간 날 때 한 번 백업해 두면 안심이에요 ›</button>`;
  }
  return `<p class="muted small center">마지막 백업: ${fmtDate(d)} (${agoText(days)})</p>`;
}

function viewHome() {
  const sessions = sortedSessions();
  const last = sessions[sessions.length - 1];
  const today = todayStr();
  const rec = nextGroup(sessions);
  const a = state.active;

  const hero = a
    ? `<button class="hero resume" data-action="resume">
        <span class="hero-label">진행 중인 운동</span>
        <span class="hero-group">${a.group}</span>
        <span class="hero-name">${GROUPS[a.group]}</span>
        <span class="hero-sub">완료 ${countDone(a)}세트 · 탭해서 이어하기 ›</span>
      </button>`
    : `<button class="hero" data-action="start" data-group="${rec}">
        <span class="hero-label">오늘 추천</span>
        <span class="hero-group">${rec}</span>
        <span class="hero-name">${GROUPS[rec]}</span>
        <span class="hero-sub">${last ? `지난번 ${last.group} · ${fmtDate(last.date)} (${agoText(daysBetween(last.date, today))})` : '첫 운동을 시작해 보세요'}</span>
        <span class="hero-cta">시작하기 ›</span>
      </button>`;

  const cHint = !a && shouldSuggestC(sessions, today)
    ? `<div class="hint">이번 주에 A와 B를 모두 했어요. 시간이 되면 <b>C(하체+어깨)</b>를 추가해 보세요.</div>`
    : '';

  const groups = GROUP_KEYS.map((g) =>
    `<button class="group-btn${!a && g === rec ? ' is-rec' : ''}" data-action="start" data-group="${g}"><b>${g}</b><span>${GROUPS[g]}</span></button>`
  ).join('');

  const recent = sessions.slice(-3).reverse().map((s) => `
    <button class="card recent" data-action="go" data-to="history">
      <div class="session-head"><span class="badge">${s.group}</span><b>${fmtDate(s.date)}</b>
        <span class="muted small">${s.entries.reduce((n, e) => n + e.sets.length, 0)}세트</span></div>
      <p class="small muted clamp">${compactSummary(s)}</p>
    </button>`).join('') || '<p class="muted">아직 기록이 없어요.</p>';

  return `
    ${header('운동 기록', null)}
    <main>
      ${hero}
      ${cHint}
      <section><h2>다른 그룹 고르기</h2><div class="group-row">${groups}</div></section>
      <section><h2>최근 운동</h2><div class="stack">${recent}</div></section>
      ${backupStatusHTML()}
    </main>
    <nav class="bottom-nav">
      <button class="btn" data-action="go" data-to="history">기록</button>
      <button class="btn" data-action="go" data-to="settings">설정</button>
      <button class="btn" data-action="go" data-to="backup">백업</button>
    </nav>`;
}

// ───────────────────────── 운동 ─────────────────────────
function startWorkout(group) {
  const exs = groupExercises(group);
  if (!exs.length) return toast('이 그룹에 보이는 종목이 없어요. 설정에서 추가해 주세요.');
  const today = todayStr();
  const entries = {};
  for (const ex of exs) {
    const hist = historyFor(ex.id);
    const rec = recommend(ex, hist, today);
    const bw = isBodyweight(ex);
    const lastMemo = hist[hist.length - 1]?.memo;
    entries[ex.id] = {
      sets: Array.from({ length: ex.sets }, (_, i) => ({
        weight: bw || rec.weight == null ? '' : formatWeight(rec.weight),
        reps: String(rec.reps[i]),
        done: false,
      })),
      memo: bw ? (lastMemo || ex.defaultMemo || '') : '',
    };
  }
  state.active = {
    id: uid(), group, date: today, startedAt: new Date().toISOString(),
    order: exs.map((e) => e.id), entries, restEndsAt: null,
  };
  persist();
  go('workout');
}

function targetHTML(ex, rec) {
  const bw = isBodyweight(ex);
  const range = `${ex.repMin}~${ex.repMax}회`;
  const w = bw ? '' : rec.weight == null ? '무게 직접 입력 × ' : `${formatWeight(rec.weight)}kg × `;
  const perSet = rec.reps.every((r) => r === ex.repMin) ? '' : `<span class="muted small"> (세트별 ${rec.reps.join('/')}회)</span>`;
  return `<b>${w}${ex.sets}세트 × ${range}</b>${perSet}`;
}

function perSideText(ex, w) {
  if (ex.ladder.type !== 'barbell') return '';
  const n = num(w);
  return n == null ? '한쪽 –' : `한쪽 ${formatWeight(n / 2)}kg`;
}

function rowHTML(ex, s, i) {
  const bw = isBodyweight(ex);
  const weight = bw ? '' : `
    <div class="stepper">
      <button data-action="w-dec" aria-label="무게 한 단계 내리기">−</button>
      <div class="field-wrap"><input data-field="weight" type="text" inputmode="decimal" autocomplete="off" value="${esc(s.weight)}" placeholder="무게" aria-label="${i + 1}세트 무게"><span class="unit">kg</span></div>
      <button data-action="w-inc" aria-label="무게 한 단계 올리기">+</button>
    </div>
    ${ex.ladder.type === 'barbell' ? `<div class="per-side">${perSideText(ex, s.weight)}</div>` : ''}`;
  return `
    <div class="set-row${s.done ? ' done' : ''}" data-set="${i}">
      <div class="set-no">${i + 1}</div>
      <div class="steppers">
        ${weight}
        <div class="stepper">
          <button data-action="r-dec" aria-label="횟수 줄이기">−</button>
          <div class="field-wrap"><input data-field="reps" type="text" inputmode="decimal" autocomplete="off" value="${esc(s.reps)}" placeholder="횟수" aria-label="${i + 1}세트 횟수"><span class="unit">회</span></div>
          <button data-action="r-inc" aria-label="횟수 늘리기">+</button>
        </div>
      </div>
      <button class="check" data-action="toggle-done" aria-pressed="${s.done}" aria-label="${i + 1}세트 완료">${s.done ? '✓' : '완료'}</button>
    </div>`;
}

function cardHTML(id, idx) {
  const a = state.active;
  const ex = exById(id);
  const entry = a.entries[id];
  if (!ex || !entry) return '';
  const bw = isBodyweight(ex);
  const hist = historyFor(id);
  const rec = recommend(ex, hist, a.date);
  const last = hist[hist.length - 1];
  const lastText = last
    ? `${formatSets(last.sets, bw)} <span class="muted">· ${fmtDate(last.date)}</span>${last.memo ? `<span class="muted"> · ${esc(last.memo)}</span>` : ''}`
    : '<span class="muted">없음</span>';
  const doneN = entry.sets.filter((s) => s.done).length;
  const showHint = ex.hint && (!last || bw);
  return `
    <article class="card ex-card${doneN >= entry.sets.length ? ' all-done' : ''}" id="card-${esc(id)}" data-ex="${esc(id)}" data-idx="${idx}">
      <div class="ex-head">
        <h3>${idx + 1}. ${esc(ex.name)}</h3>
        <span class="tag">${unitTag(ex)}</span>
        <span class="done-count">${doneN}/${entry.sets.length}</span>
      </div>
      ${ex.desc ? `<p class="desc">${esc(ex.desc)}</p>` : ''}
      <p class="line"><span class="lbl">지난번</span> ${lastText}</p>
      <p class="line"><span class="lbl">오늘 목표</span> ${targetHTML(ex, rec)}</p>
      ${rec.note ? `<p class="note">${esc(rec.note)}</p>` : ''}
      <p class="reason k-${rec.kind}">${esc(rec.reason)}</p>
      ${showHint ? `<p class="small muted">${esc(ex.hint)}</p>` : ''}
      <div class="sets">${entry.sets.map((s, i) => rowHTML(ex, s, i)).join('')}</div>
      <div class="card-foot">
        <input class="memo" data-field="memo" type="text" autocomplete="off" value="${esc(entry.memo)}" placeholder="메모 (예: 반동 있음, 손목 통증)" aria-label="${esc(ex.name)} 메모">
        <button class="btn small" data-action="add-set">+ 세트</button>
      </div>
    </article>`;
}

function restBarHTML() {
  const a = state.active;
  if (!a) return '';
  if (a.restEndsAt && a.restEndsAt > Date.now()) {
    const left = Math.ceil((a.restEndsAt - Date.now()) / 1000);
    return `
      <div class="rest-info"><span class="rest-label">휴식</span><span class="rest-time" id="rest-time">${mmss(left)}</span></div>
      <button class="btn" data-action="rest-adj" data-d="-15">−15초</button>
      <button class="btn" data-action="rest-adj" data-d="15">+15초</button>
      <button class="btn primary" data-action="rest-skip">끝</button>`;
  }
  return `
    <div class="rest-info"><span class="rest-label">완료</span><span class="rest-count">${countDone(a)}세트</span></div>
    <button class="btn" data-action="rest-start">휴식 ${mmss(state.settings.restSeconds)}</button>
    <button class="btn primary" data-action="finish">운동 종료</button>`;
}

function renderRestBar() {
  const el = document.getElementById('restbar');
  if (el) el.innerHTML = restBarHTML();
}

function rerenderCard(id) {
  const el = document.getElementById(`card-${id}`);
  if (el) el.outerHTML = cardHTML(id, Number(el.dataset.idx));
}

function viewWorkout() {
  const a = state.active;
  return `
    ${header(`${a.group} ${GROUPS[a.group]}`, 'home', `<span class="muted small">${fmtDate(a.date)}</span>`)}
    <main class="workout">
      ${a.order.map((id, i) => cardHTML(id, i)).join('')}
      <button class="btn primary big block" data-action="finish">운동 종료하고 저장</button>
      <button class="btn block ghost" data-action="cancel-workout">운동 취소 (기록하지 않음)</button>
    </main>
    <div class="bottom-bar" id="restbar">${restBarHTML()}</div>`;
}

function ctx(el) {
  const card = el.closest('[data-ex]');
  const row = el.closest('[data-set]');
  const id = card?.dataset.ex;
  return { ex: exById(id), entry: state.active?.entries[id], i: row ? Number(row.dataset.set) : -1 };
}

/** i번째 세트 무게 변경 + 아직 안 한 뒤 세트에도 같은 무게 반영 */
function applyWeight(entry, i, value) {
  const old = entry.sets[i].weight;
  entry.sets[i].weight = value;
  const changed = [];
  for (let j = i + 1; j < entry.sets.length; j++) {
    const s = entry.sets[j];
    if (!s.done && (s.weight === old || s.weight === '')) {
      s.weight = value;
      changed.push(j);
    }
  }
  return changed;
}

function stepWeight(btn, dir) {
  const { ex, entry, i } = ctx(btn);
  if (!ex) return;
  const ladder = buildLadder(ex.ladder);
  const cur = num(entry.sets[i].weight);
  let next;
  if (cur === null) {
    if (dir < 0) return;
    next = recommend(ex, historyFor(ex.id), state.active.date).weight ?? ladder[0] ?? 0;
  } else {
    next = dir > 0 ? stepUp(ladder, cur) : stepDown(ladder, cur);
  }
  applyWeight(entry, i, formatWeight(next));
  persist();
  rerenderCard(ex.id);
}

function stepReps(btn, dir) {
  const { ex, entry, i } = ctx(btn);
  if (!ex) return;
  const cur = num(entry.sets[i].reps) ?? 0;
  entry.sets[i].reps = String(Math.max(0, Math.min(999, Math.round(cur) + dir)));
  persist();
  rerenderCard(ex.id);
}

function toggleDone(btn) {
  const { ex, entry, i } = ctx(btn);
  if (!ex) return;
  const s = entry.sets[i];
  if (!s.done) {
    const reps = num(s.reps);
    if (reps === null || reps <= 0) return toast('횟수를 입력해 주세요.');
    s.reps = String(Math.round(reps));
    if (!isBodyweight(ex)) {
      const w = num(s.weight);
      if (w === null || w < 0) return toast('무게를 입력해 주세요.');
      s.weight = formatWeight(w);
    }
    s.done = true;
    unlockAudio();
    startRest();
  } else {
    s.done = false;
  }
  persist();
  rerenderCard(ex.id);
  renderRestBar();
}

function startRest(sec = state.settings.restSeconds) {
  state.active.restEndsAt = Date.now() + sec * 1000;
}

async function finishWorkout() {
  const a = state.active;
  const entries = a.order.map((id) => {
    const ex = exById(id);
    const e = a.entries[id];
    if (!ex || !e) return null;
    const bw = isBodyweight(ex);
    return {
      exerciseId: id,
      name: ex.name,
      memo: (e.memo || '').trim(),
      sets: e.sets.filter((s) => s.done).map((s) => ({ weight: bw ? null : num(s.weight), reps: num(s.reps) })),
    };
  }).filter((e) => e && e.sets.length);

  if (!entries.length) {
    if (await confirmDialog('완료(체크)한 세트가 없어요.\n기록 없이 운동을 끝낼까요?', '기록 없이 끝내기', true)) {
      state.active = null;
      persist();
      go('home');
    }
    return;
  }
  const total = entries.reduce((n, e) => n + e.sets.length, 0);
  if (!(await confirmDialog(`운동을 끝내고 저장할까요?\n완료 ${total}세트 (체크한 세트만 기록돼요)`, '저장하고 끝내기'))) return;
  const session = { id: a.id, group: a.group, date: a.date, startedAt: a.startedAt, endedAt: new Date().toISOString(), entries };
  state.sessions.push(session);
  state.sessions.sort(cmpSession);
  state.active = null;
  persist();
  go('summary', { id: session.id });
}

// ───────────────────────── 휴식 타이머 / 화면 켜짐 / 소리 ─────────────────────────
let wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener?.('release', () => { wakeLock = null; });
    }
  } catch {
    wakeLock = null; // 지원 안 하거나 실패해도 그냥 넘어감
  }
}
async function releaseWakeLock() {
  try { await wakeLock?.release(); } catch { /* 무시 */ }
  wakeLock = null;
}

let audioCtx = null;
function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* 무시 */ }
}
function beep() {
  if (!state.settings.sound || !audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    [0, 0.25, 0.5].forEach((d) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.3, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.18);
      o.connect(g).connect(audioCtx.destination);
      o.start(t + d);
      o.stop(t + d + 0.2);
    });
  } catch { /* 무시 */ }
}

setInterval(() => {
  const a = state.active;
  if (view.name !== 'workout' || !a?.restEndsAt) return;
  const left = Math.ceil((a.restEndsAt - Date.now()) / 1000);
  if (left <= 0) {
    const late = Date.now() - a.restEndsAt > 10000; // 앱을 오래 닫았다 연 경우엔 알림 생략
    a.restEndsAt = null;
    persist();
    renderRestBar();
    if (!late) {
      beep();
      try { navigator.vibrate?.([200, 100, 200]); } catch { /* 무시 */ }
      toast('휴식 끝! 다음 세트를 시작하세요');
    }
  } else {
    const el = document.getElementById('rest-time');
    if (el) el.textContent = mmss(left);
  }
}, 250);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && view.name === 'workout') requestWakeLock();
});

// ───────────────────────── 운동 요약 ─────────────────────────
function viewSummary() {
  const s = state.sessions.find((x) => x.id === view.params.id);
  if (!s) return viewHome();
  let ups = 0;
  const lines = s.entries.map((e) => {
    const ex = exById(e.exerciseId);
    const name = ex?.name || e.name;
    const bw = ex ? isBodyweight(ex) : false;
    const prev = historyFor(e.exerciseId, s.id).pop();
    let change;
    if (bw) {
      const cur = e.sets.reduce((n, x) => n + x.reps, 0);
      const p = prev ? prev.sets.reduce((n, x) => n + x.reps, 0) : null;
      change = p == null ? `<span>첫 기록</span>`
        : cur > p ? `<span class="up">▲ 총 ${p}→${cur}회</span>`
        : cur < p ? `<span class="down">▼ 총 ${p}→${cur}회</span>` : `<span class="muted">= 총 ${cur}회</span>`;
    } else {
      const cur = Math.max(...e.sets.map((x) => x.weight || 0));
      const p = prev ? Math.max(...prev.sets.map((x) => x.weight || 0)) : null;
      if (p != null && cur > p) ups++;
      change = p == null ? `<span>첫 기록 ${formatWeight(cur)}kg</span>`
        : cur > p ? `<span class="up">▲ ${formatWeight(p)}→${formatWeight(cur)}kg</span>`
        : cur < p ? `<span class="down">▼ ${formatWeight(p)}→${formatWeight(cur)}kg</span>` : `<span class="muted">= ${formatWeight(cur)}kg</span>`;
    }
    return `<div class="sum-line"><div><b>${esc(name)}</b><div class="small muted">${formatSets(e.sets, bw)}</div></div>${change}</div>`;
  }).join('');
  const total = s.entries.reduce((n, e) => n + e.sets.length, 0);
  const mins = s.startedAt && s.endedAt ? Math.max(1, Math.round((new Date(s.endedAt) - new Date(s.startedAt)) / 60000)) : null;
  return `
    ${header('운동 완료', null)}
    <main>
      <div class="done-banner">수고했어요! <b>${s.group} ${GROUPS[s.group]}</b> 저장 완료</div>
      <div class="stat-row">
        <div class="stat"><b>${total}</b><span>총 세트</span></div>
        <div class="stat"><b>${ups}</b><span>무게 올린 종목</span></div>
        <div class="stat"><b>${mins ?? '–'}</b><span>분</span></div>
      </div>
      <section class="card">${lines}</section>
    </main>
    <nav class="bottom-nav one"><button class="btn primary big" data-action="go" data-to="home">홈으로</button></nav>`;
}

// ───────────────────────── 기록 ─────────────────────────
function sessionCardHTML(s) {
  const lines = s.entries.map((e) => {
    const ex = exById(e.exerciseId);
    const name = ex?.name || e.name || '종목';
    const bw = ex ? isBodyweight(ex) : e.sets.every((x) => x.weight == null);
    return `<div class="entry-line"><span>${esc(name)}</span><span class="rec">${formatSets(e.sets, bw)}</span></div>${e.memo ? `<div class="entry-memo">메모: ${esc(e.memo)}</div>` : ''}`;
  }).join('');
  const n = s.entries.reduce((k, e) => k + e.sets.length, 0);
  return `
    <article class="card session">
      <div class="session-head"><span class="badge">${s.group}</span><b>${fmtDate(s.date)}</b>
        <span class="muted small">${GROUPS[s.group]} · ${n}세트</span>
        <button class="link-btn danger-text" data-action="hist-delete" data-id="${esc(s.id)}">삭제</button></div>
      ${lines}
    </article>`;
}

function viewHistory() {
  const tab = view.params.tab || 'list';
  const seg = `<div class="seg">
    <button class="${tab === 'list' ? 'on' : ''}" data-action="go" data-to="history" data-tab="list">날짜별</button>
    <button class="${tab === 'chart' ? 'on' : ''}" data-action="go" data-to="history" data-tab="chart">종목별 그래프</button></div>`;
  let body;
  if (tab === 'list') {
    body = sortedSessions().reverse().map(sessionCardHTML).join('') || '<p class="muted">아직 기록이 없어요.</p>';
  } else {
    const withHist = state.exercises.filter((e) => historyFor(e.id).length);
    if (!withHist.length) {
      body = '<p class="muted">아직 기록이 없어요.</p>';
    } else {
      const exId = withHist.some((e) => e.id === view.params.exId) ? view.params.exId : withHist[0].id;
      const ex = exById(exId);
      const bw = isBodyweight(ex);
      const hist = historyFor(exId);
      const pts = hist.slice(-20).map((h) => ({
        label: h.date.slice(5).replace('-', '/'),
        value: bw ? h.sets.reduce((n, x) => n + x.reps, 0) : Math.max(...h.sets.map((x) => x.weight || 0)),
      }));
      const opts = GROUP_KEYS.map((g) => {
        const list = withHist.filter((e) => e.group === g);
        return list.length ? `<optgroup label="${g} ${GROUPS[g]}">${list.map((e) => `<option value="${esc(e.id)}"${e.id === exId ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</optgroup>` : '';
      }).join('');
      body = `
        <select class="input" data-field="chart-ex" aria-label="종목 선택">${opts}</select>
        <section class="card chart">
          <h2>${bw ? '총 횟수 변화 (회)' : '최고 무게 변화 (kg)'}</h2>
          ${lineChartSVG(pts, { unit: bw ? '회' : 'kg' })}
        </section>
        <section class="card">${hist.slice(-10).reverse().map((h) =>
          `<div class="entry-line"><span>${fmtDate(h.date)}</span><span class="rec">${formatSets(h.sets, bw)}</span></div>`).join('')}</section>`;
    }
  }
  return `${header('기록')}<main>${seg}${body}</main>`;
}

// ───────────────────────── 설정 ─────────────────────────
function viewSettings() {
  const lists = GROUP_KEYS.map((g) => {
    const items = groupExercises(g, true).map((e) => `
      <div class="ex-item${e.hidden ? ' is-hidden' : ''}">
        <div class="ex-item-main"><b>${esc(e.name)}${e.hidden ? ' <span class="tag">숨김</span>' : ''}</b>
          <span class="small muted">${LADDER_TYPES[e.ladder.type]} · ${e.sets}세트 · ${e.repMin}~${e.repMax}회${isBodyweight(e) ? '' : ` · 시작 ${e.startWeight == null ? '없음' : formatWeight(e.startWeight) + 'kg'}`}</span></div>
        <button class="icon-btn" data-action="ex-move" data-id="${esc(e.id)}" data-d="-1" aria-label="위로">▲</button>
        <button class="icon-btn" data-action="ex-move" data-id="${esc(e.id)}" data-d="1" aria-label="아래로">▼</button>
        <button class="btn small" data-action="go" data-to="edit" data-id="${esc(e.id)}">편집</button>
      </div>`).join('');
    return `<section class="card"><h2>${g} ${GROUPS[g]}</h2>${items}
      <button class="btn block" data-action="go" data-to="edit" data-group="${g}">+ ${g}에 종목 추가</button></section>`;
  }).join('');

  return `
    ${header('설정')}
    <main>
      <section class="card">
        <h2>휴식 시간</h2>
        <div class="stepper wide">
          <button data-action="rest-setting" data-d="-15" aria-label="15초 줄이기">−</button>
          <div class="field-wrap"><input data-field="restSeconds" type="text" inputmode="decimal" value="${state.settings.restSeconds}" aria-label="휴식 시간(초)"><span class="unit">초</span></div>
          <button data-action="rest-setting" data-d="15" aria-label="15초 늘리기">+</button>
        </div>
        <label class="toggle"><input type="checkbox" data-field="sound"${state.settings.sound ? ' checked' : ''}><span>휴식 끝 알림음</span></label>
      </section>
      <h2 class="section-title">종목 편집</h2>
      ${lists}
      <section class="card">
        <h2>백업</h2>
        <button class="btn block" data-action="go" data-to="backup">백업과 복원 ›</button>
      </section>
      <section class="card">
        <h2>위험 구역</h2>
        <button class="btn danger block" data-action="wipe-all">모든 데이터 삭제</button>
      </section>
      <p class="muted small center" id="app-version">앱 버전: –</p>
    </main>`;
}

function ladderPreview(spec) {
  if (spec.type === 'bodyweight') return '맨몸: 무게 없이 횟수만 기록해요.';
  const L = buildLadder(spec);
  return `사다리: ${L.slice(0, 14).map(formatWeight).join(', ')}${L.length > 14 ? ' …' : ''} kg`;
}

function viewEdit() {
  const isNew = !view.params.id;
  const ex = isNew
    ? normalizeExercise({ id: '', group: view.params.group || 'A', name: '', ladder: { type: 'machine' }, sets: 3, repMin: 8, repMax: 12 })
    : exById(view.params.id);
  if (!ex) return viewSettings();
  const t = ex.ladder.type;
  const typeOpts = Object.entries(LADDER_TYPES).map(([k, v]) => `<option value="${k}"${k === t ? ' selected' : ''}>${v}</option>`).join('');
  const groupOpts = GROUP_KEYS.map((g) => `<option value="${g}"${g === ex.group ? ' selected' : ''}>${g} ${GROUPS[g]}</option>`).join('');
  return `
    ${header(isNew ? '종목 추가' : '종목 편집', 'settings')}
    <main>
      <form class="card form" id="ex-form" data-type="${t}" onsubmit="return false">
        <label class="fld"><span>이름</span><input class="input" name="exName" type="text" value="${esc(ex.name)}" placeholder="예: 레그프레스"></label>
        <label class="fld"><span>설명 (선택)</span><input class="input" name="desc" type="text" value="${esc(ex.desc)}" placeholder="예: 서서 위로"></label>
        <label class="fld"><span>그룹</span><select class="input" name="group">${groupOpts}</select></label>
        <label class="fld"><span>무게 사다리 종류</span><select class="input" name="ladderType" data-field="ladder">${typeOpts}</select></label>
        <div class="row2 custom-only">
          <label class="fld"><span>간격 (kg)</span><input class="input" name="step" data-field="ladder" type="text" inputmode="decimal" value="${formatWeight(ex.ladder.step ?? CONFIG.CUSTOM_DEFAULT_STEP)}"></label>
          <label class="fld"><span>가장 가벼운 무게 (kg)</span><input class="input" name="start" data-field="ladder" type="text" inputmode="decimal" value="${formatWeight(ex.ladder.start ?? 0)}"></label>
        </div>
        <p class="small muted" id="ladder-preview">${ladderPreview(ex.ladder)}</p>
        <div class="row3">
          <label class="fld"><span>세트 수</span><input class="input" name="sets" type="text" inputmode="decimal" value="${ex.sets}"></label>
          <label class="fld"><span>최소 횟수</span><input class="input" name="repMin" type="text" inputmode="decimal" value="${ex.repMin}"></label>
          <label class="fld"><span>최대 횟수</span><input class="input" name="repMax" type="text" inputmode="decimal" value="${ex.repMax}"></label>
        </div>
        <label class="fld weight-only"><span>시작 무게 (kg, 비우면 첫날 직접 입력)</span><input class="input" name="startWeight" type="text" inputmode="decimal" value="${ex.startWeight == null ? '' : formatWeight(ex.startWeight)}" placeholder="없음"></label>
        <label class="fld"><span>시작 횟수 (비우면 최소 횟수)</span><input class="input" name="startReps" type="text" inputmode="decimal" value="${ex.startReps ?? ''}" placeholder="최소 횟수"></label>
        <label class="fld"><span>참고 메모 (첫 운동 때 보여요)</span><input class="input" name="hint" type="text" value="${esc(ex.hint)}" placeholder="예: 예전 기록 8.75kg×10"></label>
        <label class="toggle"><input type="checkbox" name="hidden"${ex.hidden ? ' checked' : ''}><span>숨기기 (운동 화면에 안 보임)</span></label>
        <p class="error" id="form-error"></p>
        <button class="btn primary big block" data-action="save-exercise" data-id="${esc(ex.id)}">저장</button>
        <button class="btn block" data-action="go" data-to="settings">취소</button>
      </form>
    </main>`;
}

function readLadderFromForm(f) {
  const type = f.ladderType.value;
  const spec = { type };
  if (type === 'custom') {
    spec.step = num(f.step.value);
    spec.start = num(f.start.value) ?? 0;
  }
  return spec;
}

function saveExercise(btn) {
  const f = document.getElementById('ex-form');
  const err = (m) => { document.getElementById('form-error').textContent = m; };
  const name = f.exName.value.trim();
  if (!name) return err('이름을 입력해 주세요.');
  const sets = num(f.sets.value), repMin = num(f.repMin.value), repMax = num(f.repMax.value);
  if (!Number.isInteger(sets) || sets < 1 || sets > 10) return err('세트 수는 1~10 사이 정수로 입력해 주세요.');
  if (!Number.isInteger(repMin) || !Number.isInteger(repMax) || repMin < 1 || repMax > 100) return err('횟수는 1~100 사이 정수로 입력해 주세요.');
  if (repMin > repMax) return err('최소 횟수가 최대 횟수보다 클 수 없어요.');
  const ladder = readLadderFromForm(f);
  if (ladder.type === 'custom' && !(ladder.step > 0)) return err('간격은 0보다 큰 숫자로 입력해 주세요.');
  const swRaw = f.startWeight.value.trim();
  const startWeight = swRaw === '' ? null : num(swRaw);
  if (swRaw !== '' && (startWeight === null || startWeight < 0)) return err('시작 무게는 0 이상의 숫자로 입력해 주세요.');
  const srRaw = f.startReps.value.trim();
  const startReps = srRaw === '' ? null : num(srRaw);
  if (srRaw !== '' && (!Number.isInteger(startReps) || startReps < 1)) return err('시작 횟수는 1 이상의 정수로 입력해 주세요.');

  const id = btn.dataset.id || `x-${uid()}`;
  const old = exById(id) || {};
  const data = normalizeExercise({
    ...old, id, name, desc: f.desc.value.trim(), hint: f.hint.value.trim(), group: f.group.value,
    ladder, sets, repMin, repMax, startWeight, startReps, hidden: f.hidden.checked,
  });
  const idx = state.exercises.findIndex((e) => e.id === id);
  if (idx >= 0) state.exercises[idx] = data;
  else state.exercises.push(data);
  persist();
  toast('저장했어요.');
  go('settings');
}

function moveExercise(id, d) {
  const list = state.exercises;
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) return;
  let j = i + d;
  while (j >= 0 && j < list.length && list[j].group !== list[i].group) j += d;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  persist();
  render();
}

// ───────────────────────── 백업 ─────────────────────────
function viewBackup() {
  const lb = state.lastBackupAt;
  const showText = view.params.showText;
  return `
    ${header('백업과 복원')}
    <main>
      <section class="card stack">
        <h2>백업</h2>
        <p>마지막 백업: <b>${lb ? `${fmtDate(localDate(new Date(lb)))} (${agoText(daysBetween(localDate(new Date(lb)), todayStr()))})` : '없음'}</b></p>
        <p class="small muted">전체 데이터를 글자(JSON)로 복사해요. 메모 앱이나 '나에게 보내기' 등에 붙여넣어 보관하세요.</p>
        <button class="btn primary big block" data-action="backup-copy">백업 복사</button>
        <button class="btn block" data-action="backup-show">글자로 보기</button>
        ${showText ? `<textarea class="input" id="backup-text" readonly rows="6">${esc(exportBackup(state))}</textarea>
          <p class="small muted">글자를 길게 눌러 '전체 선택' → '복사'하세요.</p>
          <button class="btn block" data-action="backup-mark">직접 복사했어요</button>` : ''}
      </section>
      <section class="card stack">
        <h2>복원</h2>
        <p class="small muted">백업해 둔 글자를 아래에 붙여넣고 복원을 누르세요. <b>지금 폰에 있는 데이터는 덮어써져요.</b></p>
        <textarea class="input" id="restore-text" rows="6" placeholder="여기에 백업 글자 붙여넣기"></textarea>
        <p class="error" id="restore-error"></p>
        <button class="btn danger block" data-action="restore">복원</button>
      </section>
      <p class="small muted center">저장 공간 보호(persist): ${storagePersisted === true ? '켜짐' : storagePersisted === false ? '브라우저가 허용 안 함 (백업을 꼭 해 두세요)' : '확인 중'}</p>
    </main>`;
}

async function copyBackup() {
  const text = exportBackup(state);
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      ok = document.execCommand('copy');
      ta.remove();
    } catch { ok = false; }
  }
  if (ok) {
    state.lastBackupAt = new Date().toISOString();
    persist();
    view.params.showText = false;
    render();
    toast('백업을 복사했어요. 메모 앱 등에 붙여넣어 보관하세요.', 4000);
  } else {
    view.params.showText = true;
    render();
    const ta = document.getElementById('backup-text');
    ta?.focus();
    ta?.select();
    toast('자동 복사가 안 돼요. 아래 글자를 직접 복사해 주세요.', 4000);
  }
}

async function restoreBackup() {
  const text = document.getElementById('restore-text').value;
  const errEl = document.getElementById('restore-error');
  const res = parseBackup(text);
  if (!res.ok) { errEl.textContent = res.error; return; }
  errEl.textContent = '';
  const ok = await confirmDialog(
    `백업을 복원할까요?\n운동 기록 ${res.counts.sessions}개, 종목 ${res.counts.exercises}개\n\n지금 폰에 있는 데이터(진행 중인 운동 포함)는 모두 덮어써져요.`,
    '덮어쓰고 복원', true);
  if (!ok) return;
  state = res.state;
  persist();
  toast('복원했어요.');
  go('home');
}

// ───────────────────────── 이벤트 ─────────────────────────
const VIEWS = { home: viewHome, workout: viewWorkout, summary: viewSummary, history: viewHistory, settings: viewSettings, edit: viewEdit, backup: viewBackup };

const actions = {
  go: (b) => {
    const { to, action, ...params } = b.dataset;
    go(to, params);
  },
  resume: () => go('workout'),
  start: async (b) => {
    const g = b.dataset.group;
    if (state.active) {
      if (state.active.group === g) return go('workout');
      const ok = await confirmDialog(`진행 중인 ${state.active.group} 운동이 있어요.\n그 운동을 버리고 ${g}를 새로 시작할까요?`, '버리고 새로 시작', true);
      if (!ok) return;
    }
    startWorkout(g);
  },
  'w-inc': (b) => stepWeight(b, 1),
  'w-dec': (b) => stepWeight(b, -1),
  'r-inc': (b) => stepReps(b, 1),
  'r-dec': (b) => stepReps(b, -1),
  'toggle-done': toggleDone,
  'add-set': (b) => {
    const { ex, entry } = ctx(b);
    const lastSet = entry.sets[entry.sets.length - 1];
    entry.sets.push({ weight: lastSet?.weight ?? '', reps: lastSet?.reps ?? String(ex.repMin), done: false });
    persist();
    rerenderCard(ex.id);
  },
  finish: finishWorkout,
  'cancel-workout': async () => {
    if (await confirmDialog('운동을 취소할까요?\n이번 운동의 체크한 세트도 모두 기록되지 않아요.', '운동 취소', true)) {
      state.active = null;
      persist();
      go('home');
    }
  },
  'rest-start': () => { unlockAudio(); startRest(); persist(); renderRestBar(); },
  'rest-adj': (b) => {
    const a = state.active;
    if (!a.restEndsAt) return;
    a.restEndsAt = Math.max(Date.now() + 1000, a.restEndsAt + Number(b.dataset.d) * 1000);
    persist();
    renderRestBar();
  },
  'rest-skip': () => { state.active.restEndsAt = null; persist(); renderRestBar(); },
  'hist-delete': async (b) => {
    if (!(await confirmDialog('이 운동 기록을 삭제할까요?\n삭제하면 되돌릴 수 없어요.', '삭제', true))) return;
    state.sessions = state.sessions.filter((s) => s.id !== b.dataset.id);
    persist();
    render();
  },
  'rest-setting': (b) => {
    state.settings.restSeconds = Math.min(900, Math.max(15, state.settings.restSeconds + Number(b.dataset.d)));
    persist();
    render();
  },
  'ex-move': (b) => moveExercise(b.dataset.id, Number(b.dataset.d)),
  'save-exercise': saveExercise,
  'wipe-all': async () => {
    if (!(await confirmDialog('모든 운동 기록과 설정을 삭제할까요?\n되돌릴 수 없어요. 먼저 백업해 두세요.', '모두 삭제', true))) return;
    state = defaultState();
    persist();
    toast('모든 데이터를 삭제했어요.');
    go('home');
  },
  'backup-copy': copyBackup,
  'backup-show': () => { view.params.showText = true; render(); },
  'backup-mark': () => {
    state.lastBackupAt = new Date().toISOString();
    persist();
    view.params.showText = false;
    render();
    toast('백업 날짜를 기록했어요.');
  },
  restore: restoreBackup,
};

app.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b || b.disabled) return;
  const fn = actions[b.dataset.action];
  if (fn) {
    e.preventDefault();
    fn(b);
  }
});

app.addEventListener('input', (e) => {
  const t = e.target;
  const f = t.dataset.field;
  if (!f) return;
  if (view.name === 'workout' && state.active) {
    const { ex, entry, i } = ctx(t);
    if (!ex || !entry) return;
    if (f === 'memo') entry.memo = t.value;
    else if (f === 'reps') entry.sets[i].reps = t.value;
    else if (f === 'weight') {
      const changed = applyWeight(entry, i, t.value);
      const card = t.closest('[data-ex]');
      for (const j of [i, ...changed]) {
        const row = card.querySelector(`[data-set="${j}"]`);
        if (j !== i) row.querySelector('[data-field="weight"]').value = t.value;
        const ps = row.querySelector('.per-side');
        if (ps) ps.textContent = perSideText(ex, t.value);
      }
    }
    persist();
  } else if (view.name === 'edit' && f === 'ladder') {
    const form = document.getElementById('ex-form');
    const spec = readLadderFromForm(form);
    form.dataset.type = spec.type;
    document.getElementById('ladder-preview').textContent = ladderPreview(spec);
  }
});

app.addEventListener('change', (e) => {
  const t = e.target;
  const f = t.dataset.field;
  if (f === 'chart-ex') { view.params.exId = t.value; render(); }
  else if (f === 'restSeconds') {
    const v = num(t.value);
    if (v !== null) state.settings.restSeconds = Math.min(900, Math.max(15, Math.round(v)));
    persist();
    render();
  } else if (f === 'sound') { state.settings.sound = t.checked; persist(); }
  else if (f === 'ladder' && view.name === 'edit') {
    const form = document.getElementById('ex-form');
    form.dataset.type = form.ladderType.value;
  }
});

// ───────────────────────── 시작 ─────────────────────────
(async () => {
  try {
    if (navigator.storage?.persist) {
      storagePersisted = (await navigator.storage.persisted?.()) || (await navigator.storage.persist());
    }
  } catch { storagePersisted = false; }
  if (view.name === 'backup') render();
})();

// 진행 중인 운동이 있으면 바로 운동 화면으로 복구
go(state.active ? 'workout' : 'home');

// 서비스 워커 (오프라인 + 업데이트)
if ('serviceWorker' in navigator) {
  let updateRequested = false;
  const showUpdate = (worker) => {
    if (document.getElementById('update-banner')) return;
    const el = document.createElement('div');
    el.id = 'update-banner';
    el.innerHTML = '<span>새 버전이 있어요.</span><button class="btn primary small">업데이트</button>';
    el.querySelector('button').addEventListener('click', () => {
      updateRequested = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    });
    document.body.appendChild(el);
  };
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w);
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateRequested) location.reload();
  });
}
