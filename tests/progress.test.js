// 운동 그래프 (progress.js) — e1RM 숫자 줄
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/load-app");
const { workout, baseData } = require("./helpers/sample");

test("e1RM: 노트북 ④처럼 소수 첫째 자리, 변화 %는 노트북 ⑥과 같은 식", () => {
  const app = loadApp({ data: baseData({ workouts: [
    workout("w1", "가슴", "2026-10-01", [["Bench press", 80, [8, 8]]]),
    workout("w2", "가슴", "2026-10-08", [["Bench press", 85, [8, 6]]]),
  ] }) });
  const pts = app.get(`progressSeries("가슴", "Bench press")`);
  assert.deepEqual(pts.map(p => [p.day, p.v, p.e1rm]), [["2026-10-01", 80, 101.3], ["2026-10-08", 85, 107.7]]);
  const html = app.get(`progressDetail("가슴|Bench press", progressSeries("가슴", "Bench press"), false)`);
  assert.match(html, /첫 기록 101\.3kg → \+6\.3%/);              // (107.7 / 101.3 − 1) × 100 = 6.3
});

test("B7: 첫 기록 e1RM이 0이면 %를 안 보여 줌 (예전엔 +Infinity%)", () => {
  const app = loadApp({ data: baseData({ workouts: [
    workout("w1", "가슴", "2026-10-01", [["Bench press", 0, [12, 12]]]),   // 맨몸처럼 0kg로 적은 첫 날
    workout("w2", "가슴", "2026-10-08", [["Bench press", 60, [10]]]),
  ] }) });
  const html = app.get(`progressDetail("가슴|Bench press", progressSeries("가슴", "Bench press"), false)`);
  assert.doesNotMatch(html, /Infinity|NaN/);
  assert.match(html, /첫 기록 0\.0kg\)/);
  assert.equal(app.get("changePct(0, 80)"), "");
  assert.equal(app.get("changePct(100, 110)"), " → +10%");
});
