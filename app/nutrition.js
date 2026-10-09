// I will become monster — v0.4-d-1 체중 · 식단 (📈 기록 화면)
//
// [지도]
//   들어오는 것: 매일 체중, 끼니마다 음식 + 칼로리 + 탄단지 (FatSecret 숫자를 옮겨 적기)
//   하는 일:     weight_log.ipynb ③~⑤를 JS로 옮긴 것 — 7일 평균, 내 기록으로 유지 칼로리 역산, 추천 섭취
//                + 그날 탄단지 비율 vs 목표 비율
//   나가는 것:   📈 기록 화면 (탭: 식단 · 체중 / 운동)  +  Supabase 표 3개 올리기 · 받기
//
// [저장 모양] app.js의 data 안에 같이 저장
//   body:  { "2026-10-09": { w: 83.6, synced: false } }                     ← 하루에 체중 하나
//   meals: [ { id, day: "2026-10-09", slot: "아침", food, kcal, c, p, f, synced } ]   ← 음식 하나 = 한 줄
//   nutrition: { ratio: [50, 30, 20], kgPerWeek: -0.5, dayRatios: { "2026-10-12": [60, 20, 20] }, dirty }
//   deletedMeals: [id], deletedWeights: [day]                               ← 인터넷에서도 지울 것

// ---------- 0. 설정 (노트북 ②와 같은 손잡이) ----------

const DEFAULT_RATIO = [50, 30, 20];        // 탄:단:지 (%) — 설정을 한 번도 안 바꾼 사람의 기본값
const RATIO_PRESETS = [[50, 30, 20], [40, 30, 30]];
const DEFAULT_KG_PER_WEEK = -0.5;          // 목표 속도 (kg/주): 감량 -0.5 / 유지 0 / 증량 0.25
const SPEED_CHOICES = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5];
const INITIAL_MAINTENANCE = 2750;          // 기록이 부족할 때 쓰는 유지 칼로리 (kcal)
const WINDOW_DAYS = 14;                    // 최근 며칠로 유지 칼로리를 계산할지
const MIN_WEIGHT_DAYS = 10;                // 그 기간에 체중 기록이 최소 며칠
const MIN_KCAL_DAYS = 7;                   // 그 기간에 식사 기록이 최소 며칠 (오늘은 아직 덜 먹었으니 빼고 셈)
const KCAL_PER_KG = 7700;                  // 체중 1kg ≈ 7700kcal
const CHART_DAYS = 30;                     // 체중 그래프에 보여 줄 날 수
const MEAL_SLOTS = ["아침", "점심", "저녁", "간식"];
const MACROS = [                           // 1g당 칼로리
  { key: "c", name: "탄", kcal: 4 },
  { key: "p", name: "단", kcal: 4 },
  { key: "f", name: "지", kcal: 9 },
];

Object.assign(ui, {
  recTab: "food",        // 📈 기록 화면의 탭: food / workout
  day: null,             // 보고 있는 날 ("2026-10-09"), null = 오늘
  weightDraft: null,     // 체중 칸에 들어 있는 값
  mealForm: null,        // 음식 추가 칸이 열린 끼니 ("아침" …)
  ratioPanel: false,     // 목표 비율 바꾸기 칸
  ratioDraft: null,
  speedPanel: false,     // 목표 속도 바꾸기 칸
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
  return data.nutrition;
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

// 유지 칼로리 = 평균 섭취 − (하루 체중 변화 × 7700)   ← 노트북 ④
function maintenanceInfo(today) {
  const start = addDays(today, -WINDOW_DAYS);                  // 최근 14일 = (start, today]
  const wdays = weightDays().filter(d => d > start && d <= today);
  const kdays = [...new Set(data.meals.map(m => m.day))].filter(d => d > start && d < today);
  const info = { weightDays: wdays.length, kcalDays: kdays.length };
  if (wdays.length < MIN_WEIGHT_DAYS || kdays.length < MIN_KCAL_DAYS) {
    return { ...info, maintenance: INITIAL_MAINTENANCE, fromRecords: false };
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
  const w = round1(Number(ui.weightDraft));
  if (!(w > 20 && w < 300)) return alert("체중을 확인해 주세요.");
  data.body[day] = { w, synced: false };
  data.deletedWeights = data.deletedWeights.filter(d => d !== day);
  ui.weightDraft = null;
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
  ui.mealForm = null;
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


// ---------- 4. 화면 ----------

function recordsView() {
  const tab = ui.recTab;
  return `
    <header class="bar"><h1>📈 기록</h1><button class="small" data-action="home">홈</button></header>
    <div class="tabs">
      <button class="${tab === "food" ? "selected" : ""}" data-action="n-tab" data-v="food">식단 · 체중</button>
      <button class="${tab === "workout" ? "selected" : ""}" data-action="n-tab" data-v="workout">운동</button>
    </div>
    <main>${tab === "food" ? foodTab() : workoutTab()}</main>`;
}

function foodTab() {
  const today = isoDay();
  const day = ui.day || today;
  return `
    <div class="daynav">
      <button class="small" data-action="n-day" data-v="-1" aria-label="전날">◀</button>
      <b>${dayLabel(day)}${day === today ? " (오늘)" : ""}</b>
      <button class="small" data-action="n-day" data-v="1" aria-label="다음 날" ${day >= today ? "disabled" : ""}>▶</button>
    </div>
    ${weightCard(day)}
    ${calorieCard(day, today)}
    ${macroCard(day, today)}
    ${mealsCard(day)}
    ${weightChart(today)}`;
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
  const how = info.fromRecords
    ? `내 기록으로 계산 — 최근 ${WINDOW_DAYS}일 평균 섭취 ${kcalText(info.meanKcal)}kcal, 체중 주당 ${signed(round1(info.perWeek * 100) / 100)}kg`
    : `초기값 — 체중 ${info.weightDays}/${MIN_WEIGHT_DAYS}일 · 식사 ${info.kcalDays}/${MIN_KCAL_DAYS}일이 쌓이면 내 기록으로 계산해요`;
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
      <p class="small muted">유지 칼로리 ${kcalText(info.maintenance)}kcal (${how})</p>
      ${Math.abs(ratePct) > 1 ? `<p class="notice small">⚠️ 주당 체중의 1%보다 빠른 속도예요 (${ratePct.toFixed(1)}%)</p>` : ""}
    </section>`;
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
      <input id="m-food" class="text" placeholder="음식 이름 (예: 닭가슴살 샐러드)" autocomplete="off">
      <div class="grid4">
        <label class="mini">칼로리<input id="m-kcal" type="number" inputmode="decimal"></label>
        ${MACROS.map((m, i) => `<label class="mini"><i class="sw m${i}"></i>${m.name}(g)<input id="m-${m.key}" type="number" inputmode="decimal"></label>`).join("")}
      </div>
      <p class="small muted">칼로리를 비우면 탄×4 + 단×4 + 지×9로 계산해요.</p>
      <div class="row gap-s">
        <button class="small primary" data-action="n-save-meal">${slot}에 추가</button>
        <button class="small" data-action="n-cancel-meal">취소</button>
      </div>
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
  return `
    <section class="card pad">
      <div class="card-head static"><b>식사</b><span class="muted small">${t.count}개 · ${kcalText(t.kcal)}kcal</span></div>
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
      <div class="wchart">
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

function workoutTab() {
  const counts = DAYS.map(d => [d, finishedWorkouts().filter(w => w.split === d).length]);
  return `
    <section class="card pad">
      <div class="card-head static"><b>운동 그래프</b><span class="muted small">v0.4-d-2에서 만들어요</span></div>
      <p class="small">분할마다 기록이 2번 이상 쌓이면 종목별 e1RM 선이 생겨요. 지금까지 기록:</p>
      <p class="small muted">${counts.map(([d, n]) => `${d} ${n}회`).join(" · ")}</p>
    </section>`;
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
      .upsert(days.map(d => ({ day: d, weight: data.body[d].w, updated_at: new Date().toISOString() })));
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
    });
    if (error) throw error;
    s.dirty = false;
    save();
  }

  // [3] 받기: 인터넷이 기준. 폰에서 올라가 있던(synced) 것 중 인터넷에 없으면 다른 기기에서 지운 것
  const remoteBody = await selectAll("body_weights", "day, weight");
  const remoteDays = new Set(remoteBody.map(r => r.day));
  for (const r of remoteBody) {
    const local = data.body[r.day];
    if (!local || local.synced) data.body[r.day] = { w: Number(r.weight), synced: true };
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

  const { data: rows, error } = await db.from("nutrition_settings").select("carb_pct, protein_pct, fat_pct, target_kg_per_week, day_ratios");
  if (error) throw error;
  if (rows.length && !(data.nutrition && data.nutrition.dirty)) {
    const r = rows[0];
    data.nutrition = { ratio: [r.carb_pct, r.protein_pct, r.fat_pct], kgPerWeek: Number(r.target_kg_per_week),
      dayRatios: r.day_ratios || {}, dirty: false };
  }
  save();
}


// ---------- 6. 버튼 연결 ----------

document.addEventListener("click", event => {
  const el = event.target.closest("[data-action]");
  if (!el) return;
  const v = el.dataset.v;
  switch (el.dataset.action) {
    case "records":
      Object.assign(ui, { screen: "records", day: null, weightDraft: null, mealForm: null, ratioPanel: false, speedPanel: false });
      return render();
    case "n-tab": ui.recTab = v; return render();
    case "n-day":
      Object.assign(ui, { day: addDays(ui.day || isoDay(), Number(v)), weightDraft: null, mealForm: null, ratioPanel: false });
      if (ui.day >= isoDay()) ui.day = null;
      return render();
    case "n-w-step": {
      const input = document.querySelector('[data-action="n-weight"]');
      ui.weightDraft = round1(Number(input.value) + Number(v));
      input.value = num(ui.weightDraft);                         // 화면 전체를 다시 그리지 않고 숫자만 바꿈
      return;
    }
    case "n-save-weight": return saveWeight();
    case "n-del-weight": return deleteWeight();
    case "n-add-meal":
      ui.mealForm = v;
      render();
      return document.getElementById("m-food").focus();
    case "n-cancel-meal": ui.mealForm = null; return render();
    case "n-save-meal": return saveMeal();
    case "n-del-meal": return deleteMeal(el.dataset.id);
    case "n-speed": ui.speedPanel = !ui.speedPanel; return render();
    case "n-set-speed": return setSpeed(Number(v));
    case "n-ratio": Object.assign(ui, { ratioPanel: !ui.ratioPanel, ratioDraft: null }); return render();
    case "n-preset": ui.ratioDraft = v.split(",").map(Number); return render();
    case "n-save-ratio": return saveRatio(v);
    case "n-clear-day": return clearDayRatio();
  }
});

document.addEventListener("input", event => {
  if (event.target.dataset.action === "n-weight") ui.weightDraft = Number(event.target.value);
});

document.addEventListener("pointerdown", event => {           // 그래프: 누른 날 보여 주기 / 바깥을 누르면 숨기기
  const hit = event.target.closest && event.target.closest(".wchart .hit");
  if (hit) showWeightTip(hit); else hideWeightTip();
});
document.addEventListener("pointermove", event => {
  const hit = event.target.closest && event.target.closest(".wchart .hit");
  if (hit) showWeightTip(hit);
});
