// 주인이 직접 고칠 것 (docs/owner-fixes.md) — 고치기 전에는 "todo"로 표시만 되고 CI를 깨지 않음
//   고치고 나서 node --test를 돌리면(또는 GitHub Actions 결과에서) 이 시험이 ✅로 바뀌는지 확인해 봐.
//   둘 다 통과하면 아래의 { todo: … }를 지워도 돼 (그때부터는 진짜 시험이 됨)
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/load-app");
const { baseData } = require("./helpers/sample");

test("B2: 백업 복원 뒤에도 내 음식(myFoods)이 남아 있음", { todo: "docs/owner-fixes.md 1번" }, () => {
  const app = loadApp();
  const backup = baseData({ myFoods: { "홀리닭 스테이크": { basis: 100, unit: "g", total: 100, kcal: 130, c: 4, p: 24, f: 2 } } });
  app.run(`FileReader = class { readAsText(file) { this.result = file.text; this.onload(); } }`);   // 파일 읽기 흉내
  app.run(`restoreBackup({ text: ${JSON.stringify(JSON.stringify(backup))} })`);
  assert.deepEqual(Object.keys(app.get("data.myFoods")), ["홀리닭 스테이크"]);
  assert.equal(app.get("data.myFoodsDirty"), true);                 // 다시 올리기 표시도
});

test("메모 가져오기 화면의 돌아가기 버튼 글자가 한국어(운동)", { todo: "docs/owner-fixes.md 2번" }, () => {
  const app = loadApp();
  app.run(`ui.screen = "import"; render()`);
  assert.match(app.html(), /data-action="workouts">운동<\/button>/);
});
