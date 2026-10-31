// 앱 파일(app/*.js)을 브라우저 없이 node 안에서 여는 도우미
//
// [지도]
//   들어오는 것: loadApp({ data, fake, confirm })
//                data    = localStorage["iwbm-data-v1"]에 미리 넣어 둘 기록 (없으면 처음 연 앱)
//                fake    = createFakeSupabase(...)의 결과 (없으면 로그인 안 한 가짜)
//                confirm = 확인 창이 뜨면 대신 누를 답 (메시지 → true/false)
//   하는 일:     vm(따로 떨어진 작은 JS 세상)에 가짜 document · localStorage · navigator를 만들고
//                index.html과 같은 순서로 app/*.js를 실행 → 앱의 전역 이름(data, syncNow …)을 그대로 쓸 수 있음
//   나가는 것:   { run(코드), get(코드), settle(), html(), dialogs, storage, fake }
//                get = JSON으로 한 번 바꿔서 돌려줌 (vm 안 배열은 assert.deepStrictEqual이 "다른 세상 것"으로 봐서)
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const { createFakeSupabase } = require("./fake-supabase");

const APP = path.join(__dirname, "..", "..", "app");
// index.html의 <script> 순서 그대로 (vendor/supabase 자리에는 가짜를 넣음)
const SCRIPTS = ["exercises.js", "exercise-media.js", "effects.js", "app.js", "nutrition.js", "progress.js",
  "exercise-detail.js", "<supabase>", "sync.js", "import.js"];

function fakeElement(id) {
  const el = {
    id: id || "", innerHTML: "", textContent: "", value: "", hidden: false, offsetWidth: 0, style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, removeAttribute() {}, addEventListener() {}, append() {}, appendChild() {}, remove() {}, focus() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null, setSelectionRange() {},
  };
  return el;
}

function loadApp(options = {}) {
  const store = new Map();
  if (options.data) store.set("iwbm-data-v1", JSON.stringify(options.data));
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  };
  const elements = { app: fakeElement("app") };
  const listeners = {};
  const body = fakeElement("body");
  body.append = el => { if (el.id) elements[el.id] = el; };
  const document = {
    body,
    getElementById: id => elements[id] || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => fakeElement(),
    addEventListener: (type, fn) => (listeners[type] = listeners[type] || []).push(fn),
  };
  const dialogs = [];
  const answer = options.confirm || (() => true);
  const fake = options.fake || createFakeSupabase({});
  const sandbox = {
    console, URL, Blob: class {}, FileReader: class {},
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (t.unref) t.unref(); return t; },
    clearTimeout, setInterval: () => 0, clearInterval() {},
    localStorage, document,
    navigator: { onLine: options.online !== false },
    location: { reload() {} },
    confirm: msg => { dialogs.push({ type: "confirm", msg }); return answer(msg, dialogs.length); },
    alert: msg => { dialogs.push({ type: "alert", msg }); },
    prompt: msg => { dialogs.push({ type: "prompt", msg }); return null; },
    addEventListener() {},
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  for (const file of SCRIPTS) {
    if (file === "<supabase>") { sandbox.supabase = { createClient: () => fake.client }; continue; }
    vm.runInContext(fs.readFileSync(path.join(APP, file), "utf8"), sandbox, { filename: "app/" + file });
  }
  const run = code => vm.runInContext(code, sandbox);
  return {
    sandbox, fake, dialogs, storage: store, listeners,
    run,
    get: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, sandbox) ?? "null"),
    html: () => elements.app.innerHTML,
    saved: () => JSON.parse(store.get("iwbm-data-v1")),
    // 약속(Promise)으로 이어지는 일(동기화 등)이 다 끝날 때까지 기다리기. 가짜 Supabase는 타이머를 안 써서 한 번이면 충분
    settle: () => new Promise(resolve => setImmediate(resolve)),
  };
}

module.exports = { loadApp, createFakeSupabase };
