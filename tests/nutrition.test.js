// 유지 칼로리 · 추천 섭취 (nutrition.js slope · maintenanceInfo · targetKcal) — weight_log.ipynb ④ · ⑤
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/load-app");
const { baseData } = require("./helpers/sample");
const nb = require("./fixtures/notebook-sample.json");

const settings = extra => ({ ratio: [50, 30, 20], kgPerWeek: -0.5, dayRatios: {}, dirty: false, profile: null,
  manualMaintenance: null, dayStatus: {}, ...extra });

function withDays(days, nutrition = settings()) {
  const body = {}, meals = [];
  for (const d of days) {
    body[d.day] = { w: d.w, synced: true };
    if (d.kcal != null) meals.push({ id: "f" + d.day, day: d.day, slot: "점심", food: "밥", kcal: d.kcal, c: 0, p: 0, f: 0, synced: true });
  }
  return loadApp({ data: baseData({ body, meals, nutrition }) });
}

test("slope: np.polyfit(x, y, 1)[0]과 같은 기울기, 점이 하나면 0", () => {
  const app = loadApp();
  assert.equal(app.get("slope([0, 1, 2, 3], [84, 83.9, 83.8, 83.7])").toFixed(6), "-0.100000");
  assert.equal(app.get("slope([5], [80])"), 0);
});

test("maintenanceInfo: 노트북 ④와 같은 유지 칼로리 · 노트북 ⑤와 같은 추천 섭취 (14일 샘플)", () => {
  const app = withDays(nb.weight.days);
  const today = nb.weight.days[nb.weight.days.length - 1].day;   // 마지막 날 = 오늘 (그날 칼로리는 없음 → 노트북과 같은 조건)
  const info = app.get(`maintenanceInfo(${JSON.stringify(today)})`);
  assert.equal(info.fromRecords, true);
  assert.equal(info.weightDays, 14);
  assert.equal(info.kcalDays, 13);
  assert.ok(Math.abs(info.maintenance - nb.weight.maintenance) < 1e-6, `${info.maintenance} vs ${nb.weight.maintenance}`);
  assert.ok(Math.abs(info.perWeek - nb.weight.slope * 7) < 1e-9);
  assert.equal(app.get(`targetKcal(${info.maintenance})`), nb.weight.target_kcal);
});

test("maintenanceInfo: 기록이 모자라면 처음 추정 (직접 입력 > 공식 > 기본값)", () => {
  const few = nb.weight.days.slice(0, 5);
  const today = few[few.length - 1].day;
  let app = withDays(few);
  assert.deepEqual(app.get(`maintenanceInfo("${today}")`).base, { value: 2500, source: "default" });
  app = withDays(few, settings({ manualMaintenance: 2600 }));
  assert.equal(app.get(`maintenanceInfo("${today}").maintenance`), 2600);
  app = withDays(few, settings({ profile: { sex: "남", birthYear: 2003, height: 178, activity: 2 } }));
  const b = app.get(`baseMaintenance("${today}")`);
  assert.equal(b.source, "formula");
  // Mifflin-St Jeor: 10×체중 + 6.25×키 − 5×나이 + 5, × 1.55, 10kcal 단위
  const w = few.map(d => d.w).reduce((a, x) => a + x, 0) / few.length;
  assert.equal(b.value, Math.round((10 * w + 6.25 * 178 - 5 * 23 + 5) * 1.55 / 10) * 10);
});

test("maintenanceInfo: 덜 적은 날(추천의 60% 미만)은 빼고, 직접 표시가 이김", () => {
  const days = nb.weight.days.map((d, i) => (i === 2 ? { ...d, kcal: 700 } : d));
  const today = days[days.length - 1].day;
  let app = withDays(days);
  assert.equal(app.get(`maintenanceInfo("${today}").kcalDays`), 12);
  app = withDays(days, settings({ dayStatus: { [days[2].day]: true } }));
  assert.equal(app.get(`maintenanceInfo("${today}").kcalDays`), 13);
});

test("B11 기록: 처음 유지 칼로리 기본값은 노트북 2750 · 앱 2500 (일부러 다름 — docs/v0.6-decisions.md)", () => {
  const app = loadApp();
  assert.equal(nb.weight.initial_maintenance, 2750);
  assert.equal(app.get("INITIAL_MAINTENANCE"), 2500);
});

test("B8: 추천 섭취가 0이나 음수로 안 내려감 (남 1500 · 여 1200)", () => {
  let app = loadApp({ data: baseData({ nutrition: settings({ kgPerWeek: -1, manualMaintenance: 1000 }) }) });
  assert.equal(app.get("rawTargetKcal(1000)"), -100);              // 예전에는 이게 추천으로 나왔음
  assert.equal(app.get("targetKcal(1000)"), 1500);
  assert.equal(app.get("targetKcal(2750)"), 1650);                // 바닥보다 높으면 그대로
  app.run(`ui.screen = "nutrition"; render()`);
  assert.match(app.html(), /너무 낮아서 1,500kcal로 맞췄어요/);
  assert.match(app.html(), /\/ 1,500 kcal/);                      // 추천 칸
  assert.doesNotMatch(app.html(), /NaN|Infinity|width:-/);
  app = loadApp({ data: baseData({ nutrition: settings({ kgPerWeek: -1, manualMaintenance: 1000,
    profile: { sex: "여", birthYear: 2000, height: 160, activity: 1 } }) }) });
  assert.equal(app.get("targetKcal(1000)"), 1200);
});
