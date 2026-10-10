// I will become monster — v0.4-a 운동 기록 앱
//
// [지도]
//   들어오는 것: 버튼 누르기 (분할 선택, ± , 세트 완료, RPE …)
//   저장하는 곳: 폰 브라우저 저장소(localStorage)의 data 하나
//   나가는 것:   화면(render) + 메모 형식 글자(toMemo) → 노트북 ①에 붙여넣기
//
// [저장 모양] — 노트북처럼 "운동 한 번 → 종목들 → 세트들"
//   data = {
//     workouts: [ { id, split: "가슴", start: "2026-10-05T19:00…", end: null 또는 시각,
//                   exercises: [ { name: "Bench press", rpe: 8 또는 null,
//                                  sets: [ { w: 85, r: 8 }, … ],
//                                  draft: { w: 85, r: 8 } } ] } ],
//     currentId: 진행 중인 운동의 id (없으면 null),
//     custom: { "새 종목": { part, range, step } },     ← 앱에서 직접 추가한 종목
//     deleted: [지운 운동 id …], customDirty: true/false ← 인터넷에 아직 반영 안 된 것 (sync.js가 처리)
//   }
//   운동마다 synced: true = 인터넷(Supabase)에 올라가 있음
//   + 체중 · 식사 (body, meals, nutrition …) — 모양은 nutrition.js 맨 위

const APP_VERSION = "v0.4-d.3";             // 홈 화면 맨 아래에 보임 → 폰이 새 버전인지 확인용 (sw.js의 CACHE와 같이 올리기)
const STORAGE_KEY = "iwbm-data-v1";
const RPE_CHOICES = [7, 8, 9, 10];
const PART_ORDER = ["가슴", "등", "어깨", "하체", "이두", "삼두", "복근"];   // 종목 목록에서 부위가 나오는 순서
const STEP_CHOICES = [1, 2, 2.5, 4, 5];                                     // 새 종목의 증량 단위 후보


// ---------- 1. 저장 · 불러오기 ----------

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.workouts)) return renameExercise({ ...EMPTY_EXTRAS(), ...saved }, "Incline bench press", "Smith IBP");
  } catch (e) { /* 저장된 게 없거나 깨졌으면 새로 시작 */ }
  return { workouts: [], currentId: null, custom: {}, ...EMPTY_EXTRAS() };
}

// 나중 버전에서 늘어난 칸들의 빈 값 (예전에 저장된 data에는 이 칸이 없음)
function EMPTY_EXTRAS() {
  return { deleted: [], customDirty: false, body: {}, meals: [], nutrition: null, deletedMeals: [], deletedWeights: [] };
}

// 종목 이름 바꾸기 (예전에 다른 이름으로 저장된 기록 고치기). 바뀐 운동은 다시 올리도록 synced를 끔
function renameExercise(d, from, to) {
  for (const w of d.workouts) {
    for (const e of w.exercises) {
      if (e.name === from) { e.name = to; w.synced = false; }
    }
  }
  if (d.custom[from]) { delete d.custom[from]; d.customDirty = true; }
  return d;
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let data = load();
save();                                          // load에서 고친 것(종목 이름 바꾸기 등)을 바로 저장

// 화면 상태 (저장 안 함): 지금 어느 화면인지, 어떤 종목이 펼쳐져 있는지 등
const ui = {
  screen: data.currentId ? "workout" : "home",   // home / workouts / workout / summary / export / nutrition …
  workoutTab: "log",     // Workout 화면의 탭: log(기록) / graph(그래프)
  active: null,          // 펼쳐진 종목 번호
  menu: null,            // 세트 칩을 눌렀을 때 { ex, set }
  edit: null,            // 수정 중인 세트 { ex, set }
  adding: false,         // 종목 추가 창이 열려 있나
  query: "",             // 종목 검색어
  summaryId: null,       // 요약 화면에 보여 줄 운동
  focusSearch: false,    // 다시 그린 뒤 검색칸에 커서를 둘지
  form: null,            // 새 종목 / 종목 수정 칸 { name, part, bodyweight, step, editing }
};


// ---------- 2. 계산 도우미 ----------

function settingOf(name) {
  return EXERCISES[name] || data.custom[name] || DEFAULT_SETTING;
}

function isBodyweight(name) {
  return settingOf(name).step === 0;            // 증량 0 = 맨몸 (노트북과 같은 규칙)
}

function current() {
  return data.workouts.find(w => w.id === data.currentId) || null;
}

function finishedWorkouts() {                   // 끝난 운동, 오래된 것 → 최근
  return data.workouts.filter(w => w.end).sort((a, b) => a.start.localeCompare(b.start));
}

// 같은 분할의 지난번 운동에서 이 종목 (없으면 null) → { name, rpe, sets }
function lastTimeExercise(split, name) {
  const past = finishedWorkouts().filter(w => w.split === split).reverse();
  for (const w of past) {
    const ex = w.exercises.find(e => e.name === name && e.sets.length);
    if (ex) return ex;
  }
  return null;
}

function lastTimeSets(split, name) {
  const ex = lastTimeExercise(split, name);
  return ex ? ex.sets : null;
}


// ---------- 2-1. 다음 무게 제안 — 노트북 ⑧ next_weight를 그대로 옮긴 것 ----------
//   노트북(Python)                          앱(JS)
//   def next_weight(...):                   function nextWeight(...) {
//   min(reps) >= high                       Math.min(...reps) >= high
//   return weight + step, "이유"            return { weight: weight + step, reason: "이유" }

function nextWeight(weight, reps, low, high, step, rpe) {
  if (weight === 0)                               // 맨몸 운동은 무게 대신 횟수를 늘린다
    return { weight: 0, reason: "맨몸 → 같은 세트 수로 세트마다 1회씩 더" };
  if (Math.min(...reps) >= high && rpe === 10)    // 다 채웠지만 한계였음 → 굳히기
    return { weight, reason: `모든 세트 ${high}회 달성, 하지만 RPE 10 → 같은 무게로 한 번 더` };
  if (Math.min(...reps) >= high)
    return { weight: weight + step, reason: `모든 세트 ${high}회 달성 → +${num(step)}kg` };
  if (Math.max(...reps) < low)
    return { weight: Math.max(weight - step, 0), reason: `최고 ${Math.max(...reps)}회 < ${low}회 → -${num(step)}kg` };
  return { weight, reason: `같은 무게로 모든 세트 ${high}회까지` };
}

// 지난번 기록 → { weight, reason } (지난번 기록이 없으면 null)
function suggestion(split, name) {
  const last = lastTimeExercise(split, name);
  if (!last) return null;
  const weights = last.sets.map(s => s.w);                          // [14, 12, 12, 12]
  const top = Math.max(...weights);                                 // 가장 무거운 무게 = 본 세트
  const reps = last.sets.filter(s => s.w === top).map(s => s.r);    // 본 세트들의 횟수
  const afterTop = weights.slice(weights.indexOf(top));             // 첫 본 세트부터 끝까지
  if (Math.min(...afterTop) < top) {                                // 본 세트 뒤에 중간에 무게를 낮췄으면
    return { weight: top, reason: `중간에 무게를 낮춤 → ${num(top)}kg로 ${reps.length + 1}세트 도전 (안 되면 ${num(Math.min(...afterTop))}kg)` };
  }
  const { range: [low, high], step } = settingOf(name);
  return nextWeight(top, reps, low, high, step, last.rpe);
}

// 새 종목을 추가할 때 ± 칸에 처음 넣을 값: 제안 무게 + 지난번 첫 세트 횟수 → 없으면 기본값
function initialDraft(split, name) {
  const last = lastTimeSets(split, name);
  if (!last) return { w: isBodyweight(name) ? 0 : 20, r: settingOf(name).range[1] };
  const next = suggestion(split, name);
  return { w: next.weight, r: isBodyweight(name) ? last[0].r + 1 : last[0].r };   // 맨몸은 1회 더
}

const num = x => String(+Number(x).toFixed(2));          // 85.0 → "85", 62.50 → "62.5"

function totalSets(w) {
  return w.exercises.reduce((sum, e) => sum + e.sets.length, 0);
}

function duration(w) {                          // "1:12:30" 모양 (메모에서 가져온 기록은 시간이 없음)
  if (w.imported) return "📥 메모";
  const end = w.end ? new Date(w.end) : new Date();
  let s = Math.max(0, Math.round((end - new Date(w.start)) / 1000));
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function clock(seconds) {                       // 95 → "1:35",  3725 → "1:02:05"
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? h + ":" : ""}${mm}:${String(r).padStart(2, "0")}`;
}

function lastSetTime(w) {                       // 이 운동에서 가장 최근에 완료한 세트 시각 (없으면 null)
  const times = w.exercises.flatMap(e => e.sets.map(s => s.t)).filter(Boolean).sort();
  return times.length ? times[times.length - 1] : null;
}

function averageRest(w) {                       // 세트 사이 휴식의 평균(초). 세트가 2개 미만이면 null
  const times = w.exercises.flatMap(e => e.sets.map(s => s.t)).filter(Boolean).sort().map(t => new Date(t));
  if (times.length < 2) return null;
  return (times[times.length - 1] - times[0]) / 1000 / (times.length - 1);
}

function dateLabel(iso) {                       // "10/05"
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, "0")}`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}


// ---------- 3. 메모 형식으로 바꾸기 (노트북 ①에 그대로 붙여넣기) ----------

// [{w:85,r:8},{w:85,r:8},{w:80,r:10}] → "85*8,8 80*10"   (맨몸이면 "13,12,11")
function formatSets(name, sets) {
  if (isBodyweight(name)) return sets.map(s => s.r).join(",");
  const groups = [];
  for (const s of sets) {
    const last = groups[groups.length - 1];
    if (last && last.w === s.w) last.reps.push(s.r);       // 앞 세트와 같은 무게면 횟수만 이어 쓰기
    else groups.push({ w: s.w, reps: [s.r] });
  }
  return groups.map(g => `${num(g.w)}*${g.reps.join(",")}`).join(" ");
}

// 운동 한 번 → "가슴 10/05\n◦ Bench press: 85*8,8,7 @8\n…"
function toMemo(w) {
  const lines = [`${w.split} ${dateLabel(w.start)}`];       // 노트북은 줄 맨 앞 '가슴'만 봄 → 날짜는 참고용
  for (const e of w.exercises) {
    if (!e.sets.length) continue;
    const rpe = e.rpe ? ` @${e.rpe}` : "";
    lines.push(`◦ ${e.name}: ${formatSets(e.name, e.sets)}${rpe}`);
  }
  return lines.join("\n");
}


// ---------- 4. 버튼이 하는 일 ----------

function startWorkout(split) {
  const w = { id: Date.now().toString(36), split, start: new Date().toISOString(), end: null, exercises: [] };
  data.workouts.push(w);
  data.currentId = w.id;
  save();
  Object.assign(ui, { screen: "workout", active: null, menu: null, edit: null, adding: true, query: "", focusSearch: true });
  render();
}

function addExercise(name) {
  name = name.trim();
  if (!name) return;
  if (!EXERCISES[name] && !data.custom[name]) {           // 처음 보는 종목 → 부위 · 종류를 정하는 칸 열기
    return openForm(name, false);
  }
  const w = current();
  w.exercises.push({ name, rpe: null, sets: [], draft: initialDraft(w.split, name) });
  Object.assign(ui, { active: w.exercises.length - 1, adding: false, query: "", menu: null, edit: null });
  save();
  render();
}

// 새 종목 칸 열기 (editing = true면 이미 있는 내 종목의 부위 · 종류 고치기)
function openForm(name, editing) {
  if (/[\/:@*,]/.test(name)) { alert("종목 이름에는 / : @ * , 를 쓸 수 없어요 (메모 형식과 겹쳐서)"); return; }
  const old = data.custom[name];
  ui.form = {
    name, editing,
    part: old && old.part !== "미분류" ? old.part : current().split,   // 기본값 = 오늘 분할
    bodyweight: old ? old.step === 0 : false,
    step: old && old.step ? old.step : 5,
  };
  render();
}

function saveForm() {
  const f = ui.form;
  const old = data.custom[f.name];
  data.custom[f.name] = { part: f.part, range: old ? old.range : [8, 12], step: f.bodyweight ? 0 : f.step };
  data.customDirty = true;                     // 다음 동기화 때 올리기
  ui.form = null;
  save();
  if (f.editing) render();
  else addExercise(f.name);                    // 새 종목이면 저장하고 바로 오늘 운동에 추가
}

function changeDraft(i, field, delta) {
  const e = current().exercises[i];
  const step = field === "w" ? settingOf(e.name).step : 1;
  e.draft[field] = Math.max(0, +(e.draft[field] + delta * step).toFixed(2));
  save();
  render();
}

function typeDraft(i, field, value) {           // 숫자를 직접 칠 때: 다시 그리지 않고 값만 저장
  const v = parseFloat(value);
  if (!isNaN(v) && v >= 0) current().exercises[i].draft[field] = field === "r" ? Math.round(v) : v;
  save();
}

function completeSet(i) {                       // [세트 완료] 또는 [수정 완료]
  const e = current().exercises[i];
  if (e.draft.r <= 0) return;
  const set = { w: isBodyweight(e.name) ? 0 : e.draft.w, r: e.draft.r, t: new Date().toISOString() };   // t = 완료 시각 (휴식 계산용)
  if (ui.edit && ui.edit.ex === i) {
    set.t = e.sets[ui.edit.set].t;              // 수정은 시각을 바꾸지 않음
    e.sets[ui.edit.set] = set;                  // 수정: 그 자리의 세트를 바꿈 (순서 유지)
    ui.edit = null;
    if (e.sets.length) e.draft = { ...e.sets[e.sets.length - 1] };
  } else {
    e.sets.push(set);                           // 새 세트: 맨 뒤에 추가. ± 칸 값은 그대로 → 다음 세트에 재사용
  }
  ui.menu = null;
  save();
  render();
}

function openMenu(i, j) {
  ui.menu = (ui.menu && ui.menu.ex === i && ui.menu.set === j) ? null : { ex: i, set: j };
  render();
}

function editSet(i, j) {
  const e = current().exercises[i];
  e.draft = { ...e.sets[j] };                   // 그 세트 값을 ± 칸으로
  Object.assign(ui, { edit: { ex: i, set: j }, menu: null, active: i });
  render();
}

function cancelEdit() {
  const e = current().exercises[ui.edit.ex];
  if (e.sets.length) e.draft = { ...e.sets[e.sets.length - 1] };
  ui.edit = null;
  render();
}

function deleteSet(i, j) {
  current().exercises[i].sets.splice(j, 1);
  ui.menu = null;
  ui.edit = null;
  save();
  render();
}

function setRpe(i, value) {
  const e = current().exercises[i];
  e.rpe = e.rpe === value ? null : value;      // 같은 걸 다시 누르면 취소
  save();
  render();
}

function removeExercise(i) {
  const e = current().exercises[i];
  if (e.sets.length && !confirm(`${e.name}의 세트 ${e.sets.length}개를 지울까요?`)) return;
  current().exercises.splice(i, 1);
  Object.assign(ui, { active: null, menu: null, edit: null });
  save();
  render();
}

function finishWorkout() {
  const w = current();
  if (!totalSets(w)) {
    if (!confirm("기록한 세트가 없어요. 이 운동을 지울까요?")) return;
    data.workouts = data.workouts.filter(x => x.id !== w.id);
    data.currentId = null;
    save();
    ui.screen = "workouts";
    render();
    return;
  }
  if (!confirm("운동을 끝낼까요?")) return;
  w.end = new Date().toISOString();
  w.exercises = w.exercises.filter(e => e.sets.length);    // 세트 없는 종목은 정리
  data.currentId = null;
  save();
  Object.assign(ui, { screen: "summary", summaryId: w.id });
  render();
  if (typeof syncNow === "function") syncNow();              // 로그인돼 있으면 바로 올리기 (sync.js)
}

function deleteWorkout(id) {
  if (!confirm("이 운동 기록을 지울까요? 되돌릴 수 없어요.")) return;
  const w = data.workouts.find(x => x.id === id);
  if (w && w.synced) data.deleted.push(id);   // 인터넷에 올라가 있던 거면 거기서도 지우기 (다음 동기화 때)
  data.workouts = data.workouts.filter(w => w.id !== id);
  save();
  ui.screen = "workouts";
  render();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    alert("복사했어요. 노트북 ①의 MEMO 맨 아래에 붙여넣으세요.");
  } catch (e) {
    const box = document.querySelector("textarea");
    if (box) { box.select(); alert("자동 복사가 안 돼요. 선택된 글을 길게 눌러 복사하세요."); }
  }
}

function downloadBackup() {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `iwbm-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function restoreBackup(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const restored = JSON.parse(reader.result);
      if (!Array.isArray(restored.workouts)) throw new Error("모양이 달라요");
      if (!confirm(`백업의 운동 ${restored.workouts.length}개로 지금 기록을 바꿀까요?`)) return;
      data = { ...EMPTY_EXTRAS(), workouts: restored.workouts, currentId: restored.currentId || null, custom: restored.custom || {},
               customDirty: true, body: restored.body || {}, meals: restored.meals || [], nutrition: restored.nutrition || null };
      data.workouts.forEach(w => { w.synced = false; });           // 백업으로 바꾼 기록은 다시 올리기 (upsert라 겹치지 않음)
      Object.values(data.body).forEach(b => { b.synced = false; });
      data.meals.forEach(m => { m.synced = false; });
      if (data.nutrition) data.nutrition.dirty = true;
      save();
      ui.screen = data.currentId ? "workout" : "home";
      render();
    } catch (e) {
      alert("백업 파일을 읽지 못했어요.");
    }
  };
  reader.readAsText(file);
}


// ---------- 5. 화면 그리기 ----------

// 홈: Workout / Nutrition 두 갈래만. 버튼 안에 최근 상태를 한 줄씩
function homeView() {
  const last = finishedWorkouts().pop();
  const nutritionLine = typeof nutritionSummary === "function" ? nutritionSummary() : "";   // nutrition.js
  return `
    <header class="bar"><h1>I will become monster</h1></header>
    <main>
      <div class="sections">
        <button class="section-button" data-action="workouts">
          <b>🏋️ Workout</b>
          <span class="muted small">분할 운동 기록 · 운동 그래프</span>
          <span class="small">${last ? `지난 운동 ${dateLabel(last.start)} ${last.split}` : "아직 기록 없음"}</span>
        </button>
        <button class="section-button" data-action="nutrition">
          <b>🥗 Nutrition</b>
          <span class="muted small">식단 · 체중</span>
          <span class="small">${nutritionLine}</span>
        </button>
      </div>
      ${typeof accountCard === "function" ? accountCard() : ""}
      <div class="row gap">
        <button data-action="backup">백업</button>
        <label class="button">복원<input type="file" accept="application/json" data-action="restore" hidden></label>
      </div>
      <p class="muted small">백업 파일에는 운동 · 체중 · 식사가 모두 들어가요.</p>
      <p class="muted small version">${APP_VERSION}</p>
    </main>`;
}

// Workout: [기록] 분할 고르기 + 지난 운동 / [그래프] 종목별 e1RM (v0.4-d-2)
function workoutsView() {
  const tab = ui.workoutTab;
  const past = finishedWorkouts().reverse();
  const list = past.length ? past.map(w => `
      <button class="history" data-action="open-summary" data-id="${w.id}">
        <div class="history-top"><b>${dateLabel(w.start)} ${w.split}</b>
          <span>${w.exercises.length}종목 · ${totalSets(w)}세트 · ${duration(w)}</span></div>
        <div class="muted small">${w.exercises.map(e => escapeHtml(e.name)).join(", ")}</div>
      </button>`).join("")
    : `<p class="muted">아직 기록이 없어요. 위에서 분할을 골라 시작하세요.</p>`;
  const body = tab === "log" ? `
      <h2>오늘 분할은?</h2>
      <div class="grid2">${DAYS.map(d => `<button class="big" data-action="start" data-split="${d}">${d}</button>`).join("")}</div>
      <h2>지난 운동</h2>
      ${list}
      <div class="row gap">
        <button data-action="import-screen">메모 가져오기</button>
        <button data-action="export">내보내기</button>
      </div>` : `
      ${typeof progressView === "function" ? progressView() : ""}`;      // progress.js
  return `
    <header class="bar"><h1>🏋️ Workout</h1><button class="small" data-action="home">홈</button></header>
    <div class="tabs">
      <button class="${tab === "log" ? "selected" : ""}" data-action="workout-tab" data-v="log">기록</button>
      <button class="${tab === "graph" ? "selected" : ""}" data-action="workout-tab" data-v="graph">그래프</button>
    </div>
    <main>${body}</main>`;
}

function setChips(i, e) {
  return e.sets.map((s, j) => {
    const label = isBodyweight(e.name) ? `${s.r}회` : `${num(s.w)}×${s.r}`;
    const editing = ui.edit && ui.edit.ex === i && ui.edit.set === j;
    const menu = ui.menu && ui.menu.ex === i && ui.menu.set === j ? `
        <span class="menu">
          <button data-action="edit-set" data-i="${i}" data-j="${j}">수정</button>
          <button class="danger" data-action="delete-set" data-i="${i}" data-j="${j}">삭제</button>
        </span>` : "";
    return `<span class="chip-wrap"><button class="chip ${editing ? "editing" : ""}" data-action="chip" data-i="${i}" data-j="${j}">${label}</button>${menu}</span>`;
  }).join("");
}

function exerciseCard(e, i, split) {
  const open = ui.active === i;
  const bw = isBodyweight(e.name);
  const summary = e.sets.length ? formatSets(e.name, e.sets) : "아직 세트 없음";
  if (!open) {
    return `
      <section class="card">
        <button class="card-head" data-action="open" data-i="${i}">
          <b>${escapeHtml(e.name)}</b><span class="muted small">${summary}${e.rpe ? " @" + e.rpe : ""}</span>
        </button>
      </section>`;
  }
  const last = lastTimeSets(split, e.name);
  const editing = ui.edit && ui.edit.ex === i;
  const stepper = (field, unit, value) => `
      <div class="stepper">
        <button data-action="minus" data-i="${i}" data-field="${field}" aria-label="빼기">−</button>
        <label><input type="number" inputmode="decimal" value="${num(value)}" data-action="type" data-i="${i}" data-field="${field}"> ${unit}</label>
        <button data-action="plus" data-i="${i}" data-field="${field}" aria-label="더하기">+</button>
      </div>`;
  return `
    <section class="card open">
      <div class="card-head static">
        <b>${escapeHtml(e.name)}</b>
        <button class="link danger small" data-action="remove-ex" data-i="${i}">종목 빼기</button>
      </div>
      ${last ? `<p class="muted small">지난번 ${split}: ${formatSets(e.name, last)}${lastTimeExercise(split, e.name).rpe ? " @" + lastTimeExercise(split, e.name).rpe : ""}</p>` : ""}
      ${last ? (n => `<p class="goal">다음 목표 <b>${bw ? "" : num(n.weight) + "kg · "}</b>${n.reason}</p>`)(suggestion(split, e.name)) : ""}
      ${bw ? "" : stepper("w", "kg", e.draft.w)}
      ${stepper("r", "회", e.draft.r)}
      <button class="primary" data-action="complete" data-i="${i}">${editing ? `${ui.edit.set + 1}세트 수정 완료 ✓` : "세트 완료 ✓"}</button>
      ${editing ? `<button class="link small" data-action="cancel-edit">수정 취소</button>` : ""}
      <div class="chips">${setChips(i, e)}</div>
      <div class="rpe"><span class="muted small">마지막 세트 RPE</span>
        ${RPE_CHOICES.map(v => `<button class="${e.rpe === v ? "selected" : ""}" data-action="rpe" data-i="${i}" data-v="${v}">${v}</button>`).join("")}
      </div>
    </section>`;
}

// 부위 순서: 오늘 분할 → 나머지 기본 부위 → 내가 만든 부위 → 미분류
function partOrder(split) {
  const parts = new Set([split, ...PART_ORDER]);
  Object.values(data.custom).forEach(c => parts.add(c.part));
  parts.delete("미분류");
  return [...parts, "미분류"];
}

function formPanel() {
  const f = ui.form;
  const parts = PART_ORDER.includes(f.part) ? PART_ORDER : [...PART_ORDER, f.part];
  return `
    <section class="card add">
      <div class="card-head static"><b>${escapeHtml(f.name)}</b><button class="link small" data-action="close-form">취소</button></div>
      <p class="muted small">${f.editing ? "부위 · 종류 고치기" : "새 종목이에요. 부위와 종류를 골라 주세요."}</p>
      <p class="label">부위</p>
      <div class="choices">${parts.map(p => `<button class="${f.part === p ? "selected" : ""}" data-action="form-part" data-v="${p}">${p}</button>`).join("")}</div>
      <p class="label">종류</p>
      <div class="choices">
        <button class="${!f.bodyweight ? "selected" : ""}" data-action="form-bw" data-v="0">무게 운동</button>
        <button class="${f.bodyweight ? "selected" : ""}" data-action="form-bw" data-v="1">맨몸 운동</button>
      </div>
      ${f.bodyweight ? "" : `<p class="label">증량 단위 (± 버튼 한 번)</p>
      <div class="choices">${STEP_CHOICES.map(v => `<button class="${f.step === v ? "selected" : ""}" data-action="form-step" data-v="${v}">${v}kg</button>`).join("")}</div>`}
      <button class="primary wide" data-action="save-form">${f.editing ? "저장" : "저장하고 추가"}</button>
    </section>`;
}

function addPanel(w) {
  if (ui.form) return formPanel();
  const q = ui.query.trim().toLowerCase();
  const done = new Set(w.exercises.map(e => e.name));
  const lastSame = finishedWorkouts().filter(x => x.split === w.split).pop();
  const suggested = lastSame ? lastSame.exercises.map(e => e.name).filter(n => !done.has(n)) : [];
  const all = [...Object.keys(EXERCISES), ...Object.keys(data.custom)]
    .filter(n => !done.has(n) && n.toLowerCase().includes(q));
  const item = n => {
    const mine = data.custom[n];
    const fix = mine ? `<button class="link small" data-action="edit-form" data-name="${escapeHtml(n)}">${mine.part === "미분류" ? "부위 정하기" : "수정"}</button>` : "";
    return `<div class="pick-row"><button class="pick" data-action="pick" data-name="${escapeHtml(n)}">${escapeHtml(n)}</button>${fix}</div>`;
  };
  // 부위별로 묶고, 묶음 안에서는 알파벳 순서
  const groups = partOrder(w.split).map(part => {
    const names = all.filter(n => settingOf(n).part === part)
      .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
    return names.length ? `<p class="group">${part}</p>${names.map(item).join("")}` : "";
  }).join("");
  const exact = all.some(n => n.toLowerCase() === q);
  return `
    <section class="card add">
      <div class="card-head static"><b>종목 추가</b><button class="link small" data-action="close-add">닫기</button></div>
      <input type="search" placeholder="종목 검색 (예: bench)" value="${escapeHtml(ui.query)}" data-action="search" autocomplete="off">
      ${q && !exact ? `<button class="pick new" data-action="pick" data-name="${escapeHtml(ui.query.trim())}">+ "${escapeHtml(ui.query.trim())}" 새 종목으로 추가</button>` : ""}
      ${!q && suggested.length ? `<p class="group">지난번 ${w.split}에서 한 종목</p>${suggested.map(item).join("")}` : ""}
      <div class="pick-list">${groups}</div>
    </section>`;
}

function workoutView() {
  const w = current();
  return `
    <div class="top">
      <header class="bar">
        <h1>${w.split} <span class="muted small">${dateLabel(w.start)}</span></h1>
        <button class="primary small" data-action="finish">운동 끝</button>
      </header>
      <div class="timers">
        <div><span>전체</span><b id="t-total">0:00</b></div>
        <div><span>휴식</span><b id="t-rest">—</b></div>
      </div>
    </div>
    <main>
      ${w.exercises.map((e, i) => exerciseCard(e, i, w.split)).join("")}
      ${ui.adding ? addPanel(w) : `<button class="add-button" data-action="open-add">+ 종목 추가</button>`}
    </main>`;
}

function summaryView() {
  const w = data.workouts.find(x => x.id === ui.summaryId);
  if (!w) { ui.screen = "workouts"; return workoutsView(); }
  return `
    <header class="bar"><h1>${dateLabel(w.start)} ${w.split}</h1><button class="small" data-action="workouts">Workout</button></header>
    <main>
      <div class="stats">
        <div><b>${w.exercises.length}</b><span>종목</span></div>
        <div><b>${totalSets(w)}</b><span>세트</span></div>
        <div><b>${duration(w)}</b><span>운동 시간</span></div>
      </div>
      ${averageRest(w) ? `<p class="muted small center">세트 사이 평균 휴식 ${clock(averageRest(w))}</p>` : ""}
      <h2>메모 형식</h2>
      <textarea readonly rows="${w.exercises.length + 2}">${escapeHtml(toMemo(w))}</textarea>
      <button class="primary" data-action="copy">복사하기</button>
      <button class="link danger small" data-action="delete-workout" data-id="${w.id}">이 운동 기록 지우기</button>
    </main>`;
}

function exportView() {
  const text = finishedWorkouts().map(toMemo).join("\n\n");
  return `
    <header class="bar"><h1>내보내기</h1><button class="small" data-action="workouts">Workout</button></header>
    <main>
      <p class="muted small">끝난 운동 전체를 오래된 순서로 메모 형식으로 바꿨어요. 노트북 ①의 MEMO에 붙여넣으세요.</p>
      <textarea readonly rows="16">${escapeHtml(text || "아직 끝난 운동이 없어요.")}</textarea>
      <button class="primary" data-action="copy">복사하기</button>
    </main>`;
}

// 스톱워치: 1초마다 숫자 두 개만 바꿈 (화면 전체를 다시 그리지 않음 → 입력 중인 칸이 안 흔들림)
function tick() {
  const w = current();
  const total = document.getElementById("t-total");
  const rest = document.getElementById("t-rest");
  if (!w || !total) return;
  total.textContent = clock((Date.now() - new Date(w.start)) / 1000);
  const last = lastSetTime(w);
  rest.textContent = last ? clock((Date.now() - new Date(last)) / 1000) : "—";
}
setInterval(tick, 1000);

function render() {
  const views = { home: homeView, workouts: workoutsView, workout: workoutView, summary: summaryView, export: exportView,
                  login: () => loginView(),                       // loginView는 sync.js에 있음
                  import: () => importView(),                     // importView는 import.js에 있음
                  nutrition: () => nutritionView() };             // nutritionView는 nutrition.js에 있음
  if (ui.screen === "workout" && !current()) ui.screen = "workouts";
  document.getElementById("app").innerHTML = views[ui.screen]();
  const search = document.querySelector('[data-action="search"]');
  tick();
  if (search && ui.focusSearch) {
    search.focus();
    search.setSelectionRange(search.value.length, search.value.length);
    ui.focusSearch = false;
  }
}


// ---------- 6. 버튼 연결: 화면 어디를 눌러도 여기로 와서 data-action을 보고 나눠 줌 ----------

document.addEventListener("click", event => {
  const el = event.target.closest("[data-action]");
  if (!el) return;
  const i = Number(el.dataset.i), j = Number(el.dataset.j);
  switch (el.dataset.action) {
    case "start": return startWorkout(el.dataset.split);
    case "open-add": Object.assign(ui, { adding: true, query: "", focusSearch: true, form: null }); return render();
    case "close-add": Object.assign(ui, { adding: false, form: null }); return render();
    case "close-form": ui.form = null; return render();
    case "edit-form": return openForm(el.dataset.name, true);
    case "form-part": ui.form.part = el.dataset.v; return render();
    case "form-bw": ui.form.bodyweight = el.dataset.v === "1"; return render();
    case "form-step": ui.form.step = Number(el.dataset.v); return render();
    case "save-form": return saveForm();
    case "pick": return addExercise(el.dataset.name);
    case "open": Object.assign(ui, { active: i, menu: null, edit: null }); return render();
    case "minus": return changeDraft(i, el.dataset.field, -1);
    case "plus": return changeDraft(i, el.dataset.field, +1);
    case "complete": return completeSet(i);
    case "chip": return openMenu(i, j);
    case "edit-set": return editSet(i, j);
    case "delete-set": return deleteSet(i, j);
    case "cancel-edit": return cancelEdit();
    case "rpe": return setRpe(i, Number(el.dataset.v));
    case "remove-ex": return removeExercise(i);
    case "finish": return finishWorkout();
    case "open-summary": Object.assign(ui, { screen: "summary", summaryId: el.dataset.id }); return render();
    case "delete-workout": return deleteWorkout(el.dataset.id);
    case "home": ui.screen = "home"; return render();
    case "workouts": ui.screen = "workouts"; return render();
    case "workout-tab": ui.workoutTab = el.dataset.v; return render();
    case "export": ui.screen = "export"; return render();
    case "copy": return copyText(document.querySelector("textarea").value);
    case "backup": return downloadBackup();
  }
});

document.addEventListener("input", event => {
  const el = event.target;
  if (el.dataset.action === "search" && !event.isComposing) {   // 한글 조합 중에는 기다림
    Object.assign(ui, { query: el.value, focusSearch: true });
    render();
  }
  if (el.dataset.action === "type") typeDraft(Number(el.dataset.i), el.dataset.field, el.value);
});

document.addEventListener("compositionend", event => {           // 한글 한 글자 조합이 끝나면 검색
  if (event.target.dataset.action === "search") {
    Object.assign(ui, { query: event.target.value, focusSearch: true });
    render();
  }
});

document.addEventListener("change", event => {
  if (event.target.dataset.action === "restore") restoreBackup(event.target.files[0]);
});


// ---------- 7. 시작 ----------

if (navigator.storage && navigator.storage.persist) navigator.storage.persist();   // "이 기록 함부로 지우지 마" 요청
if ("serviceWorker" in navigator) {
  const hadOldVersion = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js");                                       // 오프라인 동작
  navigator.serviceWorker.addEventListener("controllerchange", () => {             // 새 버전이 설치되면
    if (hadOldVersion) location.reload();                                          //   바로 새로 고쳐서 보여 주기
  });
}
render();
