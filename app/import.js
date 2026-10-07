// I will become monster — v0.4-c-3 메모 가져오기
//
// [지도]
//   들어오는 것: 아이폰 메모 글자 (노트북 ① MEMO와 같은 형식)
//   하는 일:     노트북 ③ parse_memo를 JS로 옮긴 것 — 한 줄씩 읽어서 운동 → 종목 → 세트로 조립
//   나가는 것:   미리보기 → [가져오기]를 누르면 data.workouts에 추가 (로그인돼 있으면 바로 올라감)
//
//   노트북(Python)                     앱(JS)
//   parse_set("60*10*3")              parseSet("60*10*3")      → { w: 60, r: 10, count: 3 }
//   parse_line(tokens)                parseLine(tokens)        → { name, sets }
//   parse_superset(tokens)            parseSuperset(tokens)    → [{ name, sets }, { name, sets }]
//   parse_memo(memo)                  parseMemo(memo)          → { sessions, skipped }

const ALIASES = { "ibp": "Free IBP", "hanging leg raise": "HLR", "incline bench press": "Smith IBP" };    // 같은 종목의 다른 이름 (소문자로 적기)

// 이름 정리: 별명 → 정식 이름, 대소문자만 다르면 목록의 이름으로 ("Smith sll" → "Smith SLL")
function canonicalName(raw) {
  const lower = raw.trim().toLowerCase();
  if (ALIASES[lower]) return ALIASES[lower];
  const known = [...Object.keys(EXERCISES), ...Object.keys(data.custom)].find(n => n.toLowerCase() === lower);
  return known || raw.trim();
}

// "60*10*3" → { w: 60, r: 10, count: 3 },  "60x10" → { w: 60, r: 10, count: 1 },  세트 모양이 아니면 null
function parseSet(token) {
  const parts = token.toLowerCase().replace(/[*×]/g, "x").split("x");
  if (parts.length !== 2 && parts.length !== 3) return null;
  if (!/^\d+(\.\d+)?$/.test(parts[0])) return null;                 // 무게: 60, 62.5
  if (!parts.slice(1).every(p => /^\d+$/.test(p))) return null;      // 횟수 · 세트 수: 정수만
  return { w: Number(parts[0]), r: Number(parts[1]), count: parts.length === 3 ? Number(parts[2]) : 1 };
}

// 보통 운동 줄  ['Dips', '12*3']  →  { name: 'Dips', sets: [{w:0,r:12,count:3}] }
function parseLine(tokens) {
  const nameWords = [], sets = [];
  for (const token of tokens) {
    let s = parseSet(token);
    if (s) {
      if (isBodyweight(canonicalName(nameWords.join(" "))) && s.w > 0) s = { w: 0, r: s.w, count: s.r };   // 맨몸의 '12*3' = 12회 × 3세트
      sets.push(s);
    } else if (/^\d+$/.test(token) && sets.length) {                // 60*12,12,10 의 '12', '10' → 앞 세트와 같은 무게
      sets.push({ w: sets[sets.length - 1].w, r: Number(token), count: 1 });
    } else if (/^\d+$/.test(token) && nameWords.length) {           // Pull up 13,12 → 맨몸(무게 0)
      sets.push({ w: 0, r: Number(token), count: 1 });
    } else if (!sets.length) {                                     // 첫 세트가 나오기 전 글자 = 종목 이름
      nameWords.push(token);
    }
  }
  if (!sets.length || !nameWords.length) return null;
  return [{ name: canonicalName(nameWords.join(" ")), sets }];
}

// 슈퍼세트 줄  ['Pull', 'up/Dips', '12/12*2']  →  두 종목.  '/' 앞 = 앞 종목 횟수, 뒤 = 뒤 종목 횟수, 무게는 같음
function parseSuperset(tokens) {
  const nameWords = [], setTokens = [];
  for (const token of tokens) {
    if (setTokens.length || /^\d/.test(token)) setTokens.push(token);
    else nameWords.push(token);
  }
  const names = nameWords.join(" ").split("/");
  if (names.length !== 2 || !setTokens.length) return null;
  const a = [], b = [];
  let weight = 0;
  for (const token of setTokens) {
    if ((token.match(/\//g) || []).length !== 1) return null;
    const [left, right] = token.split("/").map(x => x.split("*"));
    if (![...left, ...right].every(p => /^\d+(\.\d+)?$/.test(p))) return null;
    if (left.length === 2) weight = Number(left[0]);
    const count = right.length === 2 ? Number(right[1]) : 1;
    a.push({ w: weight, r: Number(left[left.length - 1]), count });
    b.push({ w: weight, r: Number(right[0]), count });
  }
  return [{ name: canonicalName(names[0]), sets: a }, { name: canonicalName(names[1]), sets: b }];
}

// "10/05" → Date(올해 10월 5일). 오늘보다 뒤면 작년으로 (12월 기록을 1월에 가져올 때)
function parseDate(token) {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(token || "");
  if (!m) return null;
  const today = new Date();
  const d = new Date(today.getFullYear(), Number(m[1]) - 1, Number(m[2]), 12, 0, 0);
  if (d > today) d.setFullYear(d.getFullYear() - 1);
  return d;
}

// 메모 전체 → { sessions: [{ split, date, exercises: [{ name, rpe, sets: [{w, r}] }] }], skipped: [이해 못 한 줄] }
function parseMemo(memo) {
  const sessions = [], skipped = [];
  let current = null;
  for (const raw of memo.split("\n")) {
    const line = raw.replace(/바 ?제외/g, "").replace(/@/g, " @");
    let tokens = line.replace(/,/g, " ").replace(/:/g, " ").split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;                                  // 빈 줄
    if (tokens[0] === "✓") continue;                               // ✓ = 그날 안 한 운동
    if (["◦", "•", "-"].includes(tokens[0])) tokens = tokens.slice(1);
    if (!tokens.length) continue;

    if (DAYS.includes(tokens[0])) {                                // 분할 줄 → 새 운동 (뒤에 날짜가 있으면 같이)
      current = { split: tokens[0], date: parseDate(tokens[1]), exercises: [] };
      sessions.push(current);
      continue;
    }

    let rpe = null;                                                // '@8' = 마지막 세트 RPE
    for (const t of tokens) if (/^@\d+$/.test(t)) rpe = Number(t.slice(1));
    tokens = tokens.filter(t => !t.startsWith("@"));

    const found = line.includes("/") ? parseSuperset(tokens) : parseLine(tokens);
    if (!current || !found) { skipped.push(raw.trim()); continue; }
    for (const ex of found) {
      const sets = ex.sets.flatMap(s => Array.from({ length: s.count }, () => ({ w: s.w, r: s.r })));   // 60*10*3 → 3세트
      current.exercises.push({ name: ex.name, rpe, sets });
    }
  }
  return { sessions: sessions.filter(s => s.exercises.length), skipped };
}

// 날짜가 없는 회차는 바로 다음 회차의 하루 전으로 추정 (마지막이 날짜 없음이면 오늘 기준)
function fillDates(sessions) {
  let anchor = new Date();
  anchor.setHours(12, 0, 0, 0);
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    if (s.date) { anchor = new Date(s.date); s.estimated = false; }
    else { anchor = new Date(anchor.getTime() - 86400000); s.date = anchor; s.estimated = true; }
  }
}

const dayKey = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

// 미리보기용으로 정리: 이미 앱에 있는 운동(같은 날 같은 분할)은 건너뜀, 처음 보는 종목 목록
function planImport(memo) {
  const { sessions, skipped } = parseMemo(memo);
  fillDates(sessions);
  const existing = new Set(data.workouts.map(w => w.split + "|" + dayKey(new Date(w.start))));
  const knownNames = new Set([...Object.keys(EXERCISES), ...Object.keys(data.custom)]);
  const newNames = {};
  for (const s of sessions) {
    s.duplicate = existing.has(s.split + "|" + dayKey(s.date));
    if (s.duplicate) continue;
    for (const e of s.exercises) {
      if (!knownNames.has(e.name) && !newNames[e.name]) {
        newNames[e.name] = { part: s.split, bodyweight: e.sets.every(x => x.w === 0) };   // 처음 보는 종목: 그날 분할 부위로
      }
    }
  }
  return { sessions, skipped, newNames };
}

function doImport() {
  const plan = ui.importPlan;
  for (const [name, n] of Object.entries(plan.newNames)) {
    data.custom[name] = { part: n.part, range: [8, 12], step: n.bodyweight ? 0 : 5 };
  }
  if (Object.keys(plan.newNames).length) data.customDirty = true;
  let added = 0;
  for (const s of plan.sessions.filter(x => !x.duplicate)) {
    const iso = s.date.toISOString();
    data.workouts.push({
      id: "m" + s.date.getTime().toString(36) + Math.random().toString(36).slice(2, 6),
      split: s.split, start: iso, end: iso, imported: true, estimated: s.estimated,
      exercises: s.exercises.map(e => ({ ...e, draft: { ...(e.sets[e.sets.length - 1] || { w: 0, r: 0 }) } })),
    });
    added++;
  }
  save();
  Object.assign(ui, { screen: "home", importText: "", importPlan: null });
  render();
  alert(`운동 ${added}개를 가져왔어요.`);
  if (typeof syncNow === "function") syncNow();                   // 로그인돼 있으면 바로 올리기
}


// ---------- 화면 ----------

function importView() {
  const plan = ui.importPlan;
  const preview = plan ? `
      <h2>미리보기</h2>
      ${plan.sessions.map(s => `
        <div class="history ${s.duplicate ? "dim" : ""}">
          <div class="history-top"><b>${dateLabel(s.date.toISOString())}${s.estimated ? " (추정)" : ""} ${s.split}</b>
            <span>${s.duplicate ? "이미 있음 → 건너뜀" : `${s.exercises.length}종목 · ${s.exercises.reduce((n, e) => n + e.sets.length, 0)}세트`}</span></div>
          <div class="muted small">${s.exercises.map(e => escapeHtml(e.name)).join(", ")}</div>
        </div>`).join("")}
      ${Object.keys(plan.newNames).length ? `<p class="notice">처음 보는 종목은 내 종목으로 추가해요 (나중에 종목 추가 목록의 [수정]으로 바꿀 수 있어요):<br>
        ${Object.entries(plan.newNames).map(([n, x]) => `${escapeHtml(n)} → ${x.part}${x.bodyweight ? " · 맨몸" : ""}`).join("<br>")}</p>` : ""}
      ${plan.skipped.length ? `<p class="notice">⚠️ 이해 못 한 줄 (건너뜀):<br>${plan.skipped.map(escapeHtml).join("<br>")}</p>` : ""}
      <button class="primary wide" data-action="do-import" ${plan.sessions.some(s => !s.duplicate) ? "" : "disabled"}>
        가져오기 (${plan.sessions.filter(s => !s.duplicate).length}개)</button>` : "";
  return `
    <header class="bar"><h1>메모 가져오기</h1><button class="small" data-action="home">홈</button></header>
    <main>
      <p class="muted small">노트북 ①과 같은 형식의 메모를 붙여넣어요. <code>가슴 10/05</code>처럼 분할 뒤에 날짜를 쓰면 그 날짜로, 날짜가 없으면 순서대로 하루씩 앞으로 추정해요. 같은 날 같은 분할이 이미 있으면 건너뛰어요.</p>
      <textarea id="import-text" rows="12" placeholder="가슴 10/05&#10;◦ Bench press: 85*8*4 @8&#10;◦ Pull up: 13,12,11">${escapeHtml(ui.importText || "")}</textarea>
      <button class="wide" data-action="preview-import">미리보기</button>
      ${preview}
    </main>`;
}

document.addEventListener("click", event => {
  const el = event.target.closest("[data-action]");
  if (!el) return;
  switch (el.dataset.action) {
    case "import-screen": Object.assign(ui, { screen: "import", importPlan: null }); return render();
    case "preview-import":
      ui.importText = document.getElementById("import-text").value;
      ui.importPlan = planImport(ui.importText);
      return render();
    case "do-import": return doImport();
  }
});
