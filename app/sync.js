// I will become monster — v0.4-c 로그인 · 동기화 (Supabase)
//
// [지도]
//   들어오는 것: 이메일 · 비밀번호, 폰에 저장된 data (app.js)
//   하는 일:     [올리기] 아직 안 올린 운동을 표 3개(workouts · workout_exercises · sets)로 나눠 올리기,
//                         지운 운동은 인터넷에서도 지우기, 내가 만든 종목(my_exercises) 올리기
//                [받기]   인터넷에만 있는 운동(다른 기기에서 한 것)을 표 3개에서 모아 폰으로 가져오기,
//                         이미 올라가 있던 운동은 인터넷 쪽 내용으로 맞추기 (다른 기기에서 고친 것, v0.6-d)
//   나가는 것:   홈 화면의 계정 칸 (로그인 상태 · 올릴 기록 수 · 동기화 결과)
//
// 원칙: 기록은 항상 폰에 먼저 저장된다(app.js). 여기는 인터넷이 될 때 "올리기"만 담당.
//      로그인을 안 해도 앱은 그대로 쓸 수 있다.

const SUPABASE_URL = "https://nkchwtsjjskiwgakemag.supabase.co";
const SUPABASE_KEY = "sb_publishable_hotPI28wDcC2qIEQ-YJxXw_xO9D08uQ";   // 공개용 키. 남의 기록은 RLS("내 기록은 나만")가 막아 줌
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const PAGE_ROWS = 1000;              // Supabase가 한 번에 주는 최대 줄 수 (서버 설정 max rows와 같게)
let syncUserId = null;               // 지금 동기화하는 계정 (중간에 로그아웃되면 받기를 멈추려고, v0.6-d)

const account = {
  user: null,        // 로그인한 사람 (없으면 null)
  status: "",        // 홈에 보여 줄 한 줄 (예: "동기화 완료 19:32")
  busy: false,       // 지금 동기화 중인가
  message: "",       // 로그인 화면의 안내 · 에러
};


// ---------- 0. 도우미: 표 하나를 끝까지 다 받기 ----------

// Supabase는 한 번에 1000줄까지만 줘서, 기록이 1000개를 넘으면 뒤쪽이 안 옴 → 1000줄씩 나눠서 다 받기
//   order = 줄 세우는 칸 (나눠 받는 동안 순서가 섞여서 빠지거나 겹치지 않게)
//   운동 받기(아래 2-1)와 체중 · 식사 받기(nutrition.js)가 같이 씀 (v0.6-d)
//   Python으로 치면: while True: page = 표[from:from+1000]; rows += page; if len(page) < 1000: break
async function selectAll(table, columns, order) {
  const rows = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    let query = db.from(table).select(columns);
    if (order) query = query.order(order);
    const { data: page, error } = await query.range(from, from + PAGE_ROWS - 1);
    if (error) throw error;
    // 받는 동안 로그아웃되면(세션이 사라지면) 그 뒤 요청은 에러 없이 "0줄"로 옴 → 그대로 쓰면 폰 기록이 "다른 기기에서 지운 것"으로 지워짐
    if (syncUserId && (!account.user || account.user.id !== syncUserId)) throw new Error("로그인이 바뀌어서 동기화를 멈췄어요");
    rows.push(...page);
    if (page.length < PAGE_ROWS) return rows;
  }
}


// ---------- 1. 로그인 상태 ----------

async function initAccount() {
  const { data: { session } } = await db.auth.getSession();      // 폰에 남아 있는 로그인 (껐다 켜도 유지)
  account.user = session ? session.user : null;
  db.auth.onAuthStateChange((_event, session) => {                // 로그인 · 로그아웃될 때마다
    account.user = session ? session.user : null;
    refreshIfSafe();
  });
  window.addEventListener("online", () => syncNow());             // 인터넷이 다시 연결되면 올리기
  render();
  syncNow();
}

// 동기화 결과를 화면에 반영. 글을 적는 중인 칸(식사 추가 · 비율 바꾸기)이 열려 있으면 지워지지 않게 그리지 않음
function refreshIfSafe() {
  if (["home", "workouts"].includes(ui.screen)) render();
  if (ui.screen === "nutrition" && !ui.mealForm && !ui.ratioPanel && !ui.editMeal) render();
}

async function signIn(email, password) {
  account.message = "로그인 중…"; render();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) { account.message = authError(error); render(); return; }
  account.message = "";
  ui.screen = "home";
  render();
  syncNow();                                                      // 로그인 전 기록도 바로 올리기
}

async function signUp(email, password) {
  account.message = "가입 중…"; render();
  const { data: result, error } = await db.auth.signUp({ email, password });
  if (error) { account.message = authError(error); render(); return; }
  if (result.session) {                                           // 메일 확인 없이 바로 로그인된 경우
    account.message = ""; ui.screen = "home"; render(); syncNow();
  } else {
    account.message = "확인 메일을 보냈어요. 메일의 링크를 누른 다음, 여기로 돌아와서 로그인하세요.";
    render();
  }
}

async function signOut() {
  if (account.busy) return alert("동기화 중이에요. 끝나면 다시 눌러 주세요.");   // 중간에 끊으면 받기가 빈 결과로 와서 위험 (selectAll)
  if (!confirm("로그아웃할까요? 폰에 있는 기록은 그대로 남아요.")) return;
  await db.auth.signOut();
  account.status = "";
  render();
}

function authError(error) {                                       // 자주 나오는 에러를 한국어로
  const m = error.message || String(error);
  if (/Invalid login credentials/i.test(m)) return "이메일이나 비밀번호가 맞지 않아요.";
  if (/Email not confirmed/i.test(m)) return "아직 메일 확인을 안 했어요. 받은 메일의 링크를 먼저 눌러 주세요.";
  if (/already registered/i.test(m)) return "이미 가입된 이메일이에요. 로그인을 눌러 주세요.";
  if (/at least 6 characters/i.test(m)) return "비밀번호는 6자 이상이어야 해요.";
  if (/fetch/i.test(m)) return "인터넷에 연결되지 않았어요.";
  return m;
}


// ---------- 1-1. 이 폰의 기록은 누구 것? (v0.6-d) ----------
//   data.ownerId = 이 폰 기록의 주인 계정. 처음 동기화할 때 그 계정으로 정해짐 (그 전 버전 기록도 이때 정해짐)
//   다른 계정으로 로그인하면: 앞 계정의 기록을 새 계정에 올리거나 폰에서 지우기 전에 꼭 물어봄
//     [확인] 아직 안 올린 기록만 새 계정으로 옮기기 (올라가 있던 기록은 앞 계정 인터넷에 그대로 있으니 폰에서만 비움)
//     [취소] → 한 번 더: 폰을 비우고 새 계정 기록만 받기 / 아무것도 안 하고 로그아웃 (먼저 백업 받기)
//   물어보지 않으면 생기던 일: 앞 계정의 안 올린 기록이 새 계정으로 올라가고, 올라가 있던 기록은 "다른 기기에서 지운 것"으로 보여 폰에서 지워짐

function unsyncedCount() {                                        // 아직 안 올린 기록 수 (진행 중인 운동 포함)
  return data.workouts.filter(w => !w.synced).length
    + Object.values(data.body).filter(b => !b.synced).length + data.meals.filter(m => !m.synced).length
    + (data.myFoodsDirty ? 1 : 0) + (data.nutrition && data.nutrition.dirty ? 1 : 0);
}

function keepOnlyUnsynced(newOwner) {                             // 옮기기: 안 올린 것만 남김
  data.workouts = data.workouts.filter(w => !w.synced);
  for (const d of Object.keys(data.body)) if (data.body[d].synced) delete data.body[d];
  data.meals = data.meals.filter(m => !m.synced);
  const used = new Set(data.workouts.flatMap(w => w.exercises.map(e => e.name)));   // 남은 운동이 쓰는 내 종목만
  data.custom = Object.fromEntries(Object.entries(data.custom).filter(([name]) => used.has(name)));
  data.customDirty = Object.keys(data.custom).length > 0;
  if (!data.myFoodsDirty) data.myFoods = {};
  if (data.nutrition && !data.nutrition.dirty) data.nutrition = null;
  if (!data.hiddenDirty) data.hiddenGraphs = [];
  // 지울 목록은 앞 계정 것 → 버림 (특히 체중은 날짜로 지워서, 남겨 두면 새 계정의 같은 날 체중이 지워짐)
  Object.assign(data, { deleted: [], deletedMeals: [], deletedWeights: [], deletedCustoms: [] });
  if (data.currentId && !data.workouts.some(w => w.id === data.currentId)) data.currentId = null;
  // 옮기는 운동 · 식사는 이름표(id)를 새로 붙임: 앞 계정에 한 번 올렸다가 폰에서 고친 기록은 그 id가 앞 계정 인터넷에 있어서
  //   새 계정으로 올리면 RLS 에러 → 동기화가 매번 실패했음 (id는 계정 구분 없는 전체 이름표). 예: "m5x2k" → "m5x2k-u-b1c2d3"
  const tag = "-" + newOwner.id.slice(0, 8);
  if (data.currentId) data.currentId += tag;
  for (const w of data.workouts) w.id += tag;
  for (const m of data.meals) m.id += tag;
}

function clearLocal() {                                           // 비우기: 처음 연 앱처럼
  data = { workouts: [], currentId: null, custom: {}, ...EMPTY_EXTRAS() };
  if (ui.screen === "workout" || ui.screen === "summary") ui.screen = "home";
}

async function checkOwner() {                                     // true = 동기화 계속, false = 멈춤
  const me = account.user;
  if (!data.ownerId || data.ownerId === me.id) {                  // 처음이거나 같은 계정 → 그대로
    if (data.ownerId !== me.id || data.ownerEmail !== me.email) { data.ownerId = me.id; data.ownerEmail = me.email; save(); }
    return true;
  }
  const before = data.ownerEmail || "다른 계정";
  const n = unsyncedCount();
  if (n && confirm(`이 폰의 기록은 ${before} 계정으로 쓰던 거예요. 아직 안 올린 기록이 ${n}개 있어요.\n\n`
      + `[확인] 안 올린 기록 ${n}개를 지금 계정(${me.email})으로 옮기기\n[취소] 옮기지 않기 (다음 질문으로)`)) {
    keepOnlyUnsynced(me);
  } else if (confirm(`${n ? `안 올린 기록 ${n}개는 사라져요. ` : ""}이 폰에서 ${before} 계정의 기록을 비우고 ${me.email} 기록만 받을까요?\n`
      + `(올라가 있던 기록은 ${before} 계정에 그대로 있어요)\n\n[취소] 아무것도 안 하고 로그아웃 — 먼저 백업을 받고 싶을 때`)) {
    clearLocal();
  } else {
    await db.auth.signOut();
    account.user = null;
    account.status = "";
    return false;
  }
  Object.assign(data, { ownerId: me.id, ownerEmail: me.email });
  save();
  if (typeof toast === "function") toast(`${me.email} 계정으로 바꿨어요`);
  return true;
}


// ---------- 2. 올리기 ----------

function pendingCount() {                                         // 아직 안 올린 것 개수
  return finishedWorkouts().filter(w => !w.synced).length + data.deleted.length
    + (typeof nutritionPending === "function" ? nutritionPending() : 0)    // 체중 · 식사 (nutrition.js)
    + (data.hiddenDirty ? 1 : 0);                                         // 숨긴 그래프 목록 (progress.js)
}

// 운동 한 번 → 표 3개.  같은 운동을 다시 올려도 결과가 같다 (중간에 끊겨도 다음에 다시 하면 됨)
async function uploadWorkout(w) {
  // [1] workouts에 한 줄 (이미 있으면 덮어쓰기 = upsert)
  let result = await db.from("workouts").upsert({
    id: w.id, split: w.split, started_at: w.start, ended_at: w.end, updated_at: new Date().toISOString(),
  });
  if (result.error) throw result.error;

  // [2] 이 운동의 예전 종목 지우기 (세트도 같이 지워짐 — 표를 만들 때 on delete cascade)
  result = await db.from("workout_exercises").delete().eq("workout_id", w.id);
  if (result.error) throw result.error;
  if (!w.exercises.length) return;

  // [3] 종목 넣기 → 데이터베이스가 붙여 준 새 id를 받아 옴
  result = await db.from("workout_exercises")
    .insert(w.exercises.map((e, i) => ({ workout_id: w.id, position: i + 1, name: e.name, rpe: e.rpe, note: e.note || null, superset: !!e.ss })))
    .select("id, position");
  if (result.error) throw result.error;
  const idOf = {};                                                // position → 새 id   예: {1: 57, 2: 58}
  for (const row of result.data) idOf[row.position] = row.id;

  // [4] 세트 넣기 (한 줄 = 한 세트)
  const sets = w.exercises.flatMap((e, i) => e.sets.map((s, j) => ({
    workout_exercise_id: idOf[i + 1], set_no: j + 1, weight: s.w, reps: s.r, done_at: s.t || null,
  })));
  if (sets.length) {
    result = await db.from("sets").insert(sets);
    if (result.error) throw result.error;
  }
}

// ---------- 2-1. 받기 (v0.4-c-2) ----------

// 표 3개 → 앱의 모양 (운동 → 종목들 → 세트들)
//   workouts 한 줄 + 그 운동의 workout_exercises 줄들 + 각 종목의 sets 줄들  →  { id, split, start, end, exercises: [...] }
function toLocalWorkout(row) {
  let renamed = false;
  const exercises = [...row.workout_exercises]
    .sort((a, b) => a.position - b.position)                      // 그날 한 순서대로
    .map(e => {
      const sets = [...e.sets]
        .sort((a, b) => a.set_no - b.set_no)                      // 1세트, 2세트 … 순서대로
        .map(s => ({ w: Number(s.weight), r: s.reps, t: s.done_at }));
      const last = sets[sets.length - 1] || { w: 0, r: 0 };
      const name = dictionaryName(e.name) || e.name;               // 옛 이름이면 정식 이름으로
      if (name !== e.name) renamed = true;
      return { name, rpe: e.rpe, ...(e.note ? { note: e.note } : {}), ...(e.superset ? { ss: true } : {}), sets, draft: { w: last.w, r: last.r } };
    });
  if (renamed) exercises.splice(0, exercises.length, ...mergeSameName(exercises));   // 바꾼 이름이 겹치면 합치기 (app.js)
  return { id: row.id, split: row.split, start: row.started_at, end: row.ended_at, exercises, synced: !renamed };   // 이름이 바뀌었으면 다시 올리기
}

async function downloadAll(justUploaded) {
  // 표 3개를 이름표(id)로 이어서 가져오기. RLS 덕분에 내 기록만 온다. 1000개가 넘어도 다 받게 나눠서 (selectAll)
  const rows = await selectAll("workouts",
    "id, split, started_at, ended_at, workout_exercises(name, position, rpe, note, superset, sets(set_no, weight, reps, done_at))", "id");

  const remoteIds = new Set(rows.map(r => r.id));
  const localAt = new Map(data.workouts.map((w, i) => [w.id, i]));   // id → 폰의 몇 번째 운동
  let added = 0, removed = 0, updated = 0;

  for (const row of rows) {
    if (data.deleted.includes(row.id)) continue;
    const i = localAt.get(row.id);
    if (i === undefined) {                                        // [1] 인터넷에만 있는 운동 → 폰에 추가
      data.workouts.push(toLocalWorkout(row));
      added++;
      continue;
    }
    const local = data.workouts[i];                               // [1-2] 폰에도 있음 (v0.6-d)
    if (!local.synced || !local.end || justUploaded.has(row.id)) continue;   // 폰에서 고치고 안 올린 것 · 진행 중 · 방금 올린 것 → 폰 것이 최신
    const remote = toLocalWorkout(row);                           // 이미 올라가 있던 것 → 인터넷 쪽이 기준 (다른 기기에서 고친 것)
    if (sameWorkout(local, remote)) continue;                     //   같으면 그대로 (괜히 바꾸지 않기)
    data.workouts[i] = { ...remote, ...(local.imported ? { imported: true, estimated: local.estimated } : {}) };   // 메모에서 가져온 표시는 폰에만 있어서 남김
    updated++;
  }
  const before = data.workouts.length;                            // [2] 폰에서 '올라가 있던' 운동인데 인터넷에 없음
  data.workouts = data.workouts.filter(w =>                       //     → 다른 기기에서 지운 것 → 폰에서도 지우기
    !(w.synced && w.end && !remoteIds.has(w.id) && !justUploaded.has(w.id)));          //     (방금 올린 운동은 절대 안 지움)
  removed = before - data.workouts.length;

  const mine = await selectAll("my_exercises", "name, part, range_low, range_high, step", "name");   // [3] 내가 만든 종목: 폰에 없는 것만 가져오기
  for (const c of mine) {
    if (dictionaryName(c.name)) continue;                         //     사전에 있는 종목(옛 이름 포함)은 건너뜀
    if (!data.custom[c.name]) data.custom[c.name] = { part: c.part, range: [c.range_low, c.range_high], step: Number(c.step) };
  }
  save();
  return { added, removed, updated };
}

// 폰의 운동과 인터넷에서 받은 운동이 내용까지 같은가 (시각은 글자 모양이 달라서 Date로 바꿔 비교: "…00.000Z" vs "…00+00:00")
const sameTime = (a, b) => (a ? Date.parse(a) : null) === (b ? Date.parse(b) : null);
function sameWorkout(a, b) {
  if (a.split !== b.split || !sameTime(a.start, b.start) || !sameTime(a.end, b.end) || a.exercises.length !== b.exercises.length) return false;
  return a.exercises.every((e, k) => {
    const f = b.exercises[k];
    return e.name === f.name && (e.rpe ?? null) === (f.rpe ?? null) && (e.note || "") === (f.note || "") && !!e.ss === !!f.ss
      && e.sets.length === f.sets.length
      && e.sets.every((s, j) => Number(s.w) === Number(f.sets[j].w) && s.r === f.sets[j].r && sameTime(s.t, f.sets[j].t));
  });
}

async function syncNow() {
  if (!account.user || account.busy || !navigator.onLine) return;
  account.busy = true;
  const go = await checkOwner().catch(() => false);               // 다른 계정의 기록이면 먼저 물어봄 (1-1)
  if (!go) { account.busy = false; return render(); }
  syncUserId = account.user.id;
  account.status = "동기화 중…";
  refreshIfSafe();
  try {
    for (const id of [...data.deleted]) {                         // 폰에서 지운 운동 → 인터넷에서도 지우기
      const { error } = await db.from("workouts").delete().eq("id", id);
      if (error) throw error;
      data.deleted = data.deleted.filter(x => x !== id);
      save();
    }
    const justUploaded = new Set();
    for (const w of finishedWorkouts().filter(w => !w.synced)) {  // 아직 안 올린 운동 (로그인 전 기록 포함)
      await uploadWorkout(w);
      justUploaded.add(w.id);
      w.synced = true;                                            // 하나 올릴 때마다 바로 저장 → 끊겨도 다음에 이어서
      save();
    }
    if (data.deletedCustoms && data.deletedCustoms.length) {       // 사전에 들어가서 없앤 내 종목 → 인터넷에서도 지우기
      const { error } = await db.from("my_exercises").delete().in("name", data.deletedCustoms);
      if (error) throw error;
      data.deletedCustoms = [];
      save();
    }
    if (data.customDirty) {                                       // 내가 만든 종목
      const rows = Object.entries(data.custom).map(([name, c]) => ({
        name, part: c.part, range_low: c.range[0], range_high: c.range[1], step: c.step,
      }));
      if (rows.length) {
        const { error } = await db.from("my_exercises").upsert(rows);
        if (error) throw error;
      }
      data.customDirty = false;
      save();
    }
    if (typeof syncNutrition === "function") await syncNutrition();   // 체중 · 식사 · 식단 설정 (nutrition.js)
    if (typeof syncAppSettings === "function") await syncAppSettings(); // 숨긴 그래프 목록 (progress.js)
    const { added, removed, updated } = await downloadAll(justUploaded);   // 올린 다음에 받기
    const now = new Date();
    const changes = [added && `받아온 기록 ${added}개`, updated && `다른 기기에서 고친 기록 ${updated}개 반영`,
      removed && `다른 기기에서 지운 기록 ${removed}개 정리`].filter(Boolean).join(", ");
    account.status = `동기화 완료 ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}${changes ? " · " + changes : ""}`;
  } catch (error) {
    account.status = `동기화 실패 — 다음에 다시 시도해요 (${authError(error)})`;
  }
  account.busy = false;
  syncUserId = null;
  refreshIfSafe();
}


// ---------- 3. 화면 ----------

function accountCard() {                                          // 홈 화면의 계정 칸
  if (!account.user) {
    return `
      <section class="card account">
        <p>☁️ 로그인하면 기록이 인터넷에 백업되고, 다른 기기에서도 보여요.</p>
        <button class="primary wide" data-action="login-screen">로그인 · 회원가입</button>
      </section>`;
  }
  const pending = pendingCount();
  return `
    <section class="card account">
      <p>☁️ <b>${escapeHtml(account.user.email)}</b></p>
      <p class="muted small">${pending ? `올릴 기록 ${pending}개` : "모두 올라가 있어요"}${account.status ? " · " + escapeHtml(account.status) : ""}</p>
      <div class="row gap-s">
        <button class="small" data-action="sync" ${account.busy ? "disabled" : ""}>지금 동기화</button>
        <button class="small" data-action="logout">로그아웃</button>
      </div>
    </section>`;
}

function loginView() {
  return `
    <header class="bar"><h1>로그인</h1><button class="small" data-action="home">홈</button></header>
    <main>
      <p class="muted small">처음이면 이메일과 비밀번호(6자 이상)를 적고 <b>회원가입</b>을 눌러요. 확인 메일의 링크를 누른 다음 <b>로그인</b>하면 돼요.</p>
      <label class="field">이메일<input type="email" id="email" autocomplete="email" inputmode="email"></label>
      <label class="field">비밀번호<input type="password" id="password" autocomplete="current-password"></label>
      <button class="primary wide" data-action="sign-in">로그인</button>
      <button class="wide" data-action="sign-up">회원가입</button>
      ${account.message ? `<p class="notice">${escapeHtml(account.message)}</p>` : ""}
    </main>`;
}

function readLoginForm() {
  return [document.getElementById("email").value.trim(), document.getElementById("password").value];
}

document.addEventListener("click", event => {
  const el = event.target.closest("[data-action]");
  if (!el) return;
  switch (el.dataset.action) {
    case "login-screen": account.message = ""; ui.screen = "login"; return render();
    case "sign-in": return signIn(...readLoginForm());
    case "sign-up": return signUp(...readLoginForm());
    case "logout": return signOut();
    case "sync": return syncNow();
  }
});

initAccount();
