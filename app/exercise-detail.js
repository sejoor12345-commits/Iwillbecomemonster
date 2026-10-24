// I will become monster — v0.5-k 종목 상세 화면 (요약 · 기록 · 자세)
//
// [지도]
//   들어오는 것: 운동 그래프 목록에서 종목 누르기, 운동 중 종목 카드의 "자세 · 기록"
//   하는 일:     한 종목을 한 화면에 — 동작 그림(GIF) · 주동근 · 보조근 · 성장 그래프(progress.js) · 지난 기록 · 수행 방법
//   나가는 것:   ui.screen = "exercise" 화면. 뒤로 가기(‹)는 들어오기 전 화면으로
//
//   그림 · 근육 · 수행 방법은 exercise-media.js (사전에 없는 내 종목은 그림 없이 기록만)

const DETAIL_HISTORY_SHOWN = 30;                 // "기록" 탭에 보여 줄 최근 운동 수

ui.exDetail = null;                              // { name, split, tab: "summary" | "history" | "how", from: 들어오기 전 화면 }

// split = 어느 분할 그래프를 볼지 (null이면 기록이 가장 많은 분할)
function openExerciseDetail(name, split, from) {
  if (!split) {
    const counts = DAYS.map(d => [d, progressSeries(d, name).length]).sort((a, b) => b[1] - a[1]);
    split = counts[0][1] ? counts[0][0] : null;
  }
  ui.exDetail = { name, split, tab: "summary", from };
  ui.screen = "exercise";
  window.scrollTo(0, 0);
  render();
}

// 이 종목을 한 분할들 (그래프 고르기용)
function detailSplits(name) {
  return DAYS.filter(d => progressSeries(d, name).length);
}

function exerciseView() {
  const s = ui.exDetail;
  if (!s) { ui.screen = "workouts"; return workoutsView(); }
  const tab = (v, label) => `<button class="${s.tab === v ? "selected" : ""}" data-action="ex-tab" data-v="${v}">${label}</button>`;
  const body = s.tab === "history" ? detailHistory(s.name) : s.tab === "how" ? detailHow(s.name) : detailSummary(s);
  return `
    <header class="bar">
      <button class="back" data-action="ex-back" aria-label="뒤로">‹</button>
      <h1 class="title-sm">${escapeHtml(s.name)}</h1>
    </header>
    <div class="tabs">${tab("summary", "요약")}${tab("history", "기록")}${tab("how", "자세")}</div>
    <main>${body}</main>`;
}

function detailMedia(name) {
  const url = mediaUrl(name);
  if (!url) return "";
  return `
    <div class="ex-media"><img src="${url}" alt="${escapeHtml(name)} 동작" loading="lazy" width="220" height="220"></div>
    <p class="credit">${MEDIA_CREDIT}</p>`;
}

function detailSummary(s) {
  const m = EXERCISE_MEDIA[s.name];
  const e = EXERCISES[s.name];
  const bw = isBodyweight(s.name);
  const splits = detailSplits(s.name);
  const pts = s.split ? progressSeries(s.split, s.name) : [];
  const last = pts[pts.length - 1];
  return `
    ${detailMedia(s.name)}
    <p class="ex-title">${escapeHtml(s.name)}</p>
    ${e ? `<p class="muted">${e.ko}</p>` : ""}
    ${m ? `<dl class="muscles"><dt>주동근</dt><dd>${m.target}</dd>${m.others.length ? `<dt>보조근</dt><dd>${m.others.join(", ")}</dd>` : ""}</dl>` : ""}
    ${splits.length > 1 ? `<div class="choices">${splits.map(d =>
      `<button class="small ${d === s.split ? "selected" : ""}" data-action="ex-split" data-v="${d}">${d}</button>`).join("")}</div>` : ""}
    ${last ? `
      <div class="best"><b class="num c-lift">${num(last.v)}<small>${bw ? "회" : "kg"}</small></b><span>${dayLabel(last.day)}</span>
        <span class="muted small">${s.split} · 최근 ${bw ? "최고 횟수" : "최고 무게"}</span></div>
      ${progressChart(s.name, pts, bw)}
      ${progressDetail(`${s.split}|${s.name}`, pts, bw)}`
    : `<p class="muted">아직 끝낸 운동에 이 종목 기록이 없어요. 운동을 끝내면 여기에 성장 그래프가 생겨요.</p>`}`;
}

// 기록 탭: 이 종목을 한 운동들 (최근 → 예전)
function detailHistory(name) {
  const done = finishedWorkouts().filter(w => w.exercises.some(e => e.name === name && e.sets.length)).reverse();
  if (!done.length) return `<p class="muted">아직 기록이 없어요.</p>`;
  return `<section class="card pad">${done.slice(0, DETAIL_HISTORY_SHOWN).map(w => {
    const e = w.exercises.find(x => x.name === name && x.sets.length);
    return `
      <div class="session">
        <div class="top-line"><b>${dateLabel(w.start)}</b><span class="muted small">${exerciseSplit(w, name)}${e.rpe ? ` · RPE ${e.rpe}` : ""}</span></div>
        <div class="sets">${formatSets(name, e.sets)}</div>
        ${e.note ? `<p class="small muted">✎ ${escapeHtml(e.note)}</p>` : ""}
      </div>`;
  }).join("")}</section>`;
}

// 자세 탭: 그림 + 수행 방법 (순서가 있는 동작이라 번호 목록)
function detailHow(name) {
  const m = EXERCISE_MEDIA[name];
  if (!m) return `<p class="muted">사전에 없는 내 종목이라 수행 방법이 없어요.</p>`;
  return `
    ${detailMedia(name)}
    <ol class="steps">${m.steps.map(t => `<li>${escapeHtml(t)}</li>`).join("")}</ol>`;
}

document.addEventListener("click", event => {
  const el = event.target.closest("[data-action]");
  if (!el) return;
  switch (el.dataset.action) {
    case "ex-detail": return openExerciseDetail(el.dataset.name, el.dataset.split || null, ui.screen);
    case "ex-tab": ui.exDetail.tab = el.dataset.v; return render();
    case "ex-split": ui.exDetail.split = el.dataset.v; return render();
    case "ex-back": ui.screen = ui.exDetail.from || "workouts"; ui.exDetail = null; return render();
  }
});
