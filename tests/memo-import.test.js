// 메모 읽기 (import.js parseSet · parseLine · parseSuperset · parseMemo) — 노트북 ③과 같은 결과인지
//   정답은 tests/fixtures/notebook-sample.json (노트북 셀을 그대로 실행해서 만든 것, tests/tools/notebook_expectations.py)
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/load-app");
const nb = require("./fixtures/notebook-sample.json");

const app = loadApp();
const call = (fn, arg) => app.get(`${fn}(${JSON.stringify(arg)})`);

test("parseSet: 무게*횟수(*세트), x · × 도 됨, 아니면 null", () => {
  assert.deepEqual(call("parseSet", "60*10*3"), { w: 60, r: 10, count: 3 });
  assert.deepEqual(call("parseSet", "62.5x8"), { w: 62.5, r: 8, count: 1 });
  assert.deepEqual(call("parseSet", "40×12"), { w: 40, r: 12, count: 1 });
  for (const bad of ["60", "60*", "60*8.5", "a*8", "60*8*3*2"]) assert.equal(call("parseSet", bad), null, bad);
});

test("parseLine: 이어 쓴 횟수 · 맨몸 · 맨몸의 12*3 = 12회 × 3세트", () => {
  assert.deepEqual(call("parseLine", ["Bench", "press", "85*8", "8", "7"]),
    [{ name: "Bench press", sets: [{ w: 85, r: 8, count: 1 }, { w: 85, r: 8, count: 1 }, { w: 85, r: 7, count: 1 }] }]);
  assert.deepEqual(call("parseLine", ["Pull", "up", "13", "12"]),
    [{ name: "Pull up", sets: [{ w: 0, r: 13, count: 1 }, { w: 0, r: 12, count: 1 }] }]);
  assert.deepEqual(call("parseLine", ["Dips", "12*3"]), [{ name: "Dips", sets: [{ w: 0, r: 12, count: 3 }] }]);
  assert.deepEqual(call("parseLine", ["BB", "row", "60*10"]), [{ name: "Barbell row", sets: [{ w: 60, r: 10, count: 1 }] }]);
  assert.equal(call("parseLine", ["85*8"]), null);                       // 이름 없음
  assert.equal(call("parseLine", ["Bench", "press"]), null);             // 세트 없음
});

test("parseSuperset: A/B 두 종목, 무게는 같음, 세트 수는 뒤쪽 *N", () => {
  assert.deepEqual(call("parseSuperset", ["Cable", "push", "down/Overhead", "extension", "35*10/12*2", "10/10"]), [
    { name: "Cable push down", sets: [{ w: 35, r: 10, count: 2 }, { w: 35, r: 10, count: 1 }] },
    { name: "Overhead triceps extension", sets: [{ w: 35, r: 12, count: 2 }, { w: 35, r: 10, count: 1 }] },
  ]);
  assert.equal(call("parseSuperset", ["A/B/C", "10/10"]), null);
  assert.equal(call("parseSuperset", ["A/B", "35*12/10*"]), null);
});

test("parseMemo: ✓ 줄 건너뜀 · 분할 줄의 날짜 · @RPE · 슈퍼세트 앞 종목에 ss", () => {
  const { sessions, skipped } = app.get(`(() => { const r = parseMemo(${JSON.stringify(
    "가슴 10/05\n◦ Bench press: 85*8*2 @9\n✓ Dips: 12*3\n◦ Pull up/Dips: 10/10\n이상한 줄\n\n어깨+팔\n◦ Barbell curl: 30*10")}); return { sessions: r.sessions.map(s => ({ ...s, date: s.date && s.date.getDate() })), skipped: r.skipped }; })()`);
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].date, 5);
  assert.deepEqual(sessions[0].exercises.map(e => [e.name, e.rpe, e.sets.length, !!e.ss]),
    [["Bench press", 9, 2, false], ["Pull up", null, 1, true], ["Dips", null, 1, false]]);
  assert.equal(sessions[1].split, "어깨+팔");
  assert.deepEqual(skipped, ["이상한 줄"]);
});

// ---------- 노트북 샘플 메모로 비교 ----------

function appRows(a) {
  return a.get(`parseMemo(${JSON.stringify(nb.memo)}).sessions.flatMap((s, i) => s.exercises.flatMap(e =>
    e.sets.map((x, j) => ({ session: i + 1, split: s.split, name: e.name, set: j + 1, w: x.w, r: x.r, rpe: e.rpe }))))`);
}

test("노트북 ③ parse_memo와 같은 세트 121개 (회차 · 분할 · 정식 이름 · 무게 · 횟수 · RPE)", () => {
  const rows = appRows(app);
  assert.equal(rows.length, 121);
  assert.deepEqual(rows, nb.rows);
  assert.deepEqual(app.get(`parseMemo(${JSON.stringify(nb.memo)}).skipped`), nb.skipped);
});

test("노트북 ⑤ 회차별 요약 (종목 수 · 총세트 · 총볼륨)", () => {
  const rows = appRows(app);
  const summary = nb.summary.map(s => {
    const mine = rows.filter(r => r.session === s.session);
    return { session: s.session, split: mine[0].split, exercises: new Set(mine.map(r => r.name)).size,
      sets: mine.length, volume: mine.reduce((v, r) => v + r.w * r.r, 0) };
  });
  assert.deepEqual(summary, nb.summary);
});

test("노트북 ⑧ 다음 무게 29개가 앱의 suggestion과 같음 (무게 · 이유 글자까지)", () => {
  const a = loadApp();
  // 메모의 회차를 하루씩 떨어진 끝난 운동으로 넣기 (가져오기 화면과 같은 모양)
  a.run(`parseMemo(${JSON.stringify(nb.memo)}).sessions.forEach((s, i) => {
    const iso = new Date(Date.UTC(2026, 9, 1 + i, 10)).toISOString();
    data.workouts.push({ id: "m" + i, split: s.split, start: iso, end: iso, imported: true, exercises: s.exercises });
  })`);
  for (const p of nb.plans) {
    const got = a.get(`suggestion({ split: ${JSON.stringify(p.split)}, exercises: [] }, ${JSON.stringify(p.name)})`);
    assert.deepEqual(got, { weight: p.next, reason: p.reason }, `${p.split} ${p.name}`);
  }
});
