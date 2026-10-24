// I will become monster — v0.4-d-1 · e 체중 · 식단 (🥗 Nutrition 화면)
//
// [지도]
//   들어오는 것: 매일 체중, 끼니마다 음식 + 칼로리 + 탄단지 (직접 적기 · 최근 먹은 것 · 식약처 DB 검색)
//   하는 일:     weight_log.ipynb ③~⑤를 JS로 옮긴 것 — 7일 평균, 내 기록으로 유지 칼로리 역산, 추천 섭취
//                + 그날 탄단지 비율 vs 목표 비율
//   나가는 것:   🥗 Nutrition 화면 (탭: 식단 / 체중)  +  Supabase 표 3개 올리기 · 받기
//
// [저장 모양] app.js의 data 안에 같이 저장
//   body:  { "2026-10-09": { w: 83.6, smm: 36.2, pbf: 17.8, synced: false } }   ← 하루에 체중 하나 (+ 인바디 잰 날만 골격근량 kg · 체지방률 %)
//   meals: [ { id, day: "2026-10-09", slot: "아침", food, kcal, c, p, f, synced } ]   ← 음식 하나 = 한 줄
//   nutrition: { ratio: [50, 30, 20], kgPerWeek: -0.5, dayRatios: { "2026-10-12": [60, 20, 20] },
//                profile: { sex: "남", birthYear: 2003, height: 178, activity: 2 } 또는 null,   ← 공식용 내 정보
//                manualMaintenance: 2750 또는 null,                                          ← 직접 입력한 유지 칼로리
//                dayStatus: { "2026-10-10": false },   ← 직접 표시: true = 다 적은 날, false = 덜 적은 날 (없으면 자동 판정)
//                dirty }
//   deletedMeals: [id], deletedWeights: [day]                               ← 인터넷에서도 지울 것

// ---------- 0. 설정 (노트북 ②와 같은 손잡이) ----------

const DEFAULT_RATIO = [50, 30, 20];        // 탄:단:지 (%) — 설정을 한 번도 안 바꾼 사람의 기본값
const RATIO_PRESETS = [[50, 30, 20], [40, 30, 30]];
const DEFAULT_KG_PER_WEEK = -0.5;          // 목표 속도 (kg/주): 감량 -0.5 / 유지 0 / 증량 0.25
const SPEED_CHOICES = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5];
const INITIAL_MAINTENANCE = 2500;          // 내 정보도 직접 입력도 없을 때 쓰는 유지 칼로리 (kcal)
const COMPLETE_DAY_RATIO = 0.6;            // 그날 칼로리가 (처음 추정) 추천 섭취의 60%보다 적으면 "덜 적은 날" → 계산에서 뺌
const ACTIVITY_LEVELS = [                  // 활동계수 (기초대사량에 곱함)
  { factor: 1.2,   name: "거의 안 움직임", example: "운동은 거의 안 하고, 대부분 앉아서 생활" },
  { factor: 1.375, name: "가벼움",        example: "가벼운 운동(걷기 · 가벼운 홈트레이닝) 주 1~3일" },
  { factor: 1.55,  name: "보통",          example: "중간 강도 운동(웨이트 · 조깅) 주 3~5일" },
  { factor: 1.725, name: "많음",          example: "고강도 운동(무거운 웨이트 · 러닝 · 인터벌) 주 6~7일" },
  { factor: 1.9,   name: "매우 많음",     example: "고강도 운동을 하루 2번 하거나, 매일 고강도 운동 + 몸을 많이 쓰는 일" },
];
const WINDOW_DAYS = 14;                    // 최근 며칠로 유지 칼로리를 계산할지
const MIN_WEIGHT_DAYS = 10;                // 그 기간에 체중 기록이 최소 며칠
const MIN_KCAL_DAYS = 7;                   // 그 기간에 식사 기록이 최소 며칠 (오늘은 아직 덜 먹었으니 빼고 셈)
const KCAL_PER_KG = 7700;                  // 체중 1kg ≈ 7700kcal
const CHART_DAYS = 30;                     // 체중 그래프에 보여 줄 날 수
const COMP_SHOWN = 10;                     // 체성분(인바디) 기록을 최근 몇 번까지 보여 줄지
const RECENT_FOODS_SHOWN = 8;              // 음식 추가 칸에 보여 줄 "최근 먹은 것" 개수
const FOOD_DB_SHOWN = 15;                  // 식약처 검색 결과를 몇 개까지 보여 줄지 (서버 함수 supabase/functions/food-search)
const PLAN_AHEAD_DAYS = 7;                 // 식단을 며칠 뒤까지 미리 적을 수 있는지 (체중은 미래에 못 적음)
const MEAL_SLOTS = ["아침", "점심", "저녁", "간식"];
const MACROS = [                           // 1g당 칼로리
  { key: "c", name: "탄", kcal: 4 },
  { key: "p", name: "단", kcal: 4 },
  { key: "f", name: "지", kcal: 9 },
];

Object.assign(ui, {
  nutritionTab: "food",  // Nutrition 화면의 탭: food(식단) / weight(체중)
  day: null,             // 보고 있는 날 ("2026-10-09"), null = 오늘
  weightDraft: null,     // 체중 칸에 들어 있는 값
  compOpen: false,       // 인바디 결과 칸을 펼쳤나
  compDraft: {},         // 인바디 칸에 친 값 { "c-smm": "36.2", "c-pbf": "17.8" } (다시 그려도 안 지워지게)
  mealForm: null,        // 음식 추가 칸이 열린 끼니 ("아침" …)
  ratioPanel: false,     // 목표 비율 바꾸기 칸
  ratioDraft: null,
  speedPanel: false,     // 목표 속도 바꾸기 칸
  basePanel: false,      // 처음 유지 칼로리 정하기 칸 (공식 / 직접 입력)
  baseDraft: null,       // { mode: "formula" | "manual", sex, activity } — 버튼으로 고르는 것만
  foodDb: null,          // 식약처 검색: { state: "loading" | "done" | "error", items, message, pick: 고른 결과 번호 }
});


// ---------- 1. 날짜 · 숫자 도우미 ----------

function isoDay(d = new Date()) {                              // 폰 시간 기준 "2026-10-09"
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(day, n) {                                     // addDays("2026-10-09", -1) → "2026-10-08"
  const d = new Date(day + "T12:00:00");
  d.setDate(d.getDate() + n);
  return isoDay(d);
}
function daysBetween(a, b) {                                   // daysBetween("2026-10-01", "2026-10-09") → 8
  return Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);
}
function dayLabel(day) {                                       // "2026-10-09" → "10/09"
  const [, m, d] = day.split("-");
  return `${+m}/${d}`;
}
const kcalText = x => Math.round(x).toLocaleString("ko-KR");   // 2200 → "2,200"
const signed = x => (x > 0 ? "+" : x < 0 ? "−" : "±") + num(Math.abs(x));
const round1 = x => Math.round(x * 10) / 10;


// ---------- 2. 계산 — 노트북 ③~⑤ ----------

function nutritionSettings() {
  if (!data.nutrition) data.nutrition = { ratio: [...DEFAULT_RATIO], kgPerWeek: DEFAULT_KG_PER_WEEK, dayRatios: {}, dirty: false };
  const s = data.nutrition;                                    // 예전에 저장된 설정에는 없는 칸 채우기
  if (s.profile === undefined) s.profile = null;
  if (s.manualMaintenance === undefined) s.manualMaintenance = null;
  if (!s.dayStatus) s.dayStatus = {};
  return s;
}

function weightDays() {                                        // 체중을 잰 날들, 오래된 순
  return Object.keys(data.body).sort();
}

function lastWeightUpTo(day) {                                 // 그날까지 가장 최근 체중 (없으면 null)
  const days = weightDays().filter(d => d <= day);
  return days.length ? data.body[days[days.length - 1]].w : null;
}

// 그날 포함 최근 7일에 잰 체중의 평균 (노트북 rolling("7D")). 안 잰 날은 빼고 잰 날만.
function avg7(day) {
  const ws = weightDays().filter(d => d <= day && d > addDays(day, -7)).map(d => data.body[d].w);
  return ws.length ? ws.reduce((a, b) => a + b, 0) / ws.length : null;
}

function dayTotals(day) {                                      // 그날 먹은 것 합계
  const t = { kcal: 0, c: 0, p: 0, f: 0, count: 0 };
  for (const m of data.meals) {
    if (m.day !== day) continue;
    t.kcal += m.kcal; t.c += m.c; t.p += m.p; t.f += m.f; t.count++;
  }
  return t;
}

function slope(xs, ys) {                                       // 직선의 기울기 = np.polyfit(x, y, 1)[0]
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let top = 0, bottom = 0;
  for (let i = 0; i < n; i++) { top += (xs[i] - mx) * (ys[i] - my); bottom += (xs[i] - mx) ** 2; }
  return bottom ? top / bottom : 0;
}

// 기록이 쌓이기 전의 유지 칼로리: 직접 입력 > 공식(Mifflin-St Jeor 기초대사량 × 활동계수) > 기본값
function baseMaintenance(today) {
  const s = nutritionSettings();
  if (s.manualMaintenance) return { value: s.manualMaintenance, source: "manual" };
  const p = s.profile;
  const w = avg7(today) ?? lastWeightUpTo(today);
  if (p && w) {
    const age = Number(today.slice(0, 4)) - p.birthYear;
    const bmr = 10 * w + 6.25 * p.height - 5 * age + (p.sex === "남" ? 5 : -161);
    const factor = ACTIVITY_LEVELS[p.activity].factor;
    return { value: Math.round(bmr * factor / 10) * 10, source: "formula", bmr, factor };
  }
  return { value: INITIAL_MAINTENANCE, source: "default" };
}

// 이 날 식사를 유지 칼로리 계산에 넣을까?  직접 표시가 있으면 그대로, 없으면 칼로리가 기준(minKcal) 이상인지로 자동 판정
function dayCounted(day, minKcal) {
  const marked = nutritionSettings().dayStatus[day];
  if (marked === true || marked === false) return marked;
  const t = dayTotals(day);
  return t.count > 0 && t.kcal >= minKcal;
}
const completeDayKcal = today => targetKcal(baseMaintenance(today).value) * COMPLETE_DAY_RATIO;

// 유지 칼로리 = 평균 섭취 − (하루 체중 변화 × 7700)   ← 노트북 ④
//   평균 섭취에는 "다 적은 날"만 넣음 (한 끼만 적은 날이 섞이면 평균이 낮아져서 유지 칼로리가 틀어짐)
function maintenanceInfo(today) {
  const start = addDays(today, -WINDOW_DAYS);                  // 최근 14일 = (start, today]
  const minKcal = completeDayKcal(today);
  const wdays = weightDays().filter(d => d > start && d <= today);
  const kdays = [...new Set(data.meals.map(m => m.day))]
    .filter(d => d > start && d < today && dayCounted(d, minKcal));   // 오늘은 아직 덜 먹었으니 빼고, 덜 적은 날도 빼고
  const base = baseMaintenance(today);
  const info = { weightDays: wdays.length, kcalDays: kdays.length, base };
  if (wdays.length < MIN_WEIGHT_DAYS || kdays.length < MIN_KCAL_DAYS) {
    return { ...info, maintenance: base.value, fromRecords: false };
  }
  const perDay = slope(wdays.map(d => daysBetween(wdays[0], d)), wdays.map(d => data.body[d].w));
  const meanKcal = kdays.reduce((s, d) => s + dayTotals(d).kcal, 0) / kdays.length;
  return { ...info, maintenance: meanKcal - perDay * KCAL_PER_KG, fromRecords: true, meanKcal, perWeek: perDay * 7 };
}

// 추천 섭취 = 유지 + 목표 kg/주 × 7700 ÷ 7, 10kcal 단위   ← 노트북 ⑤
function targetKcal(maintenance) {
  return Math.round((maintenance + nutritionSettings().kgPerWeek * KCAL_PER_KG / 7) / 10) * 10;
}

function ratioOf(day) {                                        // 그날 목표 비율 (리피드처럼 그날만 바꾼 게 있으면 그것)
  const s = nutritionSettings();
  return s.dayRatios[day] || s.ratio;
}

function ratioText(r) {                                        // [50, 30, 20] → "5:3:2",  [45, 35, 20] → "45:35:20"
  return r.every(x => x % 10 === 0) ? r.map(x => x / 10).join(":") : r.join(":");
}


// ---------- 3. 버튼이 하는 일 ----------

function changed() {                                           // 저장하고, 로그인돼 있으면 올리기
  save();
  render();
  if (typeof syncNow === "function") syncNow();
}

function saveWeight() {
  const day = ui.day || isoDay();
  if (day > isoDay()) return;                                  // 미래 체중은 안 받음
  const input = document.querySelector('[data-action="n-weight"]');           // 칸에 보이는 값 (± 를 안 눌러도 그대로 저장)
  const w = round1(Number(input ? input.value : ui.weightDraft));
  if (!(w > 20 && w < 300)) return alert("체중을 확인해 주세요.");
  // 인바디 결과 (선택): 비우면 없음
  const comp = {};
  for (const [key, id, low, high, name] of [["smm", "c-smm", 5, 100, "골격근량"], ["pbf", "c-pbf", 2, 70, "체지방률"]]) {
    const el = document.getElementById(id);
    if (!el || el.value.trim() === "") continue;
    const v = round1(Number(el.value));
    if (!(v >= low && v <= high)) return alert(`${name} 숫자를 확인해 주세요.`);
    comp[key] = v;
  }
  data.body[day] = { w, ...comp, synced: false };
  data.deletedWeights = data.deletedWeights.filter(d => d !== day);
  Object.assign(ui, { weightDraft: null, compOpen: false, compDraft: {} });
  changed();
}

function deleteWeight() {
  const day = ui.day || isoDay();
  if (!confirm(`${dayLabel(day)} 체중을 지울까요?`)) return;
  if (data.body[day].synced) data.deletedWeights.push(day);
  delete data.body[day];
  ui.weightDraft = null;
  changed();
}

function saveMeal() {
  const read = id => document.getElementById(id).value.trim();
  const food = read("m-food");
  const [c, p, f] = ["m-c", "m-p", "m-f"].map(id => Number(read(id) || 0));
  let kcal = read("m-kcal") === "" ? c * 4 + p * 4 + f * 9 : Number(read("m-kcal"));   // 칼로리를 비우면 탄단지로 계산
  if (!food) return alert("음식 이름을 적어 주세요.");
  if ([kcal, c, p, f].some(x => isNaN(x) || x < 0)) return alert("숫자를 확인해 주세요.");
  data.meals.push({
    id: "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    day: ui.day || isoDay(), slot: ui.mealForm, food,
    kcal: Math.round(kcal), c: round1(c), p: round1(p), f: round1(f), synced: false,
  });
  Object.assign(ui, { mealForm: null, foodDb: null });
  changed();
}

function deleteMeal(id) {
  const m = data.meals.find(x => x.id === id);
  if (!m || !confirm(`${m.food}을(를) 지울까요?`)) return;
  if (m.synced) data.deletedMeals.push(id);
  data.meals = data.meals.filter(x => x.id !== id);
  changed();
}

function saveRatio(scope) {                                    // scope: "base" = 기본 비율, "day" = 이 날만
  const r = [0, 1, 2].map(i => Math.round(Number(document.getElementById("r-" + i).value)));
  if (r.some(x => isNaN(x) || x < 0) || r[0] + r[1] + r[2] !== 100) return alert("세 숫자의 합이 100이 되게 적어 주세요.");
  const s = nutritionSettings();
  if (scope === "base") s.ratio = r;
  else s.dayRatios[ui.day || isoDay()] = r;
  s.dirty = true;
  Object.assign(ui, { ratioPanel: false, ratioDraft: null });
  changed();
}

function clearDayRatio() {
  const s = nutritionSettings();
  delete s.dayRatios[ui.day || isoDay()];
  s.dirty = true;
  ui.ratioPanel = false;
  changed();
}

function setSpeed(v) {
  const s = nutritionSettings();
  s.kgPerWeek = v;
  s.dirty = true;
  ui.speedPanel = false;
  changed();
}


// 최근 먹은 음식 (이름이 같으면 가장 최근 것 하나). filter = 음식 이름 칸에 친 글자
function recentFoods(filter = "") {
  const seen = new Map();
  const q = filter.trim().toLowerCase();
  const today = isoDay();
  const newestFirst = data.meals.filter(m => m.day <= today).sort((a, b) => b.day.localeCompare(a.day) || data.meals.indexOf(b) - data.meals.indexOf(a));
  for (const m of newestFirst) {
    const key = m.food.toLowerCase();
    if (seen.has(key) || (q && !key.includes(q))) continue;
    seen.set(key, m);
    if (seen.size >= RECENT_FOODS_SHOWN) break;
  }
  return [...seen.values()];
}

function addMealCopy(m, day, slot) {                          // 음식 하나를 그대로 복사해서 넣기
  data.meals.push({ id: "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    day, slot, food: m.food, kcal: m.kcal, c: m.c, p: m.p, f: m.f, synced: false });
}

function quickMeal(food) {                                    // 최근 음식 누르기 → 이 끼니에 바로 추가 (칸은 열어 둠: 여러 개 넣기 좋게)
  const m = recentFoods().find(x => x.food === food) || [...data.meals].reverse().find(x => x.food === food);
  if (!m) return;
  addMealCopy(m, ui.day || isoDay(), ui.mealForm);
  const typed = ["m-food", "m-kcal", "m-c", "m-p", "m-f"].map(id => [id, document.getElementById(id)?.value ?? ""]);
  changed();                                                   // 다시 그리면 칸이 비니까, 적고 있던 글자를 되돌려 놓음
  for (const [id, value] of typed) { const el = document.getElementById(id); if (el) el.value = value; }
  const box = document.querySelector(".recent-foods");
  if (box) box.innerHTML = recentFoodChips(typed[0][1]);                                                   // (입력 칸에 커서를 다시 두지 않음: 폰 키보드가 튀어나오지 않게)
}

function copyPreviousDay() {                                  // 전날 식단을 이 날로 (같은 끼니에)
  const day = ui.day || isoDay();
  const from = data.meals.filter(m => m.day === addDays(day, -1));
  if (!from.length) return;
  const has = dayTotals(day).count;
  if (!confirm(`${dayLabel(addDays(day, -1))} 식단 ${from.length}개를 ${dayLabel(day)}에 복사할까요?${has ? ` (지금 있는 ${has}개는 그대로 두고 더해요)` : ""}`)) return;
  from.forEach(m => addMealCopy(m, day, m.slot));
  changed();
}

function recentFoodChips(filter) {
  const foods = recentFoods(filter);
  if (!foods.length) return filter ? "" : `<p class="small muted">먹은 음식이 쌓이면 여기서 한 번에 다시 넣을 수 있어요.</p>`;
  return `<p class="label">최근 먹은 것 — 누르면 바로 추가</p>
    <div class="food-chips">${foods.map(m => `
      <button class="food-chip" data-action="n-quick-meal" data-food="${escapeHtml(m.food)}">
        <b>${escapeHtml(m.food)}</b><span class="small muted">${kcalText(m.kcal)}kcal · 탄 ${num(m.c)} 단 ${num(m.p)} 지 ${num(m.f)}</span></button>`).join("")}</div>`;
}

// ---------- 식약처 식품영양성분 DB 검색 (v0.5-g) ----------
//   앱 → 우리 Supabase 서버 함수(food-search) → 식약처. 인증키는 서버에만 있음
//   결과는 "기준량(보통 100g)당" 숫자 → 먹은 양(g)을 넣으면 칸이 그만큼 채워짐 → [추가]

async function searchFoodDb() {
  const q = document.getElementById("m-food").value.trim();
  if (!q) return alert("음식 이름을 먼저 적어 주세요. (예: 홀리닭)");
  const show = foodDb => { ui.foodDb = foodDb; const box = document.querySelector(".db-results"); if (box) box.innerHTML = foodDbResults(); };
  if (typeof account === "undefined" || !account.user) return show({ state: "error", message: "로그인하면 식약처 DB를 검색할 수 있어요." });
  if (!navigator.onLine) return show({ state: "error", message: "인터넷이 연결돼야 검색할 수 있어요." });
  show({ state: "loading", q });
  const { data: res, error } = await db.functions.invoke("food-search", { body: { q } });
  if (ui.foodDb?.q !== q) return;                                      // 그새 다른 걸 검색했으면 무시
  if (error || res?.error) return show({ state: "error", message: "검색이 안 됐어요. 잠시 뒤에 다시 해 주세요." });
  show({ state: "done", q, items: (res.items || []).slice(0, FOOD_DB_SHOWN), pick: null });
}

function foodDbResults() {
  const s = ui.foodDb;
  if (!s) return "";
  if (s.state === "loading") return `<p class="small muted">식약처 DB에서 찾는 중…</p>`;
  if (s.state === "error") return `<p class="small muted">${s.message}</p>`;
  if (!s.items.length) return `<p class="small muted">"${escapeHtml(s.q)}"은(는) 식약처 DB에 없어요. 포장지 영양성분표를 보고 한 번 적어 두면 "최근 먹은 것"에 계속 나와요.</p>`;
  return `<p class="label">식약처 DB — 누르고 먹은 양을 적으면 칸이 채워져요</p>
    <div class="food-chips">${s.items.map((it, i) => `
      <button class="food-chip ${s.pick === i ? "selected" : ""}" data-action="n-db-pick" data-i="${i}">
        <b>${escapeHtml(it.name)}</b>
        <span class="small muted">${it.maker ? escapeHtml(it.maker) + " · " : ""}${num(it.basis)}${it.unit}당 ${kcalText(it.kcal)}kcal · 탄 ${num(round1(it.c))} 단 ${num(round1(it.p))} 지 ${num(round1(it.f))}</span></button>
      ${s.pick === i ? `<label class="mini grams">먹은 양 (${it.unit})<input id="m-grams" type="number" inputmode="decimal" value="${num(s.grams)}"></label>` : ""}`).join("")}</div>`;
}

function pickFoodDb(i) {                                     // 결과 하나 고르기 → 먹은 양 기본값 = 제품 한 개 중량 (모르면 기준량)
  const it = ui.foodDb.items[i];
  Object.assign(ui.foodDb, { pick: i, grams: it.total || it.basis });
  document.querySelector(".db-results").innerHTML = foodDbResults();
  fillFromFoodDb();
}

function fillFromFoodDb() {                                  // 고른 음식 × 먹은 양 → 음식 · 칼로리 · 탄단지 칸 채우기 (화면은 다시 안 그림)
  const s = ui.foodDb, it = s.items[s.pick];
  const k = s.grams / it.basis;
  const set = (id, v) => { document.getElementById(id).value = v; };
  set("m-food", `${it.name} ${num(s.grams)}${it.unit}`);
  set("m-kcal", Math.round(it.kcal * k));
  set("m-c", round1(it.c * k)); set("m-p", round1(it.p * k)); set("m-f", round1(it.f * k));
}

function setDayStatus(v) {                                     // "다 적었어" / "덜 적었어" / 자동으로
  const s = nutritionSettings();
  const day = ui.day || isoDay();
  if (v === "auto") delete s.dayStatus[day];
  else s.dayStatus[day] = v === "complete";
  s.dirty = true;
  changed();
}

function saveBase() {
  const s = nutritionSettings();
  const d = ui.baseDraft;
  const read = id => { const el = document.getElementById(id); return el ? Number(el.value) : NaN; };
  if (d.mode === "manual") {
    const k = Math.round(read("b-manual"));
    if (!(k >= 1000 && k <= 6000)) return alert("유지 칼로리를 1000~6000 사이로 적어 주세요.");
    s.manualMaintenance = k;
  } else {
    const year = Math.round(read("b-year")), height = read("b-height");
    if (!d.sex || d.activity === null) return alert("성별과 활동 수준을 골라 주세요.");
    if (!(year >= 1920 && year <= Number(isoDay().slice(0, 4)) - 10)) return alert("출생연도를 확인해 주세요.");
    if (!(height >= 100 && height <= 230)) return alert("키를 cm로 적어 주세요.");
    if (document.getElementById("b-weight")) {                  // 체중 기록이 하나도 없으면 오늘 체중으로 저장
      const w = round1(read("b-weight"));
      if (!(w > 20 && w < 300)) return alert("체중을 확인해 주세요.");
      data.body[isoDay()] = { w, synced: false };
    }
    s.profile = { sex: d.sex, birthYear: year, height: round1(height), activity: d.activity };
    s.manualMaintenance = null;                                 // 공식을 고르면 직접 입력은 지움
  }
  s.dirty = true;
  Object.assign(ui, { basePanel: false, baseDraft: null });
  changed();
}


// ---------- 4. 화면 ----------

// Nutrition: [식단] 칼로리 · 탄단지 · 끼니별 식사  /  [체중] 체중 입력 · 그래프. 위에 날짜 고르기는 둘이 같이 씀
function nutritionView() {
  const tab = ui.nutritionTab;
  const today = isoDay();
  const day = ui.day || today;
  const future = day > today;
  const label = day === today ? " (오늘)" : day === addDays(today, 1) ? " (내일)" : future ? " (예정)" : "";
  const body = tab === "food"
    ? (future ? `<p class="notice small">미리 적어 두는 식단이에요. 그날 실제로 다르게 먹으면 그때 고치거나 지우면 돼요.</p>` : "")
      + calorieCard(day, today) + macroCard(day, today) + mealsCard(day)
    : (future ? `<section class="card pad"><p class="muted small">체중은 그날 재고 적어요. 미리 적을 수 있는 건 식단뿐이에요.</p></section>`
              : weightCard(day)) + weightChart(today) + compCard();
  return `
    <header class="bar"><h1>🥗 Nutrition</h1><button class="small" data-action="home">홈</button></header>
    <div class="tabs">
      <button class="${tab === "food" ? "selected" : ""}" data-action="n-tab" data-v="food">식단</button>
      <button class="${tab === "weight" ? "selected" : ""}" data-action="n-tab" data-v="weight">체중</button>
    </div>
    <main>
      <div class="daynav">
        <button class="small" data-action="n-day" data-v="-1" aria-label="전날">◀</button>
        <b>${dayLabel(day)}${label}</b>
        <button class="small" data-action="n-day" data-v="1" aria-label="다음 날" ${day >= addDays(today, PLAN_AHEAD_DAYS) ? "disabled" : ""}>▶</button>
      </div>
      ${body}
    </main>`;
}

// 홈의 Nutrition 버튼에 보여 줄 한 줄: "오늘 1,130 / 2,100kcal · 체중 83.8kg"
function nutritionSummary() {
  const today = isoDay();
  const target = targetKcal(maintenanceInfo(today).maintenance);
  const w = data.body[today];
  return `오늘 ${kcalText(dayTotals(today).kcal)} / ${kcalText(target)}kcal · ${w ? `체중 ${num(w.w)}kg` : "체중 아직"}`;
}

// 인바디 결과 칸 (잰 날만): 골격근량 · 체지방률. 이미 적은 날은 펼쳐서 보여 줌
function compInputs(rec) {
  const has = rec && (rec.smm != null || rec.pbf != null);
  if (!ui.compOpen && !has) return `<button class="link small" data-action="n-comp">+ 인바디 결과 (골격근량 · 체지방률)</button>`;
  const val = (id, saved) => escapeHtml(String(ui.compDraft[id] ?? (saved != null ? num(saved) : "")));
  return `
      <div class="grid2 comp">
        <label class="mini">골격근량 (kg)<input id="c-smm" type="number" inputmode="decimal" value="${val("c-smm", rec && rec.smm)}"></label>
        <label class="mini">체지방률 (%)<input id="c-pbf" type="number" inputmode="decimal" value="${val("c-pbf", rec && rec.pbf)}"></label>
      </div>`;
}

// 체성분 기록 (인바디를 잰 날만, 최근 → 예전) + 바로 전 기록과의 차이
function compCard() {
  const days = Object.keys(data.body).filter(d => data.body[d].smm != null || data.body[d].pbf != null).sort();
  if (!days.length) return "";
  const diff = (now, before) => now != null && before != null && now !== before ? ` <span class="muted">(${signed(round1(now - before))})</span>` : "";
  const rows = days.map((d, i) => {
    const r = data.body[d], p = i ? data.body[days[i - 1]] : null;
    return `<div class="hrow small comp-row"><b>${dayLabel(d)}</b><span>${num(r.w)}kg</span>
      <span>${r.smm != null ? `골격근 ${num(r.smm)}kg${diff(r.smm, p && p.smm)}` : ""}</span>
      <span>${r.pbf != null ? `체지방 ${num(r.pbf)}%${diff(r.pbf, p && p.pbf)}` : ""}</span></div>`;
  }).reverse().slice(0, COMP_SHOWN);
  return `
    <section class="card pad">
      <div class="card-head static"><b>체성분 (인바디)</b><span class="muted small">${days.length}번 잼</span></div>
      <div class="plist">${rows.join("")}</div>
    </section>`;
}

function weightCard(day) {
  const rec = data.body[day];
  const draft = ui.weightDraft ?? (rec ? rec.w : lastWeightUpTo(day) ?? 70);
  const a = avg7(day), before = avg7(addDays(day, -7));
  return `
    <section class="card pad">
      <div class="card-head static"><b>체중</b>
        <span class="muted small">${rec ? `저장됨 ${num(rec.w)}kg` : "아직 안 적음"}</span></div>
      <div class="stepper">
        <button data-action="n-w-step" data-v="-0.1" aria-label="0.1 빼기">−</button>
        <label><input type="number" inputmode="decimal" step="0.1" value="${num(draft)}" data-action="n-weight"> kg</label>
        <button data-action="n-w-step" data-v="0.1" aria-label="0.1 더하기">+</button>
      </div>
      ${compInputs(rec)}
      <button class="primary full" data-action="n-save-weight">${rec ? "체중 수정" : "체중 저장"}</button>
      ${a !== null ? `<p class="small muted center">7일 평균 <b class="ink">${a.toFixed(1)}kg</b>${before !== null ? ` · 1주 전보다 ${signed(round1(a - before))}kg` : ""}</p>` : ""}
      ${rec ? `<button class="link danger small" data-action="n-del-weight">이 날 체중 지우기</button>` : ""}
    </section>`;
}

function calorieCard(day, today) {
  const s = nutritionSettings();
  const info = maintenanceInfo(today);
  const target = targetKcal(info.maintenance);
  const eaten = dayTotals(day).kcal;
  const current = avg7(today) ?? lastWeightUpTo(today);
  const ratePct = current ? s.kgPerWeek / current * 100 : 0;
  const b = info.base;
  const baseText = { manual: "직접 입력한 값",
    formula: `공식 추정 — 기초대사량 ${kcalText(b.bmr)} × 활동 ${b.factor}`,
    default: "기본값 — 아래 \"유지 칼로리 정하기\"에서 내 정보를 넣으면 더 정확해요" }[b.source];
  const how = info.fromRecords
    ? `내 기록으로 계산 — 최근 ${WINDOW_DAYS}일 중 다 적은 날 ${info.kcalDays}일 평균 섭취 ${kcalText(info.meanKcal)}kcal, 체중 주당 ${signed(round1(info.perWeek * 100) / 100)}kg`
    : `${baseText}. 체중 ${info.weightDays}/${MIN_WEIGHT_DAYS}일 · 다 적은 날 ${info.kcalDays}/${MIN_KCAL_DAYS}일이 쌓이면 내 기록으로 계산해요`;
  return `
    <section class="card pad">
      <div class="card-head static"><b>칼로리</b>
        <button class="link small" data-action="n-speed">목표 주당 ${signed(s.kgPerWeek)}kg ▾</button></div>
      ${ui.speedPanel ? `<div class="choices panel">${SPEED_CHOICES.map(v =>
        `<button class="small ${s.kgPerWeek === v ? "selected" : ""}" data-action="n-set-speed" data-v="${v}">${signed(v)}</button>`).join("")}</div>` : ""}
      <p class="hero-line"><b>${kcalText(eaten)}</b> <span class="muted">/ ${kcalText(target)} kcal</span></p>
      <div class="meter" role="img" aria-label="추천 ${kcalText(target)}kcal 중 ${kcalText(eaten)}kcal">
        <span style="width:${Math.min(100, eaten / target * 100)}%"></span></div>
      <p class="small">${eaten <= target ? `남은 ${kcalText(target - eaten)}kcal` : `추천보다 ${kcalText(eaten - target)}kcal 더 먹음`}</p>
      ${dayStatusLine(day, today)}
      <p class="small muted">유지 칼로리 ${kcalText(info.maintenance)}kcal (${how})</p>
      <button class="link small" data-action="n-base">${ui.basePanel ? "유지 칼로리 정하기 ▴" : "유지 칼로리 정하기 ▾"}</button>
      ${ui.basePanel ? basePanel(today) : ""}
      ${Math.abs(ratePct) > 1 ? `<p class="notice small">⚠️ 주당 체중의 1%보다 빠른 속도예요 (${ratePct.toFixed(1)}%)</p>` : ""}
    </section>`;
}

// 지난날: 이 날이 유지 칼로리 계산에 들어가는지 + 직접 바꾸기 (오늘은 하루가 안 끝나서 표시 안 함)
function dayStatusLine(day, today) {
  if (day >= today || !dayTotals(day).count) return "";
  const marked = nutritionSettings().dayStatus[day];
  const counted = dayCounted(day, completeDayKcal(today));
  const text = marked === true ? "✓ 다 적은 날로 표시했어요 — 유지 칼로리 계산에 넣어요"
    : marked === false ? "덜 적은 날로 표시했어요 — 유지 칼로리 계산에서 빼요"
    : counted ? "✓ 다 적은 날 — 유지 칼로리 계산에 넣어요"
    : "덜 적은 날 같아요 (추천 섭취의 60%보다 적음) — 유지 칼로리 계산에서 빼요";
  const buttons = marked !== undefined
    ? `<button class="small" data-action="n-day-status" data-v="auto">자동으로 되돌리기</button>`
    : counted ? `<button class="small" data-action="n-day-status" data-v="partial">덜 적었어</button>`
    : `<button class="small" data-action="n-day-status" data-v="complete">다 적었어</button>`;
  return `<div class="daystatus ${counted ? "" : "partial"}"><span class="small">${text}</span>${buttons}</div>`;
}

// 처음 유지 칼로리 정하기: 공식(내 정보) 또는 직접 입력
function basePanel(today) {
  const s = nutritionSettings();
  const p = s.profile || {};
  const d = ui.baseDraft || { mode: s.manualMaintenance ? "manual" : "formula", sex: p.sex || null, activity: p.activity ?? null,
    "b-year": p.birthYear ?? "", "b-height": p.height ?? "", "b-manual": s.manualMaintenance ?? "", "b-weight": "" };   // 적은 숫자도 기억 (버튼을 눌러 다시 그려도 안 지워지게)
  ui.baseDraft = d;
  const w = avg7(today) ?? lastWeightUpTo(today);
  const choice = (action, value, label, selected) =>
    `<button class="small ${selected ? "selected" : ""}" data-action="${action}" data-v="${value}">${label}</button>`;
  const formula = `
      <p class="label">성별</p>
      <div class="choices">${choice("n-base-sex", "남", "남", d.sex === "남")}${choice("n-base-sex", "여", "여", d.sex === "여")}</div>
      <div class="grid3">
        <label class="mini">출생연도<input id="b-year" type="number" inputmode="numeric" placeholder="2003" value="${d["b-year"]}"></label>
        <label class="mini">키 (cm)<input id="b-height" type="number" inputmode="decimal" placeholder="175" value="${d["b-height"]}"></label>
        ${w ? `<label class="mini">체중<span class="mini-value">${w.toFixed(1)}kg (기록)</span></label>`
            : `<label class="mini">지금 체중 (kg)<input id="b-weight" type="number" inputmode="decimal" placeholder="70" value="${d["b-weight"]}"></label>`}
      </div>
      <p class="label">활동 수준</p>
      <div class="levels">${ACTIVITY_LEVELS.map((a, i) => `
        <button class="level ${d.activity === i ? "selected" : ""}" data-action="n-base-activity" data-v="${i}">
          <b>${a.name}</b> <span class="small">× ${a.factor}</span><span class="small">${a.example}</span></button>`).join("")}</div>
      <p class="small muted">기초대사량은 Mifflin-St Jeor 공식: 10 × 체중 + 6.25 × 키 − 5 × 나이 + (남 5 / 여 −161). 사람마다 오차가 있어서, 기록이 2주 쌓이면 내 기록으로 바꿔 계산해요.</p>`;
  const manual = `
      <label class="mini">내 유지 칼로리 (kcal)<input id="b-manual" type="number" inputmode="numeric" placeholder="2500" value="${d["b-manual"]}"></label>
      <p class="small muted">다른 앱이나 경험으로 이미 알고 있으면 직접 적어요. 이것도 기록이 2주 쌓이면 내 기록으로 바꿔 계산해요.</p>`;
  return `
    <div class="panel">
      <div class="choices">${choice("n-base-mode", "formula", "내 정보로 계산", d.mode === "formula")}${choice("n-base-mode", "manual", "직접 입력", d.mode === "manual")}</div>
      ${d.mode === "formula" ? formula : manual}
      <div class="row gap-s"><button class="small primary" data-action="n-base-save">저장</button></div>
    </div>`;
}

function macroBar(pcts, label) {                               // 100% 막대 하나 (탄 · 단 · 지 순서, 사이에 2px 틈)
  return `<div class="mbar" role="img" aria-label="${label} 탄 ${Math.round(pcts[0])}% 단 ${Math.round(pcts[1])}% 지 ${Math.round(pcts[2])}%">
    ${pcts.map((p, i) => p > 0 ? `<span class="m${i}" style="flex-grow:${p}"></span>` : "").join("")}</div>`;
}

function macroCard(day, today) {
  const s = nutritionSettings();
  const ratio = ratioOf(day);
  const target = targetKcal(maintenanceInfo(today).maintenance);
  const t = dayTotals(day);
  const kcals = MACROS.map(m => t[m.key] * m.kcal);              // 탄단지 각각의 칼로리
  const sum = kcals.reduce((a, b) => a + b, 0);
  const pcts = sum ? kcals.map(k => k / sum * 100) : null;
  const goalG = MACROS.map((m, i) => target * ratio[i] / 100 / m.kcal);
  const draft = ui.ratioDraft || ratio;
  const panel = !ui.ratioPanel ? "" : `
      <div class="panel">
        <div class="choices">${RATIO_PRESETS.map(r =>
          `<button class="small" data-action="n-preset" data-v="${r.join(",")}">${ratioText(r)}</button>`).join("")}</div>
        <div class="grid3">${MACROS.map((m, i) =>
          `<label class="mini"><i class="sw m${i}"></i>${m.name} %<input id="r-${i}" type="number" inputmode="numeric" value="${draft[i]}"></label>`).join("")}</div>
        <div class="row gap-s">
          <button class="small primary" data-action="n-save-ratio" data-v="base">기본 비율로 저장</button>
          <button class="small" data-action="n-save-ratio" data-v="day">${dayLabel(day)}만 (리피드)</button>
          ${s.dayRatios[day] ? `<button class="small" data-action="n-clear-day">이 날 설정 지우기</button>` : ""}
        </div>
      </div>`;
  const cell = (values, fmt) => values.map(v => `<td>${v === null ? "—" : fmt(v)}</td>`).join("");
  return `
    <section class="card pad">
      <div class="card-head static"><b>탄단지</b>
        <button class="link small" data-action="n-ratio">목표 ${ratioText(ratio)}${s.dayRatios[day] ? " (이 날만)" : ""} ▾</button></div>
      ${panel}
      <div class="mrow"><span class="small muted">${day === today ? "오늘" : dayLabel(day)}</span>
        ${pcts ? macroBar(pcts, "먹은 비율") : `<div class="mbar empty"></div>`}</div>
      <div class="mrow"><span class="small muted">목표</span>${macroBar(ratio, "목표 비율")}</div>
      <table class="mtable">
        <tr><th></th>${MACROS.map((m, i) => `<th><i class="sw m${i}"></i>${m.name}</th>`).join("")}</tr>
        <tr><td>먹은 비율</td>${cell(pcts || [null, null, null], v => Math.round(v) + "%")}</tr>
        <tr><td>목표 비율</td>${cell(ratio, v => v + "%")}</tr>
        <tr><td>먹은 양</td>${cell(MACROS.map(m => t[m.key]), v => Math.round(v) + "g")}</tr>
        <tr><td>목표 양</td>${cell(goalG, v => Math.round(v) + "g")}</tr>
      </table>
    </section>`;
}

function mealForm(slot) {
  return `
    <div class="mealform">
      <div class="row gap-s">
        <input id="m-food" class="text" placeholder="음식 이름 (예: 홀리닭)" autocomplete="off">
        <button class="small" data-action="n-db-search">검색</button>
      </div>
      <div class="db-results">${foodDbResults()}</div>
      <div class="grid4">
        <label class="mini">칼로리<input id="m-kcal" type="number" inputmode="decimal"></label>
        ${MACROS.map((m, i) => `<label class="mini"><i class="sw m${i}"></i>${m.name}(g)<input id="m-${m.key}" type="number" inputmode="decimal"></label>`).join("")}
      </div>
      <p class="small muted">칼로리를 비우면 탄×4 + 단×4 + 지×9로 계산해요.</p>
      <div class="row gap-s">
        <button class="small primary" data-action="n-save-meal">${slot}에 추가</button>
        <button class="small" data-action="n-cancel-meal">닫기</button>
      </div>
      <div class="recent-foods">${recentFoodChips("")}</div>
    </div>`;
}

function mealsCard(day) {
  const slots = MEAL_SLOTS.map(slot => {
    const items = data.meals.filter(m => m.day === day && m.slot === slot);
    const kcal = items.reduce((s, m) => s + m.kcal, 0);
    return `
      <div class="slot">
        <div class="slot-head"><b>${slot}</b><span class="muted small">${items.length ? kcalText(kcal) + "kcal" : ""}</span>
          ${ui.mealForm === slot ? "" : `<button class="link small" data-action="n-add-meal" data-v="${slot}">+ 추가</button>`}</div>
        ${items.map(m => `
          <div class="meal">
            <div><b>${escapeHtml(m.food)}</b>
              <span class="muted small">${kcalText(m.kcal)}kcal · 탄 ${num(m.c)} · 단 ${num(m.p)} · 지 ${num(m.f)}</span></div>
            <button class="link danger small" data-action="n-del-meal" data-id="${m.id}">삭제</button>
          </div>`).join("")}
        ${ui.mealForm === slot ? mealForm(slot) : ""}
      </div>`;
  }).join("");
  const t = dayTotals(day);
  const prevCount = dayTotals(addDays(day, -1)).count;
  return `
    <section class="card pad">
      <div class="card-head static"><b>식사</b><span class="muted small">${t.count}개 · ${kcalText(t.kcal)}kcal</span></div>
      ${prevCount ? `<button class="link small" data-action="n-copy-prev">전날(${dayLabel(addDays(day, -1))}) 식단 복사 · ${prevCount}개</button>` : ""}
      ${slots}
    </section>`;
}

// 체중 그래프: 매일 체중(회색 점) + 7일 평균(파란 선). 막대를 눌러 보면 그날 숫자가 나옴
function weightChart(today) {
  const start = addDays(today, -(CHART_DAYS - 1));
  const days = weightDays().filter(d => d >= start && d <= today);
  const head = `<div class="card-head static"><b>체중 그래프</b><span class="muted small">최근 ${CHART_DAYS}일</span></div>`;
  if (!days.length) return `<section class="card pad">${head}<p class="muted small">체중을 적으면 그래프가 생겨요.</p></section>`;

  const W = 340, H = 180, L = 36, R = 40, T = 10, B = 24;
  const pts = days.map(d => ({ d, w: data.body[d].w, a: avg7(d) }));
  const vals = pts.flatMap(p => [p.w, p.a]);
  let lo = Math.floor(Math.min(...vals) - 0.2), hi = Math.ceil(Math.max(...vals) + 0.2);
  if (hi - lo < 2) { lo -= 1; hi += 1; }
  const stepY = hi - lo <= 4 ? 0.5 : hi - lo <= 8 ? 1 : 2;
  const x = d => L + daysBetween(start, d) / (CHART_DAYS - 1) * (W - L - R);
  const y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  const ticks = [];
  for (let v = lo; v <= hi + 1e-9; v += stepY) ticks.push(v);
  const grid = ticks.map(v => `
      <line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="axis" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${num(v)}</text>`).join("");
  const xTicks = [start, addDays(start, Math.floor((CHART_DAYS - 1) / 2)), today].map(d =>
    `<text class="axis" x="${x(d)}" y="${H - 6}" text-anchor="middle">${dayLabel(d)}</text>`).join("");
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.d).toFixed(1)} ${y(p.a).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const half = (W - L - R) / (CHART_DAYS - 1) / 2;
  return `
    <section class="card pad">
      ${head}
      <div class="legend small"><span><i class="key dot"></i>매일 체중</span><span><i class="key line"></i>7일 평균</span></div>
      <div class="chart wchart">
        <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="최근 ${CHART_DAYS}일 체중, 마지막 7일 평균 ${last.a.toFixed(1)}kg">
          ${grid}${xTicks}
          <line id="wc-x" class="cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
          <path class="avg" d="${line}"/>
          ${pts.map(p => `<circle class="daily" cx="${x(p.d)}" cy="${y(p.w)}" r="4"/>`).join("")}
          <circle class="avg-end" cx="${x(last.d)}" cy="${y(last.a)}" r="4"/>
          <text class="end-label" x="${x(last.d) + 8}" y="${y(last.a) + 4}">${last.a.toFixed(1)}</text>
          ${pts.map(p => `<rect class="hit" x="${x(p.d) - Math.max(half, 12)}" y="0" width="${Math.max(half, 12) * 2}" height="${H}"
             data-day="${p.d}" data-cx="${x(p.d)}"/>`).join("")}
        </svg>
        <div id="wc-tip" class="tip" hidden></div>
      </div>
    </section>`;
}

function showWeightTip(rect) {                                 // 그래프에서 누른 날의 숫자 보여 주기
  const day = rect.dataset.day;
  const cross = document.getElementById("wc-x"), tip = document.getElementById("wc-tip");
  cross.setAttribute("x1", rect.dataset.cx); cross.setAttribute("x2", rect.dataset.cx);
  cross.setAttribute("visibility", "visible");
  tip.replaceChildren();
  const rows = [[`${data.body[day].w.toFixed(1)}kg`, "체중"], [`${avg7(day).toFixed(1)}kg`, "7일 평균"]];
  const title = document.createElement("div"); title.className = "muted"; title.textContent = dayLabel(day);
  tip.append(title);
  for (const [value, name] of rows) {
    const row = document.createElement("div");
    const b = document.createElement("b"); b.textContent = value;
    row.append(b, " " + name);
    tip.append(row);
  }
  const box = rect.ownerSVGElement.getBoundingClientRect();
  const px = Number(rect.dataset.cx) / 340 * box.width;
  tip.hidden = false;
  tip.style.left = Math.min(Math.max(px - tip.offsetWidth / 2, 0), box.width - tip.offsetWidth) + "px";
}

function hideWeightTip() {
  const cross = document.getElementById("wc-x"), tip = document.getElementById("wc-tip");
  if (cross) cross.setAttribute("visibility", "hidden");
  if (tip) tip.hidden = true;
}

// ---------- 5. 인터넷 올리기 · 받기 (sync.js의 syncNow가 부름) ----------

function nutritionPending() {
  return Object.values(data.body).filter(b => !b.synced).length + data.meals.filter(m => !m.synced).length
    + data.deletedMeals.length + data.deletedWeights.length + (data.nutrition && data.nutrition.dirty ? 1 : 0);
}

async function selectAll(table, columns) {                     // 한 번에 1000줄까지만 오니까 나눠서 다 받기
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await db.from(table).select(columns).range(from, from + 999);
    if (error) throw error;
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function syncNutrition() {
  // [1] 폰에서 지운 것 → 인터넷에서도 지우기
  for (const id of [...data.deletedMeals]) {
    const { error } = await db.from("meals").delete().eq("id", id);
    if (error) throw error;
    data.deletedMeals = data.deletedMeals.filter(x => x !== id);
    save();
  }
  for (const day of [...data.deletedWeights]) {
    const { error } = await db.from("body_weights").delete().eq("day", day);
    if (error) throw error;
    data.deletedWeights = data.deletedWeights.filter(x => x !== day);
    save();
  }

  // [2] 아직 안 올린 체중 · 식사 · 설정 올리기 (upsert = 있으면 덮어쓰기 → 여러 번 해도 결과가 같음)
  const justUploaded = new Set();                              // 방금 올린 것은 [3]에서 절대 안 지움 (운동 동기화와 같은 보호)
  const days = Object.keys(data.body).filter(d => !data.body[d].synced);
  if (days.length) {
    const { error } = await db.from("body_weights")
      .upsert(days.map(d => ({ day: d, weight: data.body[d].w, skeletal_muscle_kg: data.body[d].smm ?? null,
      body_fat_pct: data.body[d].pbf ?? null, updated_at: new Date().toISOString() })));
    if (error) throw error;
    days.forEach(d => { data.body[d].synced = true; justUploaded.add(d); });
    save();
  }
  const meals = data.meals.filter(m => !m.synced);
  if (meals.length) {
    const { error } = await db.from("meals").upsert(meals.map(m => ({
      id: m.id, day: m.day, slot: m.slot, food: m.food, kcal: m.kcal, carb: m.c, protein: m.p, fat: m.f,
    })));
    if (error) throw error;
    meals.forEach(m => { m.synced = true; justUploaded.add(m.id); });
    save();
  }
  const s = data.nutrition;
  if (s && s.dirty) {
    const { error } = await db.from("nutrition_settings").upsert({
      carb_pct: s.ratio[0], protein_pct: s.ratio[1], fat_pct: s.ratio[2],
      target_kg_per_week: s.kgPerWeek, day_ratios: s.dayRatios, updated_at: new Date().toISOString(),
      sex: s.profile ? s.profile.sex : null, birth_year: s.profile ? s.profile.birthYear : null,
      height_cm: s.profile ? s.profile.height : null, activity: s.profile ? s.profile.activity : null,
      manual_maintenance: s.manualMaintenance, day_status: s.dayStatus,
    });
    if (error) throw error;
    s.dirty = false;
    save();
  }

  // [3] 받기: 인터넷이 기준. 폰에서 올라가 있던(synced) 것 중 인터넷에 없으면 다른 기기에서 지운 것
  const remoteBody = await selectAll("body_weights", "day, weight, skeletal_muscle_kg, body_fat_pct");
  const remoteDays = new Set(remoteBody.map(r => r.day));
  for (const r of remoteBody) {
    const local = data.body[r.day];
    if (!local || local.synced) data.body[r.day] = { w: Number(r.weight), synced: true,
      ...(r.skeletal_muscle_kg != null ? { smm: Number(r.skeletal_muscle_kg) } : {}), ...(r.body_fat_pct != null ? { pbf: Number(r.body_fat_pct) } : {}) };
  }
  for (const d of Object.keys(data.body)) if (data.body[d].synced && !remoteDays.has(d) && !justUploaded.has(d)) delete data.body[d];

  const remoteMeals = await selectAll("meals", "id, day, slot, food, kcal, carb, protein, fat");
  const remoteIds = new Set(remoteMeals.map(r => r.id));
  const localIds = new Set(data.meals.map(m => m.id));
  for (const r of remoteMeals) {
    if (localIds.has(r.id)) continue;
    data.meals.push({ id: r.id, day: r.day, slot: r.slot, food: r.food, kcal: r.kcal,
      c: Number(r.carb), p: Number(r.protein), f: Number(r.fat), synced: true });
  }
  data.meals = data.meals.filter(m => !m.synced || remoteIds.has(m.id) || justUploaded.has(m.id));

  const { data: rows, error } = await db.from("nutrition_settings")
    .select("carb_pct, protein_pct, fat_pct, target_kg_per_week, day_ratios, sex, birth_year, height_cm, activity, manual_maintenance, day_status");
  if (error) throw error;
  if (rows.length && !(data.nutrition && data.nutrition.dirty)) {
    const r = rows[0];
    data.nutrition = { ratio: [r.carb_pct, r.protein_pct, r.fat_pct], kgPerWeek: Number(r.target_kg_per_week),
      dayRatios: r.day_ratios || {}, dirty: false,
      profile: r.sex ? { sex: r.sex, birthYear: r.birth_year, height: Number(r.height_cm), activity: r.activity } : null,
      manualMaintenance: r.manual_maintenance, dayStatus: r.day_status || {} };
  }
  save();
}


// ---------- 6. 버튼 연결 ----------

document.addEventListener("click", event => {
  const el = event.target.closest("[data-action]");
  if (!el) return;
  const v = el.dataset.v;
  switch (el.dataset.action) {
    case "nutrition":
      Object.assign(ui, { screen: "nutrition", day: null, weightDraft: null, mealForm: null, ratioPanel: false, speedPanel: false });
      return render();
    case "n-tab": Object.assign(ui, { nutritionTab: v, mealForm: null, ratioPanel: false, speedPanel: false }); return render();
    case "n-day":
      Object.assign(ui, { day: addDays(ui.day || isoDay(), Number(v)), weightDraft: null, compOpen: false, compDraft: {}, mealForm: null, ratioPanel: false });
      if (ui.day === isoDay()) ui.day = null;                     // 오늘 = null
      if (ui.day && ui.day > addDays(isoDay(), PLAN_AHEAD_DAYS)) ui.day = addDays(isoDay(), PLAN_AHEAD_DAYS);
      return render();
    case "n-w-step": {
      const input = document.querySelector('[data-action="n-weight"]');
      ui.weightDraft = round1(Number(input.value) + Number(v));
      input.value = num(ui.weightDraft);                         // 화면 전체를 다시 그리지 않고 숫자만 바꿈
      return;
    }
    case "n-save-weight": return saveWeight();
    case "n-comp": ui.compOpen = true; return render();
    case "n-del-weight": return deleteWeight();
    case "n-add-meal":
      Object.assign(ui, { mealForm: v, foodDb: null });
      render();
      return document.getElementById("m-food").focus();
    case "n-cancel-meal": Object.assign(ui, { mealForm: null, foodDb: null }); return render();
    case "n-db-search": return searchFoodDb();
    case "n-db-pick": return pickFoodDb(Number(el.dataset.i));
    case "n-quick-meal": return quickMeal(el.dataset.food);
    case "n-copy-prev": return copyPreviousDay();
    case "n-save-meal": return saveMeal();
    case "n-del-meal": return deleteMeal(el.dataset.id);
    case "n-speed": ui.speedPanel = !ui.speedPanel; return render();
    case "n-set-speed": return setSpeed(Number(v));
    case "n-ratio": Object.assign(ui, { ratioPanel: !ui.ratioPanel, ratioDraft: null }); return render();
    case "n-preset": ui.ratioDraft = v.split(",").map(Number); return render();
    case "n-save-ratio": return saveRatio(v);
    case "n-clear-day": return clearDayRatio();
    case "n-day-status": return setDayStatus(v);
    case "n-base": Object.assign(ui, { basePanel: !ui.basePanel, baseDraft: null }); return render();
    case "n-base-mode": ui.baseDraft.mode = v; return render();
    case "n-base-sex": ui.baseDraft.sex = v; return render();
    case "n-base-activity": ui.baseDraft.activity = Number(v); return render();
    case "n-base-save": return saveBase();
  }
});

document.addEventListener("input", event => {
  if (event.target.dataset.action === "n-weight") ui.weightDraft = Number(event.target.value);
  if (/^c-/.test(event.target.id)) ui.compDraft[event.target.id] = event.target.value;      // 인바디 칸
  if (event.target.id === "m-food") {                          // 음식 이름을 치면 최근 음식 목록만 걸러서 다시 그림 (입력 칸은 그대로)
    const box = document.querySelector(".recent-foods");
    if (box) box.innerHTML = recentFoodChips(event.target.value);
  }
  if (event.target.id === "m-grams" && ui.foodDb) {             // 먹은 양을 바꾸면 칸의 숫자만 다시 계산
    const g = Number(event.target.value);
    if (g > 0) { ui.foodDb.grams = g; fillFromFoodDb(); }
  }
  if (ui.baseDraft && /^b-/.test(event.target.id)) ui.baseDraft[event.target.id] = event.target.value;   // 유지 칼로리 칸
});

document.addEventListener("pointerdown", event => {           // 그래프: 누른 날 보여 주기 / 바깥을 누르면 숨기기
  const hit = event.target.closest && event.target.closest(".wchart .hit");
  if (hit) showWeightTip(hit); else hideWeightTip();
});
document.addEventListener("pointermove", event => {
  const hit = event.target.closest && event.target.closest(".wchart .hit");
  if (hit) showWeightTip(hit);
});
