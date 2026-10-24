// I will become monster — v0.5-l 효과: 추가 확인 알림 · 운동 시작 / 끝 애니메이션
//
// [지도]
//   들어오는 것: 다른 파일이 부르는 toast("…"), startSplash("가슴"), finishSplash(운동)
//   하는 일:     #app 바깥(body)에 잠깐 떴다 사라지는 화면을 붙임 → render()가 다시 그려도 안 지워짐
//   나가는 것:   화면 아래 알림 한 줄 / 화면 전체 애니메이션 (누르면 바로 닫힘)
//
//   폰 설정에서 "동작 줄이기"를 켜면 큰 애니메이션은 건너뛰고 알림만 보여 줌

const TOAST_MS = 2200;             // 알림이 떠 있는 시간
const START_SPLASH_MS = 1600;      // 운동 시작 애니메이션 길이
const FINISH_SPLASH_MS = 6000;     // 운동 끝 화면이 혼자 닫힐 때까지 (누르면 바로 닫힘)
const CONFETTI_COUNT = 42;         // 운동 끝 색종이 개수
const CONFETTI_COLORS = ["#ff5a1f", "#c8f24a", "#ff3d6e", "#4fd1ff", "#f3f3f1"];

const reducedMotion = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const buzz = (ms = 12) => { if (navigator.vibrate) navigator.vibrate(ms); };   // 안드로이드만 진동 (아이폰 사파리는 지원 안 함)

// 화면 아래 알림 한 줄 (✓ + 글자). 연달아 부르면 글자만 바꾸고 시간을 다시 잼
let toastTimer = null;
function toast(text) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.setAttribute("role", "status");
    document.body.append(el);
  }
  el.textContent = text;                                       // 사용자가 적은 글자도 들어가니까 textContent로
  el.classList.remove("show");
  void el.offsetWidth;                                         // 애니메이션을 처음부터 다시
  el.classList.add("show");
  buzz();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), TOAST_MS);
}

// 화면 전체를 덮는 판 하나 만들기 (누르면 닫힘, ms 뒤에 혼자 닫힘)
function overlay(className, html, ms) {
  const el = document.createElement("div");
  el.className = "fx " + className;
  el.innerHTML = html;
  const close = () => { el.classList.add("out"); setTimeout(() => el.remove(), 300); };
  el.addEventListener("click", close);
  setTimeout(close, ms);
  document.body.append(el);
  return el;
}

// 운동 시작: 분할 이름이 크게 → 주황 원이 퍼지며 사라짐
function startSplash(split) {
  if (reducedMotion()) return toast(`${split} 운동 시작`);
  const now = new Date();
  overlay("fx-start", `
    <span class="ring"></span><span class="ring r2"></span><span class="ring r3"></span>
    <div class="fx-center">
      <p class="fx-kicker">운동 시작</p>
      <p class="fx-split">${escapeHtml(split)}</p>
      <p class="fx-sub">${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")} · 오늘도 한 세트씩</p>
    </div>`, START_SPLASH_MS);
  buzz(20);
}

// 운동 끝: 색종이 + 종목 · 세트 · 시간이 0부터 올라감
function finishSplash(w) {
  if (reducedMotion()) return toast(`운동 끝 · ${totalSets(w)}세트`);
  const pieces = Array.from({ length: CONFETTI_COUNT }, (_, i) => {
    const style = [
      `left:${Math.random() * 100}%`, `background:${CONFETTI_COLORS[i % CONFETTI_COLORS.length]}`,
      `animation-delay:${(Math.random() * 0.6).toFixed(2)}s`, `animation-duration:${(1.8 + Math.random() * 1.4).toFixed(2)}s`,
      `--spin:${Math.round(360 + Math.random() * 720)}deg`, `--drift:${Math.round(Math.random() * 80 - 40)}px`,
    ].join(";");
    return `<i style="${style}"></i>`;
  }).join("");
  const el = overlay("fx-finish", `
    <div class="confetti">${pieces}</div>
    <div class="fx-center">
      <p class="fx-kicker">${escapeHtml(w.split)} · ${dateLabel(w.start)}</p>
      <p class="fx-title">운동 끝!</p>
      <div class="fx-stats">
        <div><b class="num c-count" data-to="${w.exercises.length}">0</b><span>종목</span></div>
        <div><b class="num c-lift" data-to="${totalSets(w)}">0</b><span>세트</span></div>
        <div><b class="num c-time">${duration(w)}</b><span>시간</span></div>
      </div>
      <p class="fx-sub">눌러서 요약 보기</p>
    </div>`, FINISH_SPLASH_MS);
  countUp(el.querySelectorAll("[data-to]"), 900);
  buzz(40);
}

function countUp(els, ms) {                                     // 숫자를 0 → 목표까지 올리기
  const t0 = performance.now();
  const step = t => {
    const k = Math.min(1, (t - t0) / ms), ease = 1 - Math.pow(1 - k, 3);
    els.forEach(b => { b.textContent = Math.round(Number(b.dataset.to) * ease); });
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
