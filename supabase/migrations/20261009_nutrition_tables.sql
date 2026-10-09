-- v0.4-d-1: 체중 · 식사 · 식단 설정 표 3개 + "내 기록은 나만" 보안 규칙(RLS)
--
--   body_weights (하루 = 한 줄)     meals (한 끼에 먹은 음식 하나 = 한 줄)     nutrition_settings (사람마다 한 줄)

-- ① 체중: 하루에 한 번 (같은 날 다시 적으면 덮어쓰기)
create table public.body_weights (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day         date not null,
  weight      numeric(5, 1) not null,                             -- kg, 소수 첫째 자리 (체중계처럼)
  updated_at  timestamptz not null default now(),
  primary key (user_id, day)
);

-- ② 식사: 음식 하나 = 한 줄 (FatSecret 숫자를 옮겨 적음)
create table public.meals (
  id          text primary key,                                   -- 앱이 만든 id
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day         date not null,
  slot        text not null check (slot in ('아침', '점심', '저녁', '간식')),
  food        text not null,
  kcal        int not null,
  carb        numeric(6, 1) not null,                             -- g
  protein     numeric(6, 1) not null,                             -- g
  fat         numeric(6, 1) not null,                             -- g
  created_at  timestamptz not null default now()
);

-- ③ 식단 설정: 목표 탄:단:지 비율(%), 목표 속도, 리피드처럼 그날만 바꾼 비율
create table public.nutrition_settings (
  user_id             uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  carb_pct            int not null,
  protein_pct         int not null,
  fat_pct             int not null,
  target_kg_per_week  numeric(4, 2) not null,
  day_ratios          jsonb not null default '{}',                -- {"2026-10-12": [60, 20, 20]}
  updated_at          timestamptz not null default now()
);

create index on public.meals (user_id, day);

alter table public.body_weights       enable row level security;
alter table public.meals              enable row level security;
alter table public.nutrition_settings enable row level security;

create policy "own rows" on public.body_weights       for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.meals              for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.nutrition_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
