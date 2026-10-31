// 다음 무게 제안 (app.js nextWeight · suggestion) — 노트북 ⑧ next_weight와 같은 규칙
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/load-app");
const { workout, baseData } = require("./helpers/sample");

const app = loadApp();
const nw = (...args) => app.get(`nextWeight(${args.map(a => JSON.stringify(a)).join(",")})`);

test("nextWeight: 모든 세트가 범위 최대 → 증량", () => {
  assert.deepEqual(nw(80, [10, 10, 10], 8, 10, 5, null), { weight: 85, reason: "모든 세트 10회 달성 → +5kg" });
  assert.deepEqual(nw(20, [12, 13], 10, 12, 2.5, 9), { weight: 22.5, reason: "모든 세트 12회 달성 → +2.5kg" });
});

test("nextWeight: 다 채웠지만 RPE 10 → 같은 무게로 굳히기", () => {
  assert.deepEqual(nw(80, [10, 10], 8, 10, 5, 10), { weight: 80, reason: "모든 세트 10회 달성, 하지만 RPE 10 → 같은 무게로 한 번 더" });
});

test("nextWeight: 최고 횟수가 범위 최소보다 적으면 감량 (0 아래로는 안 감)", () => {
  assert.deepEqual(nw(80, [5, 4], 8, 10, 5, null), { weight: 75, reason: "최고 5회 < 8회 → -5kg" });
  assert.equal(nw(2, [3], 8, 10, 5, null).weight, 0);
});

test("nextWeight: 범위 안이면 같은 무게, 맨몸은 횟수 +1", () => {
  assert.deepEqual(nw(80, [9, 8], 8, 10, 5, null), { weight: 80, reason: "같은 무게로 모든 세트 10회까지" });
  assert.deepEqual(nw(0, [12, 10], 8, 12, 0, null), { weight: 0, reason: "맨몸 → 같은 세트 수로 세트마다 1회씩 더" });
});

test("suggestion: 지난번 같은 분할의 본 세트로 계산 + 중간에 무게를 낮춘 경우", () => {
  const a = loadApp({ data: baseData({ workouts: [
    workout("w1", "가슴", "2026-10-01", [["Bench press", 80, [8, 8, 8]]]),
    workout("w2", "가슴", "2026-10-05", [["Bench press", 85, [6, 6]]]),
  ] }) });
  a.run(`data.workouts[1].exercises[0].sets.push({ w: 80, r: 8 })`);          // 85, 85, 80 → 중간에 낮춤
  assert.deepEqual(a.get(`suggestion({ split: "가슴", exercises: [] }, "Bench press")`),
    { weight: 85, reason: "중간에 무게를 낮춤 → 85kg로 3세트 도전 (안 되면 80kg)" });
  assert.equal(a.get(`suggestion({ split: "등", exercises: [] }, "Bench press")`), null);   // 다른 분할 기록은 안 씀
});

test("suggestion: 분할 조합은 따로 (어깨+팔 ≠ 가슴+팔, v0.6-b)", () => {
  const a = loadApp({ data: baseData({ workouts: [
    workout("w1", "어깨+팔", "2026-10-01", [["Barbell curl", 30, [10, 10]]]),
    workout("w2", "가슴+팔", "2026-10-03", [["Barbell curl", 40, [6, 6]]]),
  ] }) });
  assert.equal(a.get(`suggestion({ split: "어깨+팔", exercises: [] }, "Barbell curl")`).weight, 35);   // 8~10회 달성 → +5
  assert.equal(a.get(`suggestion({ split: "가슴+팔", exercises: [] }, "Barbell curl")`).weight, 35);   // 6 < 8 → -5
  assert.equal(a.get(`initialDraft({ split: "팔", exercises: [] }, "Barbell curl")`).w, 20);           // 기록 없음 → 기본 20kg
});
