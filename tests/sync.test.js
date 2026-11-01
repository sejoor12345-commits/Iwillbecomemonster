// 동기화 (sync.js · nutrition.js의 syncNutrition) — 가짜 Supabase로 B1 · B3 · B4가 다시 안 생기는지
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, createFakeSupabase } = require("./helpers/load-app");
const { workout, baseData } = require("./helpers/sample");

const A = { id: "u-a", email: "a@example.com" };
const B = { id: "u-b", email: "b@example.com" };
const meal = (id, kcal, extra = {}) => ({ id, day: "2026-10-30", slot: "점심", food: "허닭 도시락", kcal, c: 50, p: 30, f: 10, g: 230, synced: true, ...extra });
const remoteMeal = (user, id, kcal, grams = 330) => ({ id, user_id: user.id, day: "2026-10-30", slot: "점심", food: "허닭 도시락",
  kcal, carb: 70, protein: 40, fat: 15, grams });

async function open(data, fakeOptions, confirm) {
  const fake = createFakeSupabase(fakeOptions);
  const app = loadApp({ data, fake, confirm });
  await app.settle();                                               // 앱을 열면 바로 하는 동기화가 끝날 때까지
  return { app, fake, remote: fake.state.tables };
}

// ---------- B1: 다른 기기에서 고친 것 반영 ----------

test("B1 식사: 올라가 있던 식사는 인터넷 값으로 (다른 기기에서 g · 칼로리를 고침)", async () => {
  const { app } = await open(baseData({ ownerId: A.id, meals: [meal("m1", 420)] }),
    { session: { user: A }, remote: { meals: [remoteMeal(A, "m1", 600)] } });
  const m1 = app.get(`data.meals.find(m => m.id === "m1")`);
  assert.deepEqual([m1.kcal, m1.g, m1.c, m1.synced], [600, 330, 70, true]);
  assert.match(app.get("account.status"), /동기화 완료/);
});

test("B1 식사: 폰에서 고치고 안 올린 것은 폰 것이 이기고 인터넷에 올라감", async () => {
  const { app, remote } = await open(baseData({ ownerId: A.id, meals: [meal("m1", 500, { synced: false }), meal("m2", 300, { synced: false })] }),
    { session: { user: A }, remote: { meals: [remoteMeal(A, "m1", 600)] } });
  assert.equal(app.get(`data.meals.find(m => m.id === "m1").kcal`), 500);
  assert.equal(remote.meals.find(m => m.id === "m1").kcal, 500);
  assert.deepEqual(app.get("data.meals.map(m => [m.id, m.synced])"), [["m1", true], ["m2", true]]);   // 방금 올린 m2도 안 지워짐
});

test("B1 운동: 올라가 있던 운동은 인터넷 내용으로, 안 올린 것 · 진행 중인 것은 그대로", async () => {
  const fake = createFakeSupabase({ session: { user: A } });
  fake.state.addWorkout(A.id, workout("w1", "가슴", "2026-10-20", [["Bench press", 85, [8, 8]]]));   // 다른 기기에서 85kg로 고침
  fake.state.addWorkout(A.id, workout("w2", "등", "2026-10-21", [["Barbell row", 60, [10]]]));
  const local = [
    workout("w1", "가슴", "2026-10-20", [["Bench press", 80, [8, 8]]], { synced: true, imported: true, estimated: true }),
    workout("w2", "등", "2026-10-21", [["Barbell row", 70, [10]]], { synced: false }),   // 폰에서 고치고 아직 안 올림
    { ...workout("w3", "어깨", "2026-10-31", [["Overhead press", 40, [8]]]), end: null },
  ];
  const app = loadApp({ data: baseData({ ownerId: A.id, workouts: local, currentId: "w3" }), fake });
  await app.settle();
  const w = id => app.get(`data.workouts.find(w => w.id === "${id}")`);
  assert.deepEqual(w("w1").exercises[0].sets.map(s => s.w), [85, 85]);
  assert.equal(w("w1").imported, true);                                      // 메모에서 가져온 표시는 남김
  assert.equal(w("w2").exercises[0].sets[0].w, 70);
  assert.equal(fake.state.tables.sets.find(s => s.weight === 70) !== undefined, true);   // 폰 것이 올라감
  assert.equal(w("w3").end, null);
  assert.match(app.get("account.status"), /다른 기기에서 고친 기록 1개 반영/);
});

test("B1 운동: 내용이 같으면 시각 글자 모양이 달라도(+00:00 vs Z) 안 바꿈", async () => {
  const w1 = workout("w1", "가슴", "2026-10-20", [["Bench press", 80, [8, 8]]], { synced: true });
  const fake = createFakeSupabase({ session: { user: A } });
  fake.state.addWorkout(A.id, w1);
  for (const s of fake.state.tables.sets) s.done_at = s.done_at.replace(".000Z", "+00:00");
  fake.state.tables.workouts[0].started_at = w1.start.replace(".000Z", "+00:00");
  const app = loadApp({ data: baseData({ ownerId: A.id, workouts: [w1] }), fake });
  await app.settle();
  assert.doesNotMatch(app.get("account.status"), /고친 기록/);
  assert.equal(app.get("data.workouts[0].start"), w1.start);
});

test("B1: 올리는 동안 같은 식사 · 체중을 또 고치면 새 값이 남고 다음 동기화 때 올라감 (인터넷 옛 값이 안 덮음)", async () => {
  let app, hit = false;
  const fake = createFakeSupabase({ session: { user: A }, failOn: q => {      // 식사를 올리는 바로 그 순간에 폰에서 또 고침
    if (hit || q.table !== "meals" || q.op !== "upsert") return;
    hit = true;
    app.run(`Object.assign(data.meals[0], { kcal: 999, synced: false }); data.body["2026-10-30"] = { w: 81.5, synced: false }; save()`);
  } });
  app = loadApp({ data: baseData({ ownerId: A.id, meals: [meal("m1", 700, { synced: false })],
    body: { "2026-10-30": { w: 82, synced: false } } }), fake });
  await app.settle();
  assert.deepEqual(app.get(`[data.meals[0].kcal, data.meals[0].synced, data.body["2026-10-30"].w, data.body["2026-10-30"].synced]`),
    [999, false, 81.5, false]);                                              // 고친 것은 "아직 안 올림"
  await app.run("syncNow()");
  await app.settle();
  assert.deepEqual(app.get(`[data.meals[0].kcal, data.body["2026-10-30"].w]`), [999, 81.5]);   // 예전엔 700 · 82로 돌아갔음
  assert.deepEqual([fake.state.tables.meals[0].kcal, fake.state.tables.body_weights[0].weight], [999, 81.5]);
});

// ---------- B4: 1000줄이 넘어도 다 받기 ----------

test("B4: 운동 1200개 · 식사 1500개 — 1000줄씩 나눠 다 받고, 1000번째 뒤 운동을 지우지 않음", async () => {
  const fake = createFakeSupabase({ session: { user: A } });
  const local = [];
  for (let i = 0; i < 1200; i++) {
    const w = workout("w" + String(i).padStart(4, "0"), "가슴", "2026-01-01", [["Bench press", 80, [8]]], { synced: true });
    fake.state.addWorkout(A.id, w);
    local.push(w);
  }
  for (let i = 0; i < 1500; i++) fake.state.tables.meals.push(remoteMeal(A, "m" + String(i).padStart(4, "0"), 100));
  const app = loadApp({ data: baseData({ ownerId: A.id, workouts: local }), fake });
  await app.settle();
  assert.equal(app.get("data.workouts.length"), 1200);
  assert.equal(app.get("data.meals.length"), 1500);
  const ranges = table => fake.state.calls.filter(c => c.table === table && c.op === "select").map(c => c.range);
  assert.deepEqual(ranges("workouts"), [[0, 999], [1000, 1999]]);
  assert.deepEqual(ranges("meals"), [[0, 999], [1000, 1999]]);
  assert.ok(fake.state.calls.filter(c => c.table === "workouts" && c.op === "select").every(c => c.order === "id"));
  assert.doesNotMatch(app.get("account.status"), /지운 기록/);
});

// ---------- B3: 다른 계정으로 로그인 ----------

function accountAData() {
  return baseData({
    ownerId: A.id, ownerEmail: A.email,
    // 안 올린 것 3개: 운동 wa2 · 체중 10/02 · 식사 ma2
    workouts: [workout("wa1", "가슴", "2026-10-01", [["Bench press", 80, [8]]], { synced: true }),   // A 인터넷에 있음
      workout("wa2", "등", "2026-10-02", [["Pull up", 0, [10]]], { synced: false })],              // 아직 안 올림
    body: { "2026-10-01": { w: 84, synced: true }, "2026-10-02": { w: 83.8, synced: false } },
    meals: [meal("ma1", 500), meal("ma2", 450, { synced: false })],
    deletedWeights: ["2026-10-10"], deleted: ["wa0"],
  });
}
function accountsRemote() {
  const fake = createFakeSupabase({ session: { user: B } });
  fake.state.addWorkout(A.id, workout("wa1", "가슴", "2026-10-01", [["Bench press", 80, [8]]]));
  fake.state.tables.body_weights.push({ user_id: A.id, day: "2026-10-01", weight: 84 },
    { user_id: B.id, day: "2026-10-10", weight: 70 });                       // B의 체중 (A의 "지울 목록"과 같은 날)
  fake.state.tables.meals.push(remoteMeal(A, "ma1", 500));
  fake.state.addWorkout(B.id, workout("wb1", "하체", "2026-10-05", [["Squat", 60, [10]]]));
  return fake;
}

test("B3: 처음(주인 없음) 동기화하면 지금 계정이 주인 — 묻지 않음", async () => {
  const { app } = await open(baseData({ meals: [meal("m1", 400, { synced: false })] }), { session: { user: A } });
  assert.deepEqual(app.get("[data.ownerId, data.ownerEmail]"), [A.id, A.email]);
  assert.equal(app.dialogs.length, 0);
});

test("B3: [확인] 옮기기 → 안 올린 것만 B로 올라가고, A의 올라가 있던 기록 · B의 체중은 안전", async () => {
  const fake = accountsRemote();
  const app = loadApp({ data: accountAData(), fake, confirm: () => true });
  await app.settle();
  assert.equal(app.dialogs.length, 1);
  assert.match(app.dialogs[0].msg, /a@example\.com 계정으로 쓰던 거예요\. 아직 안 올린 기록이 3개/);
  const t = fake.state.tables;
  const ids = (rows, user) => rows.filter(r => r.user_id === user.id).map(r => r.id || r.day).sort();
  assert.deepEqual(ids(t.workouts, B), ["wa2-u-b", "wb1"]);                  // 안 올린 운동만 B로 (이름표는 새로)
  assert.deepEqual(ids(t.meals, B), ["ma2-u-b"]);
  assert.deepEqual(ids(t.body_weights, B), ["2026-10-02", "2026-10-10"]);   // B의 10/10 체중이 안 지워짐
  assert.deepEqual(ids(t.workouts, A), ["wa1"]);                             // A 것은 그대로
  assert.deepEqual(app.get("data.workouts.map(w => w.id).sort()"), ["wa2-u-b", "wb1"]);
  assert.deepEqual(app.get("[data.ownerId, data.deleted, data.deletedWeights]"), [B.id, [], []]);
  assert.match(app.get("account.status"), /동기화 완료/);
});

test("B3: [확인] 옮기기 — A에 올렸다가 폰에서 고친 식사 · 진행 중인 운동도 새 이름표로 B에 올라감 (RLS 에러로 멈추지 않음)", async () => {
  const fake = createFakeSupabase({ session: { user: B } });
  fake.state.tables.meals.push(remoteMeal(A, "ma1", 500));                   // A 인터넷에 있는 식사를
  const data = baseData({ ownerId: A.id, ownerEmail: A.email, currentId: "wa3",
    meals: [meal("ma1", 600, { synced: false })],                           //   폰에서 고치고 아직 안 올림
    workouts: [{ ...workout("wa3", "등", "2026-10-31", [["Pull up", 0, [10]]]), end: null }] });
  const app = loadApp({ data, fake, confirm: () => true });
  await app.settle();
  assert.match(app.get("account.status"), /동기화 완료/);
  assert.deepEqual(fake.state.tables.meals.map(m => [m.id, m.user_id, m.kcal]), [["ma1", A.id, 500], ["ma1-u-b", B.id, 600]]);
  assert.deepEqual(app.get("[data.meals.map(m => [m.id, m.synced]), data.currentId, data.workouts[0].id]"),
    [[["ma1-u-b", true]], "wa3-u-b", "wa3-u-b"]);                             // 진행 중인 운동은 이어서 할 수 있음
});

test("B3: [취소] → [확인] 비우기 → B 기록만 받고, 아무것도 B로 안 올라감", async () => {
  const fake = accountsRemote();
  const app = loadApp({ data: accountAData(), fake, confirm: (msg, n) => n === 2 });
  await app.settle();
  assert.equal(app.dialogs.length, 2);
  assert.match(app.dialogs[1].msg, /안 올린 기록 3개는 사라져요/);
  assert.deepEqual(app.get("data.workouts.map(w => w.id)"), ["wb1"]);
  assert.deepEqual(app.get("data.meals"), []);
  assert.equal(fake.state.calls.filter(c => c.user === B.id && ["upsert", "insert", "delete"].includes(c.op)).length, 0);
  assert.equal(app.get("data.ownerId"), B.id);
});

test("B3: [취소] → [취소] → 로그아웃, 폰 기록 · 인터넷 둘 다 그대로", async () => {
  const fake = accountsRemote();
  const before = accountAData();
  const app = loadApp({ data: before, fake, confirm: () => false });
  await app.settle();
  assert.equal(app.get("account.user"), null);
  assert.equal(fake.state.session, null);
  assert.equal(fake.state.calls.length, 0);                                  // 표를 한 번도 안 건드림
  const saved = app.saved();
  assert.deepEqual([saved.ownerId, saved.workouts.length, saved.meals.length, saved.deletedWeights], [A.id, 2, 2, ["2026-10-10"]]);
});

test("B3: 안 올린 것이 없으면 한 번만 묻고, 같은 계정이면 안 물음", async () => {
  const data = baseData({ ownerId: A.id, ownerEmail: A.email, workouts: [workout("wa1", "가슴", "2026-10-01", [["Bench press", 80, [8]]], { synced: true })] });
  let r = await open(data, { session: { user: B } }, () => true);
  assert.equal(r.app.dialogs.length, 1);
  assert.match(r.app.dialogs[0].msg, /비우고 b@example\.com 기록만 받을까요/);
  r = await open(data, { session: { user: A } });
  assert.equal(r.app.dialogs.length, 0);
});
