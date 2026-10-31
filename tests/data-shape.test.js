// 저장 모양 정리 (app.js canonicalizeData · mergeSameName · load)
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/load-app");
const { workout, baseData } = require("./helpers/sample");

test("mergeSameName: 같은 이름이 둘이면 앞 것에 세트 · 메모를 합침", () => {
  const app = loadApp();
  const out = app.get(`mergeSameName([
    { name: "Side lateral raise", rpe: 8, note: "가볍게", sets: [{ w: 10, r: 15 }], draft: { w: 10, r: 15 } },
    { name: "Dips", rpe: null, sets: [{ w: 0, r: 12 }], draft: { w: 0, r: 12 } },
    { name: "Side lateral raise", rpe: 9, note: "마지막 실패", sets: [{ w: 8, r: 20 }], draft: { w: 8, r: 20 } }])`);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { name: "Side lateral raise", rpe: 9, note: "가볍게 / 마지막 실패",
    sets: [{ w: 10, r: 15 }, { w: 8, r: 20 }], draft: { w: 8, r: 20 } });
});

test("canonicalizeData: 옛 이름 → 정식 이름, 겹치면 합치고 다시 올리기 표시", () => {
  const w = workout("w1", "어깨", "2026-10-01", [["SLL", 10, [15]], ["Lateral raise", 8, [20]], ["Smith SLL", 7, [17]]], { synced: true });
  const app = loadApp({ data: baseData({ workouts: [w], custom: { "BB row": { part: "등", range: [8, 12], step: 5 } },
    hiddenGraphs: ["어깨|SLL"] }) });
  const d = app.get("data");
  assert.deepEqual(d.workouts[0].exercises.map(e => [e.name, e.sets.length]),
    [["Side lateral raise", 2], ["Cable side lateral raise", 1]]);
  assert.equal(d.workouts[0].synced, false);                     // 이름이 바뀌었으니 다시 올림
  assert.deepEqual(d.custom, {});                                // 사전에 있는 이름은 내 종목에서 빠짐
  assert.deepEqual(d.deletedCustoms, ["BB row"]);
  assert.deepEqual(d.hiddenGraphs, ["어깨|Side lateral raise"]);
  assert.equal(d.hiddenDirty, true);
  assert.deepEqual(app.saved().workouts[0].exercises[0].name, "Side lateral raise");   // load 직후 바로 저장
});

test("canonicalizeData: 세트 메모(v0.5-c) → 종목 메모로", () => {
  const w = workout("w1", "가슴", "2026-10-01", [["Bench press", 80, [8, 8]]], { synced: true });
  w.exercises[0].sets[1].note = "그립 넓게";
  const app = loadApp({ data: baseData({ workouts: [w] }) });
  const e = app.get("data.workouts[0].exercises[0]");
  assert.equal(e.note, "2세트: 그립 넓게");
  assert.equal(e.sets[1].note, undefined);
});

test("load: 예전 저장에도 새 칸이 생김 (ownerId 포함, v0.6-d) · 깨진 저장은 새로 시작", () => {
  const app = loadApp({ data: { workouts: [], currentId: null, custom: {} } });
  const d = app.get("data");
  for (const key of ["meals", "body", "myFoods", "deletedWeights", "ownerId"]) assert.ok(key in d, key);
  assert.equal(d.ownerId, null);
  const broken = loadApp();
  broken.storage.set("iwbm-data-v1", "{not json");
  assert.deepEqual(broken.get("load().workouts"), []);
});
