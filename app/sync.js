// I will become monster — v0.4-c 로그인 · 동기화 (Supabase)
//
// [지도]
//   들어오는 것: 이메일 · 비밀번호, 폰에 저장된 data (app.js)
//   하는 일:     로그인 → 아직 안 올린 운동을 표 3개(workouts · workout_exercises · sets)로 나눠 올리기
//                지운 운동은 인터넷에서도 지우기, 내가 만든 종목(my_exercises) 올리기
//   나가는 것:   홈 화면의 계정 칸 (로그인 상태 · 올릴 기록 수 · 동기화 결과)
//
// 원칙: 기록은 항상 폰에 먼저 저장된다(app.js). 여기는 인터넷이 될 때 "올리기"만 담당.
//      로그인을 안 해도 앱은 그대로 쓸 수 있다.

const SUPABASE_URL = "https://nkchwtsjjskiwgakemag.supabase.co";
const SUPABASE_KEY = "sb_publishable_hotPI28wDcC2qIEQ-YJxXw_xO9D08uQ";   // 공개용 키. 남의 기록은 RLS("내 기록은 나만")가 막아 줌
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const account = {
  user: null,        // 로그인한 사람 (없으면 null)
  status: "",        // 홈에 보여 줄 한 줄 (예: "동기화 완료 19:32")
  busy: false,       // 지금 동기화 중인가
  message: "",       // 로그인 화면의 안내 · 에러
};


// ---------- 1. 로그인 상태 ----------

async function initAccount() {
  const { data: { session } } = await db.auth.getSession();      // 폰에 남아 있는 로그인 (껐다 켜도 유지)
  account.user = session ? session.user : null;
  db.auth.onAuthStateChange((_event, session) => {                // 로그인 · 로그아웃될 때마다
    account.user = session ? session.user : null;
    if (ui.screen === "home") render();
  });
  window.addEventListener("online", () => syncNow());             // 인터넷이 다시 연결되면 올리기
  render();
  syncNow();
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


// ---------- 2. 올리기 ----------

function pendingCount() {                                         // 아직 안 올린 것 개수
  return finishedWorkouts().filter(w => !w.synced).length + data.deleted.length;
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
    .insert(w.exercises.map((e, i) => ({ workout_id: w.id, position: i + 1, name: e.name, rpe: e.rpe })))
    .select("id, position");
  if (result.error) throw result.error;
  const idOf = {};                                                // position → 새 id   예: {1: 57, 2: 58}
  for (const row of result.data) idOf[row.position] = row.id;

  // [4] 세트 넣기 (한 줄 = 한 세트)
  const sets = w.exercises.flatMap((e, i) => e.sets.map((s, j) => ({
    exercise_id: idOf[i + 1], set_no: j + 1, weight: s.w, reps: s.r, done_at: s.t || null,
  })));
  if (sets.length) {
    result = await db.from("sets").insert(sets);
    if (result.error) throw result.error;
  }
}

async function syncNow() {
  if (!account.user || account.busy || !navigator.onLine) return;
  account.busy = true;
  account.status = "동기화 중…";
  if (ui.screen === "home") render();
  try {
    for (const id of [...data.deleted]) {                         // 폰에서 지운 운동 → 인터넷에서도 지우기
      const { error } = await db.from("workouts").delete().eq("id", id);
      if (error) throw error;
      data.deleted = data.deleted.filter(x => x !== id);
      save();
    }
    for (const w of finishedWorkouts().filter(w => !w.synced)) {  // 아직 안 올린 운동 (로그인 전 기록 포함)
      await uploadWorkout(w);
      w.synced = true;                                            // 하나 올릴 때마다 바로 저장 → 끊겨도 다음에 이어서
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
    const now = new Date();
    account.status = `동기화 완료 ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
  } catch (error) {
    account.status = `동기화 실패 — 다음에 다시 시도해요 (${authError(error)})`;
  }
  account.busy = false;
  if (ui.screen === "home") render();
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
