/**
 * storage.js — 폰 안(localStorage) 저장, 스키마 버전, 백업/복원 검사
 */
import { CONFIG, LADDER_TYPES } from './progression.js';
import { DEFAULT_EXERCISES, GROUPS } from './defaults.js';

export const APP_ID = 'gym-tracker';
export const SCHEMA_VERSION = 1;
const KEY = 'gym-tracker-data';

const clone = (x) => JSON.parse(JSON.stringify(x));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toNum(v, d = null) {
  if (v === '' || v === null || v === undefined) return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)));

export function defaultState() {
  return {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    settings: { restSeconds: CONFIG.DEFAULT_REST_SECONDS, sound: true },
    exercises: clone(DEFAULT_EXERCISES),
    sessions: [],
    active: null,
    lastBackupAt: null,
  };
}

export function normalizeExercise(e) {
  const type = Object.hasOwn(LADDER_TYPES, e?.ladder?.type) ? e.ladder.type : 'machine';
  const ladder = { type };
  if (type === 'custom') {
    ladder.step = Math.max(CONFIG.CUSTOM_MIN_STEP, toNum(e.ladder.step, CONFIG.CUSTOM_DEFAULT_STEP));
    ladder.start = Math.max(0, toNum(e.ladder.start, 0));
  }
  let repMin = clampInt(toNum(e.repMin, 8), 1, 100);
  let repMax = clampInt(toNum(e.repMax, 12), 1, 100);
  if (repMax < repMin) [repMin, repMax] = [repMax, repMin];
  const sw = toNum(e.startWeight, null);
  const sr = toNum(e.startReps, null);
  return {
    id: String(e.id),
    group: Object.hasOwn(GROUPS, e.group) ? e.group : 'A',
    name: String(e.name || '이름 없음'),
    desc: String(e.desc || ''),
    hint: String(e.hint || ''),
    defaultMemo: String(e.defaultMemo || ''),
    ladder,
    sets: clampInt(toNum(e.sets, 3), 1, 10),
    repMin,
    repMax,
    startWeight: sw === null ? null : Math.max(0, sw),
    startReps: sr === null ? null : clampInt(sr, 1, 100),
    hidden: !!e.hidden,
  };
}

function normalizeSession(s) {
  return {
    id: String(s.id || Math.random().toString(36).slice(2)),
    group: Object.hasOwn(GROUPS, s.group) ? s.group : 'A',
    date: String(s.date),
    startedAt: s.startedAt || null,
    endedAt: s.endedAt || null,
    entries: (s.entries || []).map((e) => ({
      exerciseId: String(e.exerciseId),
      name: String(e.name || ''),
      memo: String(e.memo || ''),
      sets: (e.sets || []).map((x) => ({ weight: toNum(x.weight, null), reps: toNum(x.reps, 0) })),
    })),
  };
}

/** 저장된 데이터를 현재 스키마로 맞춤 (앞으로 스키마가 바뀌면 여기에 변환 추가) */
export function migrate(raw) {
  const base = defaultState();
  // if (raw.schemaVersion < 2) { ...v1 → v2 변환... }
  return {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    settings: {
      restSeconds: clampInt(toNum(raw?.settings?.restSeconds, base.settings.restSeconds), 10, 900),
      sound: raw?.settings?.sound !== false,
    },
    exercises: Array.isArray(raw?.exercises) ? raw.exercises.map(normalizeExercise) : base.exercises,
    sessions: Array.isArray(raw?.sessions) ? raw.sessions.map(normalizeSession) : [],
    active: raw?.active && typeof raw.active === 'object' ? raw.active : null,
    lastBackupAt: raw?.lastBackupAt || null,
  };
}

export function loadState() {
  let txt = null;
  try {
    txt = localStorage.getItem(KEY);
    if (!txt) return defaultState();
    return migrate(JSON.parse(txt));
  } catch {
    // 데이터가 깨졌으면 덮어쓰기 전에 따로 보관
    try { if (txt) localStorage.setItem(`${KEY}-broken-${Date.now()}`, txt); } catch { /* 무시 */ }
    return defaultState();
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** 백업용 JSON 텍스트 (진행 중인 운동은 제외) */
export function exportBackup(state) {
  const { active, ...rest } = state;
  return JSON.stringify({ ...rest, app: APP_ID, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString() });
}

/**
 * 붙여넣은 백업 텍스트 검사.
 * @returns {{ok:true, state:object, counts:{sessions:number, exercises:number}} | {ok:false, error:string}}
 */
export function parseBackup(text) {
  const fail = (error) => ({ ok: false, error });
  let obj;
  try {
    obj = JSON.parse(String(text || '').trim());
  } catch {
    return fail('백업 형식(JSON)이 아니에요. 백업 글자 전체를 빠짐없이 붙여넣었는지 확인해 주세요.');
  }
  if (!obj || typeof obj !== 'object' || obj.app !== APP_ID) return fail('이 앱의 백업 데이터가 아니에요.');
  if (typeof obj.schemaVersion !== 'number') return fail('백업에 스키마 버전이 없어요.');
  if (obj.schemaVersion > SCHEMA_VERSION) return fail('더 새로운 버전 앱에서 만든 백업이에요. 앱을 업데이트한 뒤 복원해 주세요.');
  if (!Array.isArray(obj.exercises) || !Array.isArray(obj.sessions)) return fail('종목 목록이나 운동 기록이 없어요.');
  for (const e of obj.exercises) {
    if (!e || typeof e.id !== 'string' || typeof e.name !== 'string' || !Object.hasOwn(GROUPS, e.group)) {
      return fail('종목 데이터 형식이 올바르지 않아요.');
    }
  }
  for (const s of obj.sessions) {
    if (!s || !DATE_RE.test(String(s.date)) || !Array.isArray(s.entries) || s.entries.some((e) => !Array.isArray(e?.sets))) {
      return fail('운동 기록 데이터 형식이 올바르지 않아요.');
    }
  }
  const state = migrate(obj);
  state.active = null;
  state.lastBackupAt = obj.exportedAt || obj.lastBackupAt || null;
  return { ok: true, state, counts: { sessions: state.sessions.length, exercises: state.exercises.length } };
}
