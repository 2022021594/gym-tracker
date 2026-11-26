/**
 * progression.js — 무게 사다리 + 추천 무게/횟수 계산 (이중 점진법)
 *
 * 순수 함수만 있습니다. 화면(DOM)이나 저장소(localStorage)를 전혀 쓰지 않으므로
 * node:test로 그대로 테스트할 수 있어요.
 *
 * ▶ 기준 숫자를 바꾸고 싶으면 아래 CONFIG만 고치면 됩니다.
 */
export const CONFIG = Object.freeze({
  // ── 무게 사다리 기본값 (단위 kg) ──
  MACHINE_MIN: 5,           // 머신·케이블: 5, 10, 15, ...
  MACHINE_STEP: 5,
  BARBELL_MIN: 0,           // 바벨(원판 합계): 0(빈 바), 5, 10, ...
  BARBELL_STEP: 5,          // 한쪽 최소 원판 2.5kg × 2
  DUMBBELL_MIN: 1,          // 덤벨(한 손): 1, 2, ..., 10
  DUMBBELL_FINE_MAX: 10,
  DUMBBELL_FINE_STEP: 1,
  DUMBBELL_COARSE_STEP: 2,  // 10kg 초과: 12, 14, 16, ...
  DUMBBELL_MAX: 80,
  CUSTOM_DEFAULT_STEP: 2.5, // "직접 간격" 기본값
  CUSTOM_MIN_STEP: 0.25,
  LADDER_MAX: 300,          // 사다리 최대 무게

  // ── 쉰 기간(공백)에 따른 감량 ──
  BREAK_DAYS_LIGHT: 14,     // 14일 이상 쉬면
  BREAK_STEPS_LIGHT: 1,     //   사다리 1단계 낮춤
  BREAK_DAYS_HEAVY: 28,     // 28일 이상 쉬면
  BREAK_STEPS_HEAVY: 2,     //   사다리 2단계 낮춤

  // ── 같은 무게에서 하한 미달이 몇 회 연속이면 한 단계 낮출지 ──
  FAIL_STREAK_FOR_DELOAD: 2,

  // ── 앱 기본값 ──
  DEFAULT_REST_SECONDS: 90, // 휴식 타이머 기본값
  BACKUP_REMIND_DAYS: 14,   // 이 일수보다 오래 백업 안 하면 홈에서 알림
});

/** 사다리 종류 (설정 화면에 보이는 이름) */
export const LADDER_TYPES = Object.freeze({
  machine: '머신',
  cable: '케이블',
  barbell: '바벨 (원판 합계)',
  dumbbell: '덤벨 (한 손)',
  custom: '직접 간격',
  bodyweight: '맨몸',
});

const EPS = 1e-9;
const r2 = (x) => Math.round(x * 100) / 100;

/**
 * 사다리(선택 가능한 무게의 정렬된 목록)를 만든다.
 * @param {{type:string, step?:number, start?:number}} spec
 * @returns {number[]}
 */
export function buildLadder(spec) {
  const type = spec?.type ?? 'machine';
  const out = [];
  const range = (start, end, step) => {
    for (let i = 0; ; i++) {
      const v = r2(start + i * step);
      if (v > end + EPS) break;
      out.push(v);
    }
  };
  switch (type) {
    case 'bodyweight':
      return [];
    case 'barbell':
      range(CONFIG.BARBELL_MIN, CONFIG.LADDER_MAX, CONFIG.BARBELL_STEP);
      break;
    case 'dumbbell':
      range(CONFIG.DUMBBELL_MIN, CONFIG.DUMBBELL_FINE_MAX, CONFIG.DUMBBELL_FINE_STEP);
      range(CONFIG.DUMBBELL_FINE_MAX + CONFIG.DUMBBELL_COARSE_STEP, CONFIG.DUMBBELL_MAX, CONFIG.DUMBBELL_COARSE_STEP);
      break;
    case 'custom': {
      let step = Number(spec?.step);
      if (!Number.isFinite(step) || step <= 0) step = CONFIG.CUSTOM_DEFAULT_STEP;
      step = Math.max(CONFIG.CUSTOM_MIN_STEP, step);
      let start = Number(spec?.start);
      if (!Number.isFinite(start) || start < 0) start = 0;
      range(start, CONFIG.LADDER_MAX, step);
      break;
    }
    case 'machine':
    case 'cable':
    default:
      range(CONFIG.MACHINE_MIN, CONFIG.LADDER_MAX, CONFIG.MACHINE_STEP);
  }
  return out;
}

/** w보다 큰 가장 가까운 사다리 값 (없으면 w 그대로) */
export function stepUp(ladder, w) {
  if (w == null || !ladder.length) return w;
  for (const v of ladder) if (v > w + EPS) return v;
  return w;
}

/** w보다 작은 가장 가까운 사다리 값 (없으면 w 그대로) */
export function stepDown(ladder, w) {
  if (w == null || !ladder.length) return w;
  for (let i = ladder.length - 1; i >= 0; i--) if (ladder[i] < w - EPS) return ladder[i];
  return w;
}

/** n단계 이동 (n>0 위로, n<0 아래로) */
export function stepBy(ladder, w, n) {
  let x = w;
  for (let i = 0; i < Math.abs(n); i++) x = n > 0 ? stepUp(ladder, x) : stepDown(ladder, x);
  return x;
}

/** 가장 가까운 사다리 값으로 보정 (같은 거리면 가벼운 쪽) */
export function snapToLadder(ladder, w) {
  if (w == null || !ladder.length) return w;
  let best = ladder[0];
  for (const v of ladder) {
    if (Math.abs(v - w) < Math.abs(best - w) - EPS) best = v;
  }
  return best;
}

export const isBodyweight = (ex) => ex?.ladder?.type === 'bodyweight';

/** 숫자 무게를 보기 좋게 (7.50 → "7.5") */
export function formatWeight(w) {
  if (w == null || w === '') return '';
  return String(r2(Number(w)));
}

/** 세트 기록을 한 줄로: "40kg 10/10/9", 무게가 섞이면 "40kg 10/10 · 35kg 9", 맨몸은 "10/9/8회" */
export function formatSets(sets, bw = false) {
  if (!sets?.length) return '';
  if (bw) return sets.map((s) => s.reps).join('/') + '회';
  const groups = [];
  for (const s of sets) {
    const w = formatWeight(s.weight ?? 0);
    const g = groups[groups.length - 1];
    if (g && g.w === w) g.r.push(s.reps);
    else groups.push({ w, r: [s.reps] });
  }
  return groups.map((g) => `${g.w}kg ${g.r.join('/')}`).join(' · ');
}

/** 'YYYY-MM-DD' 두 날짜 사이의 일수 (b - a) */
export function daysBetween(a, b) {
  const p = (s) => {
    const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((p(b) - p(a)) / 86400000);
}

/** 한 번의 운동 기록을 평가 */
function evaluate(ex, session, bw) {
  const reps = session.sets.map((s) => Number(s.reps) || 0);
  const base = bw ? null : Math.max(...session.sets.map((s) => Number(s.weight) || 0));
  const allTop = reps.length >= ex.sets && reps.every((r) => r >= ex.repMax);
  const anyFail = reps.some((r) => r < ex.repMin);
  return { reps, base, allTop, anyFail };
}

/**
 * 다음 목표 계산.
 * @param {object} ex 종목 {sets, repMin, repMax, ladder, startWeight, startReps}
 * @param {{date:string, sets:{weight:number|null, reps:number}[]}[]} history 오래된 것 → 최신 순
 * @param {string} today 'YYYY-MM-DD'
 * @returns {{kind:string, weight:number|null, reps:number[], reason:string, note:string}}
 *   kind: first | needStart | up | keep | retry | deload | break | bwNext
 */
export function recommend(ex, history, today) {
  const ladder = buildLadder(ex.ladder);
  const bw = isBodyweight(ex);
  const n = ex.sets;
  const fill = (r) => Array(n).fill(r);
  const valid = (history || []).filter((h) => h?.sets?.length);
  const last = valid[valid.length - 1];
  const startReps = Number.isFinite(ex.startReps) && ex.startReps > 0 ? ex.startReps : ex.repMin;

  // 1. 기록 없음
  if (!last) {
    if (bw) {
      return { kind: 'first', weight: null, reps: fill(startReps), reason: '처음이에요. 목표 횟수부터 가볍게 시작해요.', note: '' };
    }
    if (ex.startWeight == null || ex.startWeight === '' || !Number.isFinite(Number(ex.startWeight))) {
      return { kind: 'needStart', weight: null, reps: fill(startReps), reason: '처음이에요. 가볍게 시작할 무게를 입력해 주세요.', note: '' };
    }
    return {
      kind: 'first',
      weight: snapToLadder(ladder, Number(ex.startWeight)),
      reps: fill(startReps),
      reason: '처음이에요. 시작 무게는 추정치라 가볍거나 무거우면 바로 고쳐 주세요.',
      note: '',
    };
  }

  const ev = evaluate(ex, last, bw);
  let res;

  if (ev.allTop) {
    // 2. 모든 세트 상한 달성 → 한 단계 올림
    if (bw) {
      res = {
        kind: 'bwNext', weight: null, reps: fill(ex.repMax),
        reason: `모든 세트 ${ex.repMax}회 달성! 다음 단계로 올려 보세요(보조 줄이기 / 추가 중량).`,
      };
    } else {
      const up = stepUp(ladder, ev.base);
      res = {
        kind: 'up', weight: up, reps: fill(ex.repMin),
        reason: up > ev.base
          ? `지난번 모든 세트 ${ex.repMax}회 달성 → 한 단계 올려서 ${ex.repMin}회부터 다시 시작해요.`
          : `모든 세트 ${ex.repMax}회 달성! (사다리 최고값이라 같은 무게예요.)`,
      };
    }
  } else if (!ev.anyFail) {
    // 3. 하한 이상, 상한 미만 → 같은 무게, 세트별 +1회
    const reps = Array.from({ length: n }, (_, i) => {
      const prev = ev.reps[i] ?? ev.reps[ev.reps.length - 1];
      return Math.min(ex.repMax, Math.max(ex.repMin, prev + 1));
    });
    res = { kind: 'keep', weight: ev.base, reps, reason: bw ? '세트별 지난번 +1회에 도전해요.' : '같은 무게로 세트별 지난번 +1회에 도전해요.' };
  } else {
    // 4. 하한 미달 세트 있음 → 같은 무게. 같은 무게에서 연속이면 한 단계 낮춤
    let streak = 0;
    for (let k = valid.length - 1; k >= 0; k--) {
      const e = evaluate(ex, valid[k], bw);
      if (!e.anyFail) break;
      if (!bw && e.base !== ev.base) break;
      streak++;
    }
    if (streak >= CONFIG.FAIL_STREAK_FOR_DELOAD) {
      if (bw) {
        res = { kind: 'deload', weight: null, reps: fill(ex.repMin), reason: `${streak}회 연속 ${ex.repMin}회에 못 미쳤어요. 보조를 조금 늘려 보세요.` };
      } else {
        const down = stepDown(ladder, ev.base);
        res = {
          kind: 'deload', weight: down, reps: fill(ex.repMin),
          reason: `${streak}회 연속 ${ex.repMin}회에 못 미친 세트가 있어서 한 단계 낮췄어요.`,
        };
      }
    } else {
      res = { kind: 'retry', weight: ev.base, reps: fill(ex.repMin), reason: `지난번 ${ex.repMin}회에 못 미친 세트가 있어서 ${bw ? '' : '같은 무게로 '}다시 도전해요.` };
    }
  }

  // 5. 오래 쉬었으면 지난 무게에서 1~2단계 낮춤
  const days = daysBetween(last.date, today);
  let steps = 0;
  if (days >= CONFIG.BREAK_DAYS_HEAVY) steps = CONFIG.BREAK_STEPS_HEAVY;
  else if (days >= CONFIG.BREAK_DAYS_LIGHT) steps = CONFIG.BREAK_STEPS_LIGHT;
  if (steps > 0) {
    res = bw
      ? { kind: 'break', weight: null, reps: fill(ex.repMin), reason: `${days}일 만이라 ${ex.repMin}회부터 가볍게 시작해요.` }
      : { kind: 'break', weight: stepBy(ladder, ev.base, -steps), reps: fill(ex.repMin), reason: `${days}일 만이라 지난번 무게보다 ${steps}단계 낮췄어요.` };
    res.note = '오랜만이라 가볍게 시작해요';
  }

  res.note = res.note || '';
  return res;
}

// ───────────── 그룹 순서 (A → B → A …, C는 주 3회째) ─────────────

/** 오늘 추천 그룹: 마지막으로 한 A/B의 다음 그룹 */
export function nextGroup(sessions) {
  for (let i = (sessions?.length ?? 0) - 1; i >= 0; i--) {
    const g = sessions[i].group;
    if (g === 'A') return 'B';
    if (g === 'B') return 'A';
  }
  return 'A';
}

/** today가 속한 주(월~일)의 월요일 'YYYY-MM-DD' */
export function weekStart(today) {
  const [y, m, d] = today.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const offset = (t.getUTCDay() + 6) % 7; // 월=0 … 일=6
  t.setUTCDate(t.getUTCDate() - offset);
  return t.toISOString().slice(0, 10);
}

/** 이번 주에 A와 B를 모두 했고 C는 아직이면 true */
export function shouldSuggestC(sessions, today) {
  const ws = weekStart(today);
  const groups = new Set((sessions || []).filter((s) => s.date >= ws && s.date <= today).map((s) => s.group));
  return groups.has('A') && groups.has('B') && !groups.has('C');
}
