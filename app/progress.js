// I will become monster — v0.4-d-2 운동 그래프 (🏋️ Workout → 그래프 탭)
//
// [지도]
//   들어오는 것: 끝난 운동들 (data.workouts)
//   하는 일:     (분할, 종목, 날짜)마다 점 하나 = 그날 가장 무거운 무게 (맨몸은 그날 최고 횟수)
//                + 노트북 ④ · ⑥의 e1RM(추정 1회 최대)은 그래프 아래에 숫자로만
//   나가는 것:   분할별 종목 목록 (첫 기록 → 최근) + 누르면 그 종목 그래프 (가로 = 날짜) · 목록에서 숨기기
//
// [저장] data.hiddenGraphs: ["어깨|Bench lateral raise", …]  ← 목록에서 숨긴 종목
//        data.hiddenDirty: true = 아직 인터넷(app_settings 표)에 안 올림

const GRAPH_MIN_RECORDS = 1;                     // 목록에 보여 줄 최소 기록 횟수 (2로 바꾸면 선이 있는 종목만 나옴)
const e1rm = (w, r) => round1(w * (1 + r / 30)); // Epley 공식, 소수 첫째 자리 — 노트북 ④와 같은 식

ui.graphOpen = null;                             // 펼쳐진 그래프 ("가슴|Bench press")
ui.showHidden = false;                           // 숨긴 종목 목록을 펼쳤나


// ---------- 1. 계산 ----------

// (분할, 종목) → 날짜마다 { day, v: 그날 가장 무거운 무게(맨몸은 최고 횟수), set: 그 세트, e1rm: 그날 최고 e1RM } 오래된 순
function progressSeries(split, name) {
  const bw = isBodyweight(name);
  const byDay = {};
  for (const w of finishedWorkouts()) {
    if (w.split !== split) continue;
    const sets = w.exercises.filter(e => e.name === name).flatMap(e => e.sets);
    if (!sets.length) continue;
    const day = isoDay(new Date(w.start));
    const p = byDay[day] || (byDay[day] = { day, v: -1, set: null, e1rm: 0 });
    for (const s of sets) {
      const v = bw ? s.r : s.w;
      if (v > p.v || (v === p.v && s.r > p.set.r)) { p.v = v; p.set = s; }   // 같은 무게면 횟수가 많은 세트
      if (!bw) p.e1rm = Math.max(p.e1rm, e1rm(s.w, s.r));
    }
  }
  return Object.keys(byDay).sort().map(d => byDay[d]);
}

const isHidden = key => data.hiddenGraphs.includes(key);


// ---------- 2. 화면 ----------

function progressView() {
  const done = finishedWorkouts();
  if (!done.length) return `<p class="muted">아직 기록이 없어요. 운동을 끝내면 여기에 종목별 그래프가 생겨요.</p>`;
  const sections = DAYS.map(split => {
    const names = [...new Set(done.filter(w => w.split === split)
      .flatMap(w => w.exercises.filter(e => e.sets.length).map(e => e.name)))]
      .filter(name => !isHidden(`${split}|${name}`))
      .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
    const rows = names.map(name => ({ name, pts: progressSeries(split, name) }))
      .filter(r => r.pts.length >= GRAPH_MIN_RECORDS);
    if (!rows.length) return "";
    return `<h2>${split}</h2><section class="card plist">${rows.map(r => progressRow(split, r)).join("")}</section>`;
  }).join("");
  return `
    ${sections || `<p class="muted">보여 줄 종목이 없어요.</p>`}
    ${hiddenList()}
    <p class="muted small">점 하나 = 그날 가장 무거운 무게 (맨몸 운동은 그날 최고 횟수). 같은 분할끼리만 이어요. 종목을 누르면 그래프가 열려요.</p>`;
}

function hiddenList() {
  if (!data.hiddenGraphs.length) return "";
  const rows = !ui.showHidden ? "" : `
      <section class="card plist">${data.hiddenGraphs.map(key => {
        const [split, name] = key.split("|");
        return `<div class="hrow"><span>${escapeHtml(name)} <span class="muted small">${split}</span></span>
          <button class="link small" data-action="graph-unhide" data-key="${escapeHtml(key)}">다시 보이기</button></div>`;
      }).join("")}</section>`;
  return `
    <button class="link small" data-action="graph-show-hidden">숨긴 종목 ${data.hiddenGraphs.length}개 ${ui.showHidden ? "▴" : "▾"}</button>
    ${rows}`;
}

function progressRow(split, { name, pts }) {
  const bw = isBodyweight(name);
  const key = `${split}|${name}`;
  const first = pts[0], last = pts[pts.length - 1];
  const unit = bw ? "회" : "kg";
  const values = pts.length < 2 ? `${num(last.v)}${unit}` : `${num(first.v)}${unit} → ${num(last.v)}${unit}`;
  const change = pts.length < 2 ? `<span class="muted">기록 1회</span>` : `<b>${signed(last.v - first.v)}${unit}</b>`;
  const open = ui.graphOpen === key;
  return `
    <button class="prow ${open ? "open" : ""}" data-action="graph-open" data-key="${escapeHtml(key)}">
      <span class="pname"><b>${escapeHtml(name)}</b>${bw ? `<span class="badge">맨몸 · 최고 횟수</span>` : ""}</span>
      <span class="pval small">${values} · ${change}</span>
    </button>
    ${open ? progressChart(name, pts, bw) + progressDetail(key, pts, bw) : ""}`;
}

// 그래프 아래: e1RM 숫자 한 줄 + 설명 + 숨기기
function progressDetail(key, pts, bw) {
  const first = pts[0], last = pts[pts.length - 1];
  const e1rmLine = bw ? "" : `
      <p class="e1rm"><b>e1RM: ${last.e1rm.toFixed(1)}kg</b>${pts.length > 1
        ? ` <span class="muted small">(첫 기록 ${first.e1rm.toFixed(1)}kg → ${signed(round1((last.e1rm / first.e1rm - 1) * 100))}%)</span>` : ""}</p>
      <p class="muted small">e1RM = 무게와 횟수로 계산한 "1회만 든다면 들 수 있는 무게" 추정치 (무게 × (1 + 횟수/30)). 무게가 같아도 횟수가 늘면 올라가요.</p>`;
  return `
    <div class="pdetail">
      ${e1rmLine}
      <button class="link small" data-action="graph-hide" data-key="${escapeHtml(key)}">목록에서 숨기기</button>
    </div>`;
}

function niceStep(rough) {                       // 눈금 간격을 1 · 2 · 5 · 10 … 같은 깔끔한 수로
  const steps = [1, 2, 2.5, 5, 10, 20, 25, 50, 100];
  return steps.find(s => s >= rough) || 100;
}

// 종목 하나의 그래프: 가로 = 날짜, 세로 = e1RM(kg) 또는 횟수. 점을 누르면 그날 세트가 나옴
function progressChart(name, pts, bw) {
  const W = 340, H = 170, L = 40, R = 46, T = 12, B = 24;
  const d0 = pts[0].day, d1 = pts[pts.length - 1].day;
  const span = Math.max(daysBetween(d0, d1), 1);
  const x = d => pts.length === 1 ? L + (W - L - R) / 2 : L + daysBetween(d0, d) / span * (W - L - R);
  const vs = pts.map(p => p.v);
  const pad = Math.max(bw ? 1 : 2.5, (Math.max(...vs) - Math.min(...vs)) * 0.2);
  const step = niceStep((Math.max(...vs) - Math.min(...vs) + 2 * pad) / 4);
  const lo = Math.floor((Math.min(...vs) - pad) / step) * step, hi = Math.ceil((Math.max(...vs) + pad) / step) * step;
  const y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  const ticks = [];
  for (let v = Math.max(lo, 0); v <= hi + 1e-9; v += step) ticks.push(v);
  const unit = bw ? "회" : "kg";
  const grid = ticks.map(v => `
      <line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="axis" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${num(v)}</text>`).join("");
  const xTicks = [...new Set([d0, d1])].map(d =>
    `<text class="axis" x="${x(d)}" y="${H - 6}" text-anchor="middle">${dayLabel(d)}</text>`).join("");
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const label = v => num(v);
  const hitW = Math.max(24, pts.length > 1 ? (W - L - R) / span : 24);
  return `
    <div class="chart pchart">
      <p class="muted small">${bw ? "그날 최고 횟수 (회)" : "그날 가장 무거운 무게 (kg)"}</p>
      <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${escapeHtml(name)} ${pts.length}회 기록, 최근 ${label(last.v)}${unit}">
        ${grid}${xTicks}
        <line id="pc-x" class="cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
        ${pts.length > 1 ? `<path class="avg" d="${path}"/>` : ""}
        ${pts.map(p => `<circle class="avg-end" cx="${x(p.day)}" cy="${y(p.v)}" r="4"/>`).join("")}
        <text class="end-label" x="${x(last.day) + 8}" y="${y(last.v) + 4}">${label(last.v)}</text>
        ${pts.map(p => `<rect class="hit" x="${x(p.day) - hitW / 2}" y="0" width="${hitW}" height="${H}" data-cx="${x(p.day)}"
           data-title="${dayLabel(p.day)}" data-value="${label(p.v)}${unit}" data-name="${bw ? "최고 횟수" : "최고 무게"}"
           data-set="${bw ? "" : `${num(p.set.w)}kg × ${p.set.r}회 · e1RM ${p.e1rm.toFixed(1)}kg`}"/>`).join("")}
      </svg>
      <div id="pc-tip" class="tip" hidden></div>
    </div>`;
}

function showProgressTip(rect) {                 // 누른 점의 날짜 · 값 · 그 세트 (글자는 textContent로 넣음)
  const cross = document.getElementById("pc-x"), tip = document.getElementById("pc-tip");
  cross.setAttribute("x1", rect.dataset.cx); cross.setAttribute("x2", rect.dataset.cx);
  cross.setAttribute("visibility", "visible");
  const title = document.createElement("div"); title.className = "muted"; title.textContent = rect.dataset.title;
  const row = document.createElement("div");
  const b = document.createElement("b"); b.textContent = rect.dataset.value;
  row.append(b, " " + rect.dataset.name);
  tip.replaceChildren(title, row);
  if (rect.dataset.set) {
    const set = document.createElement("div"); set.className = "muted"; set.textContent = rect.dataset.set;
    tip.append(set);
  }
  const box = rect.ownerSVGElement.getBoundingClientRect();
  const px = Number(rect.dataset.cx) / 340 * box.width;
  tip.hidden = false;
  tip.style.left = Math.min(Math.max(px - tip.offsetWidth / 2, 0), box.width - tip.offsetWidth) + "px";
}


// ---------- 3. 숨긴 목록 동기화 (sync.js의 syncNow가 부름) ----------

function hiddenChanged() {
  data.hiddenDirty = true;                       // 표시: 바뀌었는데 아직 안 올림
  save();
  render();
  if (typeof syncNow === "function") syncNow();
}

async function syncAppSettings() {
  if (data.hiddenDirty) {                        // [1] 폰에서 바꿨으면 → 올리기 (덮어쓰기)
    const { error } = await db.from("app_settings")
      .upsert({ hidden_graphs: data.hiddenGraphs, updated_at: new Date().toISOString() });
    if (error) throw error;
    data.hiddenDirty = false;
    save();
    return;                                      //     방금 올린 게 가장 최신이니까 받을 필요 없음
  }
  const { data: rows, error } = await db.from("app_settings").select("hidden_graphs");   // [2] 받기
  if (error) throw error;
  if (rows.length) {                             //     인터넷에 있으면 그것으로 (다른 기기에서 바꾼 것)
    data.hiddenGraphs = rows[0].hidden_graphs || [];
    save();
  }
}


// ---------- 4. 버튼 연결 ----------

document.addEventListener("click", event => {
  const el = event.target.closest("[data-action]");
  if (!el) return;
  const key = el.dataset.key;
  switch (el.dataset.action) {
    case "graph-open": ui.graphOpen = ui.graphOpen === key ? null : key; return render();
    case "graph-hide":
      data.hiddenGraphs.push(key);
      ui.graphOpen = null;
      return hiddenChanged();
    case "graph-unhide":
      data.hiddenGraphs = data.hiddenGraphs.filter(k => k !== key);
      return hiddenChanged();
    case "graph-show-hidden": ui.showHidden = !ui.showHidden; return render();
  }
});

document.addEventListener("pointerdown", event => {
  const hit = event.target.closest && event.target.closest(".pchart .hit");
  if (hit) return showProgressTip(hit);
  const cross = document.getElementById("pc-x"), tip = document.getElementById("pc-tip");
  if (cross) cross.setAttribute("visibility", "hidden");
  if (tip) tip.hidden = true;
});
document.addEventListener("pointermove", event => {
  const hit = event.target.closest && event.target.closest(".pchart .hit");
  if (hit) showProgressTip(hit);
});
