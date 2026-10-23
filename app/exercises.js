// 종목 사전 (v0.5) — 노트북(gym_log.ipynb) ②의 EXERCISES · ALIASES도 이 파일과 같게 맞춤
//
// [지도]
//   들어오는 것: 사람이 적은 종목 이름 ("BB row", "sll", "사레레", "Barbell row" …)
//   하는 일:     정식 이름(영어 풀네임) 하나로 모으기 — 기록 · 그래프 · 다음 무게 제안이 이 이름으로 묶임
//   나가는 것:   canonicalName("bb row") → "Barbell row",  EXERCISES["Barbell row"] → 부위 · 범위 · 증량
//
//   ko = 한국어 이름 (검색용, 화면에는 영어 정식 이름), part = 부위, range = 반복 범위 [최소, 최대],
//   step = 증량 무게(kg, 0 = 맨몸 운동), aliases = 별명 (검색 · 메모 가져오기에서 정식 이름으로 바뀜)

const EXERCISES = {
  // 가슴
  "Bench press":                     { ko: "벤치프레스", part: "가슴", range: [6, 8], step: 5, aliases: ["BP", "Barbell bench press"] },
  "Incline bench press":             { ko: "인클라인 벤치프레스", part: "가슴", range: [8, 10], step: 5, aliases: ["Free IBP", "IBP"] },
  "Smith incline bench press":       { ko: "스미스 인클라인 벤치", part: "가슴", range: [8, 10], step: 5, aliases: ["Smith IBP"] },
  "Decline bench press":             { ko: "디클라인 벤치프레스", part: "가슴", range: [8, 10], step: 5, aliases: [] },
  "Dumbbell bench press":            { ko: "덤벨 벤치프레스", part: "가슴", range: [12, 15], step: 2, aliases: ["DB press", "DB bench"] },
  "Incline dumbbell press":          { ko: "인클라인 덤벨 프레스", part: "가슴", range: [10, 12], step: 2, aliases: ["Incline DB press"] },
  "Chest press machine":             { ko: "체스트 프레스", part: "가슴", range: [10, 15], step: 5, aliases: [] },
  "Dumbbell fly":                    { ko: "덤벨 플라이", part: "가슴", range: [12, 15], step: 2, aliases: ["DB fly"] },
  "Cable crossover":                 { ko: "케이블 크로스오버", part: "가슴", range: [12, 15], step: 5, aliases: ["Cable fly"] },
  "Dips":                            { ko: "딥스", part: "가슴", range: [10, 15], step: 0, aliases: [] },
  "Push up":                         { ko: "푸시업", part: "가슴", range: [15, 25], step: 0, aliases: ["팔굽혀펴기"] },
  // 등
  "Pull up":                         { ko: "풀업", part: "등", range: [8, 12], step: 0, aliases: ["턱걸이"] },
  "Wide pull up":                    { ko: "와이드 풀업", part: "등", range: [8, 12], step: 0, aliases: [] },
  "Chin up":                         { ko: "친업", part: "등", range: [8, 12], step: 0, aliases: [] },
  "Lat pulldown":                    { ko: "랫풀다운", part: "등", range: [10, 12], step: 5, aliases: ["LPD"] },
  "Straight arm pulldown":           { ko: "스트레이트 암 풀다운", part: "등", range: [12, 15], step: 5, aliases: ["Straight arm pull down"] },
  "Conventional deadlift":           { ko: "컨벤셔널 데드리프트", part: "등", range: [6, 8], step: 5, aliases: ["Deadlift", "DL"] },
  "Barbell row":                     { ko: "바벨 로우", part: "등", range: [8, 12], step: 5, aliases: ["BB row"] },
  "Dumbbell row":                    { ko: "덤벨 로우", part: "등", range: [12, 15], step: 2, aliases: ["DB row", "One arm row"] },
  "Seated cable row":                { ko: "시티드 케이블 로우", part: "등", range: [12, 15], step: 5, aliases: ["Long pull", "롱풀"] },
  "T-bar row":                       { ko: "티바 로우", part: "등", range: [8, 12], step: 5, aliases: [] },
  "Shrug":                           { ko: "슈러그", part: "등", range: [12, 15], step: 5, aliases: ["Barbell shrug"] },
  "Back extension":                  { ko: "백 익스텐션", part: "등", range: [12, 15], step: 0, aliases: [] },
  // 어깨
  "Overhead press":                  { ko: "오버헤드 프레스", part: "어깨", range: [6, 8], step: 2.5, aliases: ["OHP", "Military press"] },
  "Smith behind neck press":         { ko: "스미스 비하인드 넥 프레스", part: "어깨", range: [8, 10], step: 5, aliases: ["BTN press"] },
  "Dumbbell shoulder press":         { ko: "덤벨 숄더 프레스", part: "어깨", range: [12, 15], step: 2, aliases: ["DB shoulder press"] },
  "Machine shoulder press":          { ko: "머신 숄더 프레스", part: "어깨", range: [10, 12], step: 5, aliases: [] },
  "Side lateral raise":              { ko: "사이드 레터럴 레이즈", part: "어깨", range: [15, 20], step: 2, aliases: ["SLL", "Lateral raise", "사레레"] },
  "Cable side lateral raise":        { ko: "케이블 사이드 레터럴 레이즈", part: "어깨", range: [15, 20], step: 2.5, aliases: ["Cable SLL"] },
  "Chest-supported rear delt raise": { ko: "체스트 서포티드 리어 델트 레이즈", part: "어깨", range: [15, 20], step: 2, aliases: ["Incline rear delt fly"] },
  "Front raise":                     { ko: "프론트 레이즈", part: "어깨", range: [12, 15], step: 2, aliases: [] },
  "Cable front raise":               { ko: "케이블 프론트 레이즈", part: "어깨", range: [12, 15], step: 2.5, aliases: [] },
  "Reverse pec deck fly":            { ko: "리버스 펙덱 플라이", part: "어깨", range: [15, 20], step: 5, aliases: ["Peck deck fly"] },
  "Face pull":                       { ko: "페이스 풀", part: "어깨", range: [15, 20], step: 2.5, aliases: [] },
  "Upright row":                     { ko: "업라이트 로우", part: "어깨", range: [10, 12], step: 5, aliases: [] },
  // 하체
  "Squat":                           { ko: "스쿼트", part: "하체", range: [8, 10], step: 5, aliases: ["Back squat"] },
  "Front squat":                     { ko: "프론트 스쿼트", part: "하체", range: [6, 10], step: 5, aliases: [] },
  "V squat":                         { ko: "브이 스쿼트", part: "하체", range: [10, 12], step: 5, aliases: [] },
  "Hack squat":                      { ko: "핵 스쿼트", part: "하체", range: [10, 12], step: 5, aliases: [] },
  "Leg press":                       { ko: "레그 프레스", part: "하체", range: [10, 15], step: 10, aliases: [] },
  "Romanian deadlift":               { ko: "루마니안 데드리프트", part: "하체", range: [8, 10], step: 5, aliases: ["RDL"] },
  "Bulgarian split squat":           { ko: "불가리안 스플릿 스쿼트", part: "하체", range: [8, 12], step: 2, aliases: ["BSS"] },
  "Lunge":                           { ko: "런지", part: "하체", range: [10, 12], step: 2, aliases: [] },
  "Lying leg curl":                  { ko: "라잉 레그 컬", part: "하체", range: [12, 15], step: 5, aliases: [] },
  "Seated leg curl":                 { ko: "시티드 레그 컬", part: "하체", range: [12, 15], step: 5, aliases: [] },
  "Leg extension":                   { ko: "레그 익스텐션", part: "하체", range: [12, 15], step: 5, aliases: [] },
  "Hip thrust":                      { ko: "힙 쓰러스트", part: "하체", range: [8, 12], step: 5, aliases: [] },
  "Kettlebell wide squat":           { ko: "케틀벨 와이드 스쿼트", part: "하체", range: [15, 20], step: 4, aliases: ["Kettle bell wide squat"] },
  "Calf raise":                      { ko: "카프 레이즈", part: "하체", range: [15, 20], step: 5, aliases: [] },
  // 이두
  "Barbell curl":                    { ko: "바벨 컬", part: "이두", range: [8, 10], step: 5, aliases: ["BB curl"] },
  "EZ bar curl":                     { ko: "이지바 컬", part: "이두", range: [10, 12], step: 5, aliases: ["EZ curl"] },   // 무게는 바 제외
  "Dumbbell curl":                   { ko: "덤벨 컬", part: "이두", range: [10, 12], step: 2, aliases: ["DB curl"] },
  "Hammer curl":                     { ko: "해머 컬", part: "이두", range: [10, 12], step: 2, aliases: [] },
  "Preacher curl":                   { ko: "프리처 컬", part: "이두", range: [10, 12], step: 2.5, aliases: [] },
  "Cable curl":                      { ko: "케이블 컬", part: "이두", range: [12, 15], step: 2.5, aliases: [] },
  // 삼두
  "Cable push down":                 { ko: "케이블 푸시다운", part: "삼두", range: [10, 12], step: 5, aliases: ["Triceps pushdown"] },
  "Overhead triceps extension":      { ko: "오버헤드 트라이셉스 익스텐션", part: "삼두", range: [10, 12], step: 5, aliases: ["Overhead extension"] },
  "Lying triceps extension":         { ko: "라잉 트라이셉스 익스텐션", part: "삼두", range: [10, 12], step: 2.5, aliases: ["Skull crusher"] },
  "Close grip bench press":          { ko: "클로즈 그립 벤치프레스", part: "삼두", range: [8, 10], step: 5, aliases: ["CGBP"] },
  // 복근
  "Hanging leg raise":               { ko: "행잉 레그 레이즈", part: "복근", range: [20, 30], step: 0, aliases: ["HLR"] },
  "Leg raise":                       { ko: "레그 레이즈", part: "복근", range: [20, 30], step: 0, aliases: ["Lying leg raise"] },
  "Crunch":                          { ko: "크런치", part: "복근", range: [15, 25], step: 0, aliases: [] },
  "Cable crunch":                    { ko: "케이블 크런치", part: "복근", range: [12, 15], step: 5, aliases: [] },
  "Ab roller":                       { ko: "복근 롤러", part: "복근", range: [10, 15], step: 0, aliases: ["Ab wheel", "롤아웃"] },
};

// 옛 이름 → 정식 이름 (화면 별명으로는 안 보이고, 예전 기록 · 메모만 옮김)
const LEGACY_NAMES = {
  "Smith SLL": "Cable side lateral raise",                 // 실제로는 케이블이었음
  "Bench lateral raise": "Chest-supported rear delt raise",
  "Leg curl": "Lying leg curl",                            // 옛 기록은 라잉
};

const DAYS = ["가슴", "등", "어깨", "하체"];                       // 4분할
const DEFAULT_SETTING = { part: "미분류", range: [8, 12], step: 5 };  // 사전에 없는 종목


// 소문자 이름 → 정식 이름 (정식 이름 · 한국어 이름 · 별명 · 옛 이름 모두)
const NAME_INDEX = {};
for (const [name, e] of Object.entries(EXERCISES)) {
  for (const n of [name, e.ko, ...e.aliases]) NAME_INDEX[n.toLowerCase()] = name;
}
for (const [old, name] of Object.entries(LEGACY_NAMES)) NAME_INDEX[old.toLowerCase()] = name;

// 사전에 있는 종목이면 정식 이름, 없으면 null.  "bb row" → "Barbell row", "사레레" → "Side lateral raise"
function dictionaryName(raw) {
  return NAME_INDEX[String(raw).trim().replace(/\s+/g, " ").toLowerCase()] || null;
}
