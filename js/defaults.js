/**
 * defaults.js — 기본 운동 그룹과 종목 목록
 * (앱을 처음 열 때만 쓰여요. 이후에는 설정 화면에서 고친 내용이 폰에 저장됩니다.)
 * 시작 무게는 모두 "추정치"예요. null = 첫날 직접 입력.
 */
export const GROUPS = Object.freeze({
  A: '등+이두',
  B: '가슴+삼두',
  C: '하체+어깨',
});

const E = (id, group, name, type, sets, repMin, repMax, startWeight, extra = {}) => ({
  id, group, name,
  ladder: { type },
  sets, repMin, repMax,
  startWeight,
  startReps: null,
  desc: '',
  hint: '',
  defaultMemo: '',
  hidden: false,
  ...extra,
});

export const DEFAULT_EXERCISES = [
  // A 등+이두
  E('a-pullup', 'A', '턱걸이', 'bodyweight', 3, 5, 10, null, { startReps: 5 }),
  E('a-latpull', 'A', '렛풀다운', 'machine', 3, 8, 12, 40),
  E('a-seatedrow', 'A', '시티드로우', 'machine', 3, 8, 12, 40),
  E('a-dbrow', 'A', '덤벨로우', 'dumbbell', 3, 8, 12, null),
  E('a-inclinecurl', 'A', '인클라인 덤벨컬', 'dumbbell', 3, 8, 12, 6),
  E('a-hammer', 'A', '해머컬', 'dumbbell', 3, 8, 12, null),
  E('a-curlmachine', 'A', '이두컬머신', 'machine', 3, 8, 12, null),

  // B 가슴+삼두
  E('b-bench', 'B', '벤치프레스', 'barbell', 3, 6, 10, 35),
  E('b-fly', 'B', '플라이 머신', 'machine', 3, 8, 12, 20),
  E('b-dips', 'B', '딥스', 'bodyweight', 3, 8, 12, null, {
    startReps: 10, defaultMemo: '발판 보조', hint: '메모에 발판 보조 여부를 남겨 주세요.',
  }),
  E('b-inclinebench', 'B', '인클라인 벤치프레스', 'barbell', 3, 6, 10, null),
  E('b-cableext', 'B', '케이블 익스텐션', 'cable', 3, 8, 12, null, {
    desc: '서서 위로', hint: '참고: 예전 헬스장 기록 8.75kg×10',
  }),
  E('b-lyingext', 'B', '라잉 익스텐션', 'barbell', 3, 8, 12, 10, { desc: '이지바' }),

  // C 하체+어깨
  E('c-squat', 'C', '스쿼트', 'barbell', 3, 6, 10, 0, { startReps: 10, hint: '원판 0kg = 빈 바' }),
  E('c-ohp', 'C', '오버헤드프레스', 'barbell', 3, 6, 10, null, { hint: '참고: 예전 스미스 OHP 원판 10kg×10' }),
  E('c-lateral', 'C', '사이드레터럴레이즈', 'dumbbell', 3, 10, 15, 4),
  E('c-rear1', 'C', '후면삼각근1', 'barbell', 3, 10, 15, 15, { desc: '상체를 숙이고 바벨을 몸 뒤로 보내기' }),
  E('c-rear2', 'C', '후면삼각근2', 'barbell', 3, 10, 15, null, { desc: '서서 바벨을 엉덩이에서 허리까지 들어올리기' }),
];
