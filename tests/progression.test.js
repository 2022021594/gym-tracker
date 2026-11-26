import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLadder, stepUp, stepDown, stepBy, snapToLadder, recommend,
  nextGroup, shouldSuggestC, weekStart, daysBetween, formatSets,
} from '../js/progression.js';
import { parseBackup, exportBackup, defaultState } from '../js/storage.js';

const ex = (o = {}) => ({
  id: 'x', name: '테스트', group: 'A', sets: 3, repMin: 8, repMax: 12,
  ladder: { type: 'machine' }, startWeight: 40, startReps: null, ...o,
});
const S = (date, weight, reps) => ({ date, sets: reps.map((r) => ({ weight, reps: r })) });
const TODAY = '2026-11-26'; // 목요일

// ── 사다리 ──
test('덤벨 사다리: 9→10→12→14, 12→10', () => {
  const L = buildLadder({ type: 'dumbbell' });
  assert.equal(stepUp(L, 9), 10);
  assert.equal(stepUp(L, 10), 12);
  assert.equal(stepUp(L, 12), 14);
  assert.equal(stepDown(L, 12), 10);
  assert.deepEqual(L.slice(0, 12), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14]);
});

test('머신 40→45, 바벨 0→5', () => {
  assert.equal(stepUp(buildLadder({ type: 'machine' }), 40), 45);
  assert.equal(stepUp(buildLadder({ type: 'cable' }), 40), 45);
  assert.equal(stepUp(buildLadder({ type: 'barbell' }), 0), 5);
});

test('사다리에 없는 값 7.5 → 위 8 / 아래 7', () => {
  const L = buildLadder({ type: 'dumbbell' });
  assert.equal(stepUp(L, 7.5), 8);
  assert.equal(stepDown(L, 7.5), 7);
  // 케이블 8.75 → 위 10 / 아래 5
  const C = buildLadder({ type: 'cable' });
  assert.equal(stepUp(C, 8.75), 10);
  assert.equal(stepDown(C, 8.75), 5);
});

test('사다리 끝에서는 그대로, n단계 이동', () => {
  const B = buildLadder({ type: 'barbell' });
  assert.equal(stepDown(B, 0), 0);
  assert.equal(stepBy(B, 40, -2), 30);
  assert.equal(stepDown(buildLadder({ type: 'machine' }), 5), 5);
});

test('직접 간격 사다리 (2.5kg, 시작 0)', () => {
  const L = buildLadder({ type: 'custom', step: 2.5, start: 0 });
  assert.deepEqual(L.slice(0, 4), [0, 2.5, 5, 7.5]);
  assert.equal(stepUp(L, 8.75), 10);
  assert.equal(stepUp(buildLadder({ type: 'custom', step: 1.25, start: 0 }), 8.75), 10);
});

test('사다리 보정: 42 → 40, 43 → 45, 같은 거리면 가벼운 쪽', () => {
  const L = buildLadder({ type: 'machine' });
  assert.equal(snapToLadder(L, 42), 40);
  assert.equal(snapToLadder(L, 43), 45);
  assert.equal(snapToLadder(L, 42.5), 40);
});

// ── 추천 ──
test('기록 없음: 시작 무게 × 세트 × 하한', () => {
  const r = recommend(ex(), [], TODAY);
  assert.equal(r.kind, 'first');
  assert.equal(r.weight, 40);
  assert.deepEqual(r.reps, [8, 8, 8]);
});

test('기록 없음: 시작 무게가 사다리에 없으면 보정 (42 → 40)', () => {
  assert.equal(recommend(ex({ startWeight: 42 }), [], TODAY).weight, 40);
});

test('기록 없음 + 시작 무게 없음 → 입력 안내', () => {
  const r = recommend(ex({ startWeight: null }), [], TODAY);
  assert.equal(r.kind, 'needStart');
  assert.equal(r.weight, null);
  assert.match(r.reason, /가볍게 시작할 무게를 입력/);
});

test('기록 없음: 시작 횟수 지정 (스쿼트 0kg × 10)', () => {
  const r = recommend(ex({ ladder: { type: 'barbell' }, startWeight: 0, startReps: 10, repMin: 6, repMax: 10 }), [], TODAY);
  assert.equal(r.weight, 0);
  assert.deepEqual(r.reps, [10, 10, 10]);
});

test('상한 달성 → 한 단계 올리고 하한부터', () => {
  const r = recommend(ex(), [S('2026-11-24', 40, [12, 12, 12])], TODAY);
  assert.equal(r.kind, 'up');
  assert.equal(r.weight, 45);
  assert.deepEqual(r.reps, [8, 8, 8]);
});

test('덤벨 상한 달성 10 → 12', () => {
  const r = recommend(ex({ ladder: { type: 'dumbbell' } }), [S('2026-11-24', 10, [12, 13, 12])], TODAY);
  assert.equal(r.weight, 12);
});

test('세트 수가 모자라면 상한 달성으로 보지 않음', () => {
  const r = recommend(ex(), [S('2026-11-24', 40, [12, 12])], TODAY);
  assert.equal(r.kind, 'keep');
  assert.equal(r.weight, 40);
});

test('유지: 같은 무게, 세트별 지난번 +1회 (상한까지)', () => {
  const r = recommend(ex(), [S('2026-11-24', 40, [12, 10, 9])], TODAY);
  assert.equal(r.kind, 'keep');
  assert.equal(r.weight, 40);
  assert.deepEqual(r.reps, [12, 11, 10]);
});

test('하한 미달 1회 → 같은 무게 다시 도전', () => {
  const r = recommend(ex(), [S('2026-11-20', 45, [10, 9, 8]), S('2026-11-24', 45, [9, 8, 6])], TODAY);
  assert.equal(r.kind, 'retry');
  assert.equal(r.weight, 45);
  assert.deepEqual(r.reps, [8, 8, 8]);
});

test('같은 무게에서 2회 연속 미달 → 한 단계 감량 + 이유', () => {
  const r = recommend(ex(), [S('2026-11-20', 45, [9, 7, 6]), S('2026-11-24', 45, [8, 7, 6])], TODAY);
  assert.equal(r.kind, 'deload');
  assert.equal(r.weight, 40);
  assert.match(r.reason, /2회 연속/);
});

test('다른 무게에서의 미달은 연속으로 치지 않음 (감량 직후)', () => {
  const r = recommend(ex(), [S('2026-11-17', 50, [7, 6, 6]), S('2026-11-20', 50, [7, 6, 5]), S('2026-11-24', 45, [8, 7, 7])], TODAY);
  assert.equal(r.kind, 'retry');
  assert.equal(r.weight, 45);
});

test('14일 공백 → 한 단계, 28일 공백 → 두 단계 낮춤', () => {
  const r14 = recommend(ex(), [S('2026-11-12', 50, [12, 12, 12])], TODAY); // 14일
  assert.equal(r14.kind, 'break');
  assert.equal(r14.weight, 45);
  assert.equal(r14.note, '오랜만이라 가볍게 시작해요');
  const r28 = recommend(ex(), [S('2026-10-29', 50, [10, 10, 10])], TODAY); // 28일
  assert.equal(r28.weight, 40);
  assert.deepEqual(r28.reps, [8, 8, 8]);
});

test('13일은 공백으로 보지 않음', () => {
  const r = recommend(ex(), [S('2026-11-13', 50, [10, 10, 10])], TODAY);
  assert.equal(r.kind, 'keep');
  assert.equal(r.note, '');
});

test('맨몸: 상한 달성 → 다음 단계 안내, 무게 없음', () => {
  const pull = ex({ ladder: { type: 'bodyweight' }, startWeight: null, repMin: 5, repMax: 10, startReps: 5 });
  const r = recommend(pull, [S('2026-11-24', null, [10, 10, 11])], TODAY);
  assert.equal(r.kind, 'bwNext');
  assert.equal(r.weight, null);
  assert.match(r.reason, /보조 줄이기 \/ 추가 중량/);
});

test('맨몸: 기록 없음 → 시작 횟수, 유지 → +1회', () => {
  const pull = ex({ ladder: { type: 'bodyweight' }, startWeight: null, repMin: 5, repMax: 10, startReps: 5 });
  const r0 = recommend(pull, [], TODAY);
  assert.equal(r0.weight, null);
  assert.deepEqual(r0.reps, [5, 5, 5]);
  const r1 = recommend(pull, [S('2026-11-24', null, [7, 6, 5])], TODAY);
  assert.deepEqual(r1.reps, [8, 7, 6]);
  assert.equal(r1.weight, null);
});

test('기록 한 줄 표시', () => {
  assert.equal(formatSets([{ weight: 40, reps: 10 }, { weight: 40, reps: 10 }, { weight: 40, reps: 9 }]), '40kg 10/10/9');
  assert.equal(formatSets([{ weight: 40, reps: 10 }, { weight: 35, reps: 9 }]), '40kg 10 · 35kg 9');
  assert.equal(formatSets([{ weight: null, reps: 8 }, { weight: null, reps: 7 }], true), '8/7회');
});

// ── 그룹 순서 ──
test('오늘 추천 그룹: A→B→A, C 다음은 마지막 A/B 기준', () => {
  assert.equal(nextGroup([]), 'A');
  assert.equal(nextGroup([{ group: 'A' }]), 'B');
  assert.equal(nextGroup([{ group: 'A' }, { group: 'B' }]), 'A');
  assert.equal(nextGroup([{ group: 'A' }, { group: 'B' }, { group: 'C' }]), 'A');
  assert.equal(nextGroup([{ group: 'B' }, { group: 'A' }, { group: 'C' }]), 'B');
});

test('이번 주(월~일) A와 B를 모두 하면 C 힌트', () => {
  assert.equal(weekStart(TODAY), '2026-11-23');
  assert.equal(weekStart('2026-11-29'), '2026-11-23'); // 일요일
  assert.equal(shouldSuggestC([{ group: 'A', date: '2026-11-23' }, { group: 'B', date: '2026-11-25' }], TODAY), true);
  assert.equal(shouldSuggestC([{ group: 'A', date: '2026-11-22' }, { group: 'B', date: '2026-11-25' }], TODAY), false);
  assert.equal(shouldSuggestC([{ group: 'A', date: '2026-11-23' }, { group: 'B', date: '2026-11-24' }, { group: 'C', date: '2026-11-25' }], TODAY), false);
  assert.equal(daysBetween('2026-11-24', TODAY), 2);
});

// ── 백업 형식 검사 ──
test('백업 → 복원 왕복, 잘못된 형식은 거부', () => {
  const st = defaultState();
  st.sessions.push({ id: 's1', group: 'A', date: '2026-11-24', entries: [{ exerciseId: 'a-latpull', sets: [{ weight: 40, reps: 10 }] }] });
  st.active = { group: 'B' };
  const res = parseBackup(exportBackup(st));
  assert.equal(res.ok, true);
  assert.equal(res.state.sessions.length, 1);
  assert.equal(res.state.active, null);
  assert.equal(res.state.exercises.length, st.exercises.length);
  assert.equal(parseBackup('hello').ok, false);
  assert.equal(parseBackup('{"a":1}').ok, false);
  assert.equal(parseBackup(JSON.stringify({ app: 'gym-tracker', schemaVersion: 99, exercises: [], sessions: [] })).ok, false);
});
