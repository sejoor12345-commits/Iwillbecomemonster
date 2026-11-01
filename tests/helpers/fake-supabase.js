// 시험용 가짜 Supabase (진짜 인터넷 · 진짜 데이터베이스를 안 씀)
//
// [지도]
//   들어오는 것: createFakeSupabase({ users, session, remote, failOn })
//                users   = { 아이디: { id, email } }      ← 가입한 사람들
//                session = { user: { id, email } } 또는 null  ← 앱을 열 때 이미 로그인돼 있는 사람
//                remote  = { workouts: [...], meals: [...] … }  ← 인터넷 표에 미리 들어 있는 줄 (user_id 포함)
//   하는 일:     앱(sync.js · nutrition.js)이 쓰는 만큼만 흉내 냄
//                - from(표).select / order / range / eq / in / upsert / insert / delete
//                - RLS("내 기록은 나만"): 로그인한 사람의 줄만 보이고, 남의 id로 upsert하면 에러
//                  로그아웃된 뒤의 요청은 에러 없이 빈 결과 (진짜 Supabase도 그래서, "다 지워진 것"처럼 보일 수 있음)
//                - 한 번에 최대 1000줄 (진짜 Supabase처럼) → 나눠 받기(selectAll) 시험용
//                - workouts를 고르면 workout_exercises · sets를 안에 넣어 줌 (진짜처럼)
//   나가는 것:   { client, state }  client = 앱에 줄 가짜, state = 시험에서 들여다볼 표 · 부른 기록(calls)
//
// 같은 파일을 두 곳에서 씀: node 시험(tests/*.test.js, vm 안에서 실행)과 브라우저 시험(tests/e2e-smoke.js)
(function (root) {
  const MAX_ROWS = 1000;
  const KEYS = {                     // 표마다 "같은 줄"을 가르는 칸 (데이터베이스의 primary key)
    workouts: ["id"], meals: ["id"], workout_exercises: ["id"], sets: ["id"],
    body_weights: ["user_id", "day"], my_foods: ["user_id", "name"], my_exercises: ["user_id", "name"],
    nutrition_settings: ["user_id"], app_settings: ["user_id"],
  };
  const copy = x => JSON.parse(JSON.stringify(x));

  function createFakeSupabase(options) {
    const opts = options || {};
    const state = {
      tables: {}, users: copy(opts.users || {}), session: opts.session ? copy(opts.session) : null,
      calls: [], nextId: 1, listeners: [], failOn: opts.failOn || null,
    };
    for (const t of Object.keys(KEYS)) state.tables[t] = copy((opts.remote && opts.remote[t]) || []);
    for (const t of ["workout_exercises", "sets"]) for (const r of state.tables[t]) state.nextId = Math.max(state.nextId, r.id + 1);

    const uid = () => (state.session ? state.session.user.id : null);
    const sameKey = (table, a, b) => KEYS[table].every(k => a[k] === b[k]);

    function embedWorkout(w) {       // workouts 한 줄 + 그 운동의 종목들 + 각 종목의 세트들
      const exercises = state.tables.workout_exercises.filter(e => e.workout_id === w.id)
        .map(e => ({ ...e, sets: state.tables.sets.filter(s => s.workout_exercise_id === e.id).map(s => ({ ...s })) }));
      return { ...w, workout_exercises: exercises };
    }

    function exec(q) {
      const me = uid();
      state.calls.push({ table: q.table, op: q.op, range: q.range, order: q.order, filters: q.filters.map(f => f.text),
        rows: q.payload ? q.payload.length : 0, user: me });
      if (!me) {                     // 로그인 안 한(anon) 요청 — 진짜처럼: RLS가 다 가려서 고르기 · 지우기는 에러 없이 0줄, 넣기는 RLS 에러
        if (q.op === "select") return { data: [], error: null };
        if (q.op === "delete") return { data: null, error: null };
        return { data: null, error: { message: `new row violates row-level security policy for table "${q.table}"` } };
      }
      if (state.failOn) { const message = state.failOn(q); if (message) return { data: null, error: { message } }; }
      const table = state.tables[q.table];
      if (!table) return { data: null, error: { message: `relation "${q.table}" does not exist` } };
      const visible = r => r.user_id === me && q.filters.every(f => f.test(r));

      if (q.op === "select") {
        let rows = table.filter(visible);
        if (q.order) rows = [...rows].sort((a, b) => (a[q.order] < b[q.order] ? -1 : a[q.order] > b[q.order] ? 1 : 0));
        const from = q.range ? q.range[0] : 0;
        const to = q.range ? Math.min(q.range[1] + 1, from + MAX_ROWS) : MAX_ROWS;   // 한 번에 최대 1000줄
        rows = rows.slice(from, to);
        if (q.table === "workouts" && /workout_exercises\(/.test(q.columns)) rows = rows.map(embedWorkout);
        return { data: copy(rows), error: null };
      }
      if (q.op === "upsert") {
        for (const raw of q.payload) {
          const row = { user_id: me, ...raw };
          const old = table.find(r => sameKey(q.table, r, row));
          if (old && old.user_id !== me) return { data: null, error: { message: `new row violates row-level security policy for table "${q.table}"` } };
          if (old) Object.assign(old, row); else table.push(row);
        }
        return { data: q.returning ? copy(q.payload) : null, error: null };
      }
      if (q.op === "insert") {
        const added = [];
        for (const raw of q.payload) {
          const row = { user_id: me, ...raw };
          if (KEYS[q.table][0] === "id" && row.id === undefined) row.id = state.nextId++;
          table.push(row);
          added.push(row);
        }
        return { data: q.returning ? copy(added) : null, error: null };
      }
      if (q.op === "delete") {
        const gone = table.filter(visible);
        state.tables[q.table] = table.filter(r => !gone.includes(r));
        if (q.table === "workouts") {                                 // on delete cascade
          const ids = new Set(gone.map(r => r.id));
          const exIds = new Set(state.tables.workout_exercises.filter(e => ids.has(e.workout_id)).map(e => e.id));
          state.tables.workout_exercises = state.tables.workout_exercises.filter(e => !ids.has(e.workout_id));
          state.tables.sets = state.tables.sets.filter(s => !exIds.has(s.workout_exercise_id));
        }
        if (q.table === "workout_exercises") {
          const exIds = new Set(gone.map(e => e.id));
          state.tables.sets = state.tables.sets.filter(s => !exIds.has(s.workout_exercise_id));
        }
        return { data: null, error: null };
      }
      return { data: null, error: { message: "fake: unknown op " + q.op } };
    }

    function from(table) {
      const q = { table, op: "select", columns: "*", filters: [], order: null, range: null, payload: null, returning: null };
      const b = {
        select(cols) { if (q.op === "select") q.columns = cols || "*"; else q.returning = cols || "*"; return b; },
        order(col) { q.order = col; return b; },
        range(a, z) { q.range = [a, z]; return b; },
        eq(col, v) { q.filters.push({ text: `${col}=${v}`, test: r => r[col] === v }); return b; },
        in(col, list) { q.filters.push({ text: `${col} in ${list}`, test: r => list.includes(r[col]) }); return b; },
        upsert(rows) { q.op = "upsert"; q.payload = [].concat(rows); return b; },
        insert(rows) { q.op = "insert"; q.payload = [].concat(rows); return b; },
        delete() { q.op = "delete"; return b; },
        then(ok, bad) { return Promise.resolve().then(() => exec(q)).then(ok, bad); },
      };
      return b;
    }

    const emit = event => state.listeners.forEach(cb => cb(event, state.session));
    const client = {
      from,
      auth: {
        getSession: async () => ({ data: { session: state.session } }),
        onAuthStateChange(cb) { state.listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
        signInWithPassword: async ({ email }) => {
          const user = Object.values(state.users).find(u => u.email === email);
          if (!user) return { data: {}, error: { message: "Invalid login credentials" } };
          state.session = { user: copy(user) };
          emit("SIGNED_IN");
          return { data: { session: state.session }, error: null };
        },
        signUp: async ({ email }) => {
          const user = { id: "u-" + Object.keys(state.users).length + 1, email };
          state.users[user.id] = user;
          state.session = { user: copy(user) };
          emit("SIGNED_IN");
          return { data: { session: state.session }, error: null };
        },
        signOut: async () => { state.session = null; emit("SIGNED_OUT"); return { error: null }; },
      },
      functions: { invoke: async () => ({ data: { items: copy(opts.foodItems || []) }, error: null }) },
    };

    // 시험에서 쓰는 도우미: 다른 계정으로 바꾸기 (앱을 다시 여는 것처럼 쓰려면 session 옵션을 씀)
    state.signInAs = user => { state.session = { user: copy(user) }; emit("SIGNED_IN"); };
    // 시험용: 앱 모양 운동 하나를 표 3개에 넣기
    state.addWorkout = (userId, w) => {
      state.tables.workouts.push({ id: w.id, user_id: userId, split: w.split, started_at: w.start, ended_at: w.end });
      w.exercises.forEach((e, i) => {
        const exId = state.nextId++;
        state.tables.workout_exercises.push({ id: exId, workout_id: w.id, user_id: userId, position: i + 1, name: e.name,
          rpe: e.rpe ?? null, note: e.note || null, superset: !!e.ss });
        e.sets.forEach((s, j) => state.tables.sets.push({ id: state.nextId++, workout_exercise_id: exId, user_id: userId,
          set_no: j + 1, weight: s.w, reps: s.r, done_at: s.t || null }));
      });
    };
    return { client, state };
  }

  root.createFakeSupabase = createFakeSupabase;
  if (typeof module !== "undefined" && module.exports) module.exports = { createFakeSupabase };
})(typeof globalThis !== "undefined" ? globalThis : this);
