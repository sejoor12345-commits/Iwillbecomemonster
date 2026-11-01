// 브라우저 연기 시험 (smoke test = "켜서 연기가 안 나는지" 큰 흐름만 한 번 훑기)
//
// [지도]
//   들어오는 것: app/ 폴더 (이 파일이 직접 작은 서버를 띄움), 가짜 Supabase (tests/helpers/fake-supabase.js)
//   하는 일:     아이폰 크기(390×844) Chromium으로 앱을 열어
//                ① 다른 기기에서 고친 식사가 반영되나 (B1)  ② 운동 시작 → 세트 → 끝 → 올라가나
//                ③ 그래프 · 종목 상세에 Infinity/NaN이 없나 (B7)  ④ 식단 화면
//                ⑤ 다른 계정으로 로그인하면 확인 창이 뜨고, 옮긴 기록만 새 계정에 올라가나 (B3)
//                를 확인하고, 화면 에러(pageerror · console.error)가 하나도 없는지 봄
//   나가는 것:   통과하면 "smoke ok", 실패하면 이유와 함께 종료 코드 1
//                SHOTS=폴더 를 주면 그 폴더에 화면 사진(png)을 남김
//
// 실행:  node tests/e2e-smoke.js                         (playwright가 설치된 곳에서. 앱 자체는 npm이 필요 없음)
//        SHOTS=/tmp/shots node tests/e2e-smoke.js
//        SMOKE_OFFLINE=1 … → 글꼴 CDN까지 막음 (CI처럼 인터넷이 불안할 때)
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { createFakeSupabase } = require("./helpers/fake-supabase");

const ROOT = path.join(__dirname, "..");
const APP = path.join(ROOT, "app");
const SHOTS = process.env.SHOTS || "";
const OFFLINE = !!process.env.SMOKE_OFFLINE;
const FAKE_SOURCE = fs.readFileSync(path.join(__dirname, "helpers", "fake-supabase.js"), "utf8")
  + "\nwindow.__fake = createFakeSupabase(window.__fakeOptions || {});\nwindow.supabase = { createClient: () => window.__fake.client };\n";
const TYPES = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png",
  ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };

function serve() {                                   // python3 -m http.server 대신 (CI에 python이 없어도 되게)
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
    const file = path.join(APP, rel);
    if (!file.startsWith(APP) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server)));
}

const A = { id: "u-a", email: "a@example.com" };
const B = { id: "u-b", email: "b@example.com" };
const today = new Date();
const day = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = n => { const d = new Date(today); d.setDate(d.getDate() - n); d.setHours(19, 0, 0, 0); return d; };

function seedWorkout(id, n, split, exercises, synced) {
  const s = daysAgo(n);
  return { id, split, start: s.toISOString(), end: new Date(s.getTime() + 3600000).toISOString(), synced,
    exercises: exercises.map(([name, w, reps], i) => ({ name, rpe: null, draft: { w, r: reps[0] },
      sets: reps.map((r, j) => ({ w, r, t: new Date(s.getTime() + (i * 10 + j + 1) * 120000).toISOString() })) })) };
}
function seedData(extra) {
  return { workouts: [], currentId: null, custom: {}, deleted: [], customDirty: false, body: {}, meals: [], nutrition: null,
    deletedMeals: [], deletedWeights: [], hiddenGraphs: [], hiddenDirty: false, deletedCustoms: [], myFoods: {}, myFoodsDirty: false, ...extra };
}

async function main() {
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const problems = [];
  let shotNo = 0;

  async function newPage(fakeOptions, data) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true,
      hasTouch: true, locale: "ko-KR", serviceWorkers: "block" });
    await ctx.route(/vendor\/supabase-.*\.js/, r => r.fulfill({ contentType: "application/javascript", body: FAKE_SOURCE }));
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => {
      const u = r.request().url();
      const font = /orioncactus\/pretendard|fonts\.(googleapis|gstatic)\.com/.test(u);
      return font && !OFFLINE ? r.continue() : r.abort();        // 글꼴만 통과 (GIF · 진짜 Supabase는 막음)
    });
    await ctx.addInitScript(([opts, seed]) => {
      window.__fakeOptions = opts;
      if (seed && !sessionStorage.getItem("seeded")) {          // 첫 번째로 열 때만 기록을 넣음
        localStorage.setItem("iwbm-data-v1", JSON.stringify(seed));
        sessionStorage.setItem("seeded", "1");
      }
    }, [fakeOptions, data]);
    const page = await ctx.newPage();
    const dialogs = [];
    page.on("pageerror", e => problems.push(`pageerror: ${e.message}`));
    page.on("console", m => { if (m.type() === "error" && !/ERR_FAILED|net::|Failed to load resource|Blocked call to navigator.vibrate/.test(m.text())) problems.push(`console: ${m.text()}`); });
    page.on("dialog", d => { dialogs.push(d.message()); d.accept(); });
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => typeof account !== "undefined" && !account.busy && account.status !== "동기화 중…");
    return { ctx, page, dialogs };
  }
  const shot = async (page, name, fullPage = true) => {
    if (!SHOTS) return;
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, `${String(++shotNo).padStart(2, "0")}-${name}.png`), fullPage });
  };
  const click = async (page, sel) => { await page.click(sel); await page.waitForTimeout(150); };
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

  // ---------- ① ~ ④: A 계정, 다른 기기에서 고친 식사가 있음 ----------
  const meal = { id: "m1", day: day(today), slot: "점심", food: "허닭 도시락", kcal: 420, c: 50, p: 30, f: 10, g: 230, synced: true };
  const remote = { meals: [{ id: "m1", user_id: A.id, day: day(today), slot: "점심", food: "허닭 도시락", kcal: 600, carb: 70, protein: 40, fat: 15, grams: 330 }] };
  const old = [
    seedWorkout("w1", 9, "가슴", [["Bench press", 0, [12, 12]], ["Dips", 0, [12, 10]]], true),   // 첫 기록 0kg (B7)
    seedWorkout("w2", 2, "가슴", [["Bench press", 80, [8, 8, 7]], ["Dips", 0, [13, 11]]], true),
  ];
  const builder = createFakeSupabase({});                         // 이미 올라가 있던 운동 → 인터넷(가짜) 표 3개에도 넣어 둠
  old.forEach(w => builder.state.addWorkout(A.id, w));
  const { workouts, workout_exercises, sets } = builder.state.tables;
  Object.assign(remote, { workouts, workout_exercises, sets });
  const { ctx, page } = await newPage({ session: { user: A }, remote }, seedData({ ownerId: A.id, ownerEmail: A.email, meals: [meal], workouts: old }));
  await shot(page, "home");
  const home = await page.textContent("#app");
  assert.match(home, /v0\.6-d\.1/, "홈 맨 아래 버전");
  assert.match(home, /동기화 완료/, "동기화 완료 표시");
  assert.equal(await page.evaluate(() => data.meals.find(m => m.id === "m1").kcal), 600, "B1: 다른 기기에서 고친 식사");

  await click(page, '[data-action="nutrition"]');
  await shot(page, "nutrition-food");
  assert.match(await page.textContent("#app"), /600/, "식단 화면에 고친 칼로리");

  await click(page, '[data-action="tab-workout"]');
  await click(page, '[data-action="workout-tab"][data-v="graph"]');
  await shot(page, "workout-graph");
  await click(page, '.prow[data-name="Bench press"]');
  await shot(page, "exercise-detail");
  const detail = await page.textContent("#app");
  assert.doesNotMatch(detail, /Infinity|NaN/, "B7: 종목 상세에 Infinity/NaN 없음");

  await click(page, '[data-action="tab-workout"]');
  await click(page, '[data-action="workout-tab"][data-v="log"]');
  await click(page, '[data-action="pick-split"][data-split="가슴"]');
  await click(page, '[data-action="start"]');
  await page.waitForTimeout(1800);                                // 시작 애니메이션
  await click(page, '[data-action="pick"][data-name="Bench press"]');
  await click(page, '[data-action="complete"][data-i="0"]');
  await click(page, '[data-action="complete"][data-i="0"]');
  await shot(page, "workout-sets");
  await click(page, '[data-action="finish"]');
  await page.waitForTimeout(800);
  await page.mouse.click(195, 400);                               // 축하 화면 닫기
  await page.waitForFunction(() => !account.busy);
  await shot(page, "summary");
  const uploaded = await page.evaluate(() => __fake.state.tables.workouts.filter(w => w.user_id === "u-a").length);
  assert.equal(uploaded, 3, "끝낸 운동이 인터넷(가짜)에 올라감");
  assert.equal(await page.evaluate(() => pendingCount()), 0, "올릴 기록 0개");
  await ctx.close();

  // ---------- ⑤ B3: A로 쓰던 폰에 B로 로그인 ----------
  const b = await newPage({ session: { user: B }, remote: { body_weights: [{ user_id: B.id, day: day(daysAgo(3)), weight: 70 }] } },
    seedData({ ownerId: A.id, ownerEmail: A.email,
      workouts: [seedWorkout("wa1", 5, "등", [["Pull up", 0, [10, 9]]], true), seedWorkout("wa2", 1, "등", [["Barbell row", 60, [10]]], false)],
      deletedWeights: [day(daysAgo(3))] }));
  assert.equal(b.dialogs.length, 1, "B3: 확인 창 한 번 (옮기기)");
  assert.match(b.dialogs[0], /a@example\.com 계정으로 쓰던 거예요\. 아직 안 올린 기록이 1개/);
  const after = await b.page.evaluate(() => ({ owner: data.ownerId, ids: data.workouts.map(w => w.id),
    bWorkouts: __fake.state.tables.workouts.filter(w => w.user_id === "u-b").map(w => w.id),
    bWeights: __fake.state.tables.body_weights.filter(r => r.user_id === "u-b").length }));
  assert.deepEqual(after, { owner: B.id, ids: ["wa2-u-b"], bWorkouts: ["wa2-u-b"], bWeights: 1 }, "B3: 안 올린 것만 옮김, B의 체중은 그대로");
  await shot(b.page, "account-switched");
  await b.ctx.close();

  await browser.close();
  server.close();
  if (problems.length) throw new Error("화면 에러:\n" + problems.join("\n"));
  console.log(`smoke ok${SHOTS ? ` — 사진 ${shotNo}장: ${SHOTS}` : ""}`);
}

main().catch(error => { console.error("smoke FAILED:", error.message); process.exit(1); });
