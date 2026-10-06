-- v0.4-c: 운동 기록 표 4개 + "내 기록은 나만" 보안 규칙(RLS)
--
--   workouts (운동 한 번) ─< workout_exercises (그날 한 종목) ─< sets (한 줄 = 한 세트)
--   my_exercises (내가 앱에서 만든 종목)

-- ① 운동 한 번
create table public.workouts (
  id          text primary key,                                   -- 앱이 만든 id (폰에서 만든 기록과 같은 이름표)
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  split       text not null,                                      -- 가슴 / 등 / 어깨 / 하체
  started_at  timestamptz not null,
  ended_at    timestamptz,
  updated_at  timestamptz not null default now()
);

-- ② 그날 한 종목
create table public.workout_exercises (
  id          bigint generated always as identity primary key,
  workout_id  text not null references public.workouts (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position    int not null,                                       -- 그날 몇 번째로 한 종목인지
  name        text not null,
  rpe         smallint check (rpe between 1 and 10)               -- 마지막 세트 RPE (없으면 비움)
);

-- ③ 한 세트 = 한 줄
create table public.sets (
  id           bigint generated always as identity primary key,
  exercise_id  bigint not null references public.workout_exercises (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  set_no       int not null,
  weight       numeric(6, 2) not null,                            -- kg (맨몸 = 0)
  reps         int not null,
  done_at      timestamptz                                        -- 세트 완료 시각 (휴식 계산용)
);

-- ④ 내가 만든 종목
create table public.my_exercises (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  part        text not null,
  range_low   int not null,
  range_high  int not null,
  step        numeric(4, 2) not null,                             -- 0 = 맨몸
  primary key (user_id, name)
);

-- 이름표로 자주 찾는 칸에 색인(빨리 찾기용)
create index on public.workouts (user_id);
create index on public.workout_exercises (workout_id);
create index on public.workout_exercises (user_id);
create index on public.sets (exercise_id);
create index on public.sets (user_id);

-- "내 기록은 나만 보고 쓸 수 있다"
alter table public.workouts          enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.sets              enable row level security;
alter table public.my_exercises      enable row level security;

create policy "own rows" on public.workouts          for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.workout_exercises for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.sets              for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.my_exercises      for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 운동 한 번을 표 3개에 나눠 넣는 일은 앱(app.js의 uploadWorkout)이 한다:
--   workouts에 upsert → 그 운동의 workout_exercises 지우기(sets도 같이 지워짐) → 종목 넣기 → 세트 넣기
--   같은 운동을 다시 올려도 결과가 같아서, 중간에 끊겨도 다음 동기화 때 다시 하면 된다.
