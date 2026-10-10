// I will become monster — v0.4-d-2 운동 그래프 (🏋️ Workout → 그래프 탭)
//
// [지도]
//   들어오는 것: 끝난 운동들 (data.workouts)
//   하는 일:     노트북 ④ · ⑥을 JS로 — 세트마다 e1RM, (분할, 종목, 날짜)마다 그날 가장 높은 세트 하나 = 점 하나
//                맨몸 운동은 e1RM 대신 그날 최고 횟수
//   나가는 것:   분할별 종목 목록 (첫 기록 → 최근, 변화) + 누르면 그 종목 그래프 (가로 = 날짜)

const GRAPH_MIN_RECORDS = 1;                     // 목록에 보여 줄 최소 기록 횟수 (2로 바꾸면 선이 있는 종목만 나옴)
const e1rm = (w, r) => round1(w * (1 + r / 30)); // Epley 공식, 소수 첫째 자리 — 노트북 ④와 같은 식

ui.graphOpen = null;                             // 펼쳐진 그래프 ("가슴|Bench press")


// ---------- 1. 계산 ----------

// (분할, 종목) → [{ day: "2026-10-05", v: 그날 최고 e1RM(또는 횟수), set: { w, r } }, …] 오래된 순
function progressSeries(split, name) {
  const bw = isBodyweight(name);
  const byDay = {};
  for (const w of finishedWorkouts()) {
    if (w.split !== split) continue;
    const sets = w.exercises.filter(e => e.name === name).flatMap(e => e.sets);
    if (!sets.length) continue;
    const day = isoDay(new Date(w.start));
    for (const s of sets) {
      const v = bw ? s.r : e1rm(s.w, s.r);
      if (!byDay[day] || v > byDay[day].v) byDay[day] = { day, v, set: s };
    }
  }
  return Object.keys(byDay).sort().map(d => byDay[d]);
}


// ---------- 2. 화면 ----------

function progressView() {
  const done = finishedWorkouts();
  if (!done.length) return `<p class="muted">아직 기록이 없어요. 운동을 끝내면 여기에 종목별 그래프가 생겨요.</p>`;
  const sections = DAYS.map(split => {
    const names = [...new Set(done.filter(w => w.split === split)
      .flatMap(w => w.exercises.filter(e => e.sets.length).map(e => e.name)))]
      .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
    const rows = names.map(name => ({ name, pts: progressSeries(split, name) }))
      .filter(r => r.pts.length >= GRAPH_MIN_RECORDS);
    if (!rows.length) return "";
    return `<h2>${split}</h2><section class="card plist">${rows.map(r => progressRow(split, r)).join("")}</section>`;
  }).join("");
  return `
    ${sections || `<p class="muted">기록이 ${GRAPH_MIN_RECORDS}번 이상인 종목이 아직 없어요.</p>`}
    <p class="muted small">점 하나 = 그날 가장 높은 세트의 e1RM (무게 × (1 + 횟수/30)). 같은 분할끼리만 이어요. 종목을 누르면 그래프가 열려요.</p>`;
}

function progressRow(split, { name, pts }) {
  const bw = isBodyweight(name);
  const key = `${split}|${name}`;
  const first = pts[0], last = pts[pts.length - 1];
  const fmt = v => bw ? `${v}회` : `${v.toFixed(1)}kg`;
  const values = pts.length < 2 ? fmt(last.v) : `${fmt(first.v)} → ${fmt(last.v)}`;
  const change = pts.length < 2 ? `<span class="muted">기록 1회</span>`
    : `<b>${bw ? signed(last.v - first.v) + "회" : signed(round1((last.v / first.v - 1) * 100)) + "%"}</b>`;
  const open = ui.graphOpen === key;
  return `
    <button class="prow ${open ? "open" : ""}" data-action="graph-open" data-key="${escapeHtml(key)}">
      <span class="pname"><b>${escapeHtml(name)}</b>${bw ? `<span class="badge">맨몸 · 최고 횟수</span>` : ""}</span>
      <span class="pval small">${values} · ${change}</span>
    </button>
    ${open ? progressChart(name, pts, bw) : ""}`;
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
  const label = v => bw ? `${v}` : v.toFixed(1);
  const hitW = Math.max(24, pts.length > 1 ? (W - L - R) / span : 24);
  return `
    <div class="chart pchart">
      <p class="muted small">${bw ? "그날 최고 횟수 (회)" : "그날 최고 e1RM (kg)"}</p>
      <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${escapeHtml(name)} ${pts.length}회 기록, 최근 ${label(last.v)}${unit}">
        ${grid}${xTicks}
        <line id="pc-x" class="cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
        ${pts.length > 1 ? `<path class="avg" d="${path}"/>` : ""}
        ${pts.map(p => `<circle class="avg-end" cx="${x(p.day)}" cy="${y(p.v)}" r="4"/>`).join("")}
        <text class="end-label" x="${x(last.day) + 8}" y="${y(last.v) + 4}">${label(last.v)}</text>
        ${pts.map(p => `<rect class="hit" x="${x(p.day) - hitW / 2}" y="0" width="${hitW}" height="${H}" data-cx="${x(p.day)}"
           data-title="${dayLabel(p.day)}" data-value="${label(p.v)}${unit}" data-name="${bw ? "최고 횟수" : "e1RM"}"
           data-set="${bw ? "" : `${num(p.set.w)}kg × ${p.set.r}회`}"/>`).join("")}
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


// ---------- 3. 버튼 연결 ----------

document.addEventListener("click", event => {
  const el = event.target.closest("[data-action]");
  if (!el || el.dataset.action !== "graph-open") return;
  ui.graphOpen = ui.graphOpen === el.dataset.key ? null : el.dataset.key;
  render();
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
