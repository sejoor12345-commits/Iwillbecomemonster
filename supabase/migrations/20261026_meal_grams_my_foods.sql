-- v0.6-a: 먹은 양(g) 저장 → 나중에 g만 바꿔도 같은 비율로 다시 계산. 직접 등록한 음식(내 음식)
alter table public.meals add column grams numeric;                -- 먹은 양 (g), 모르면 null

create table public.my_foods (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  basis       numeric not null,                                     -- 기준량 (포장지 영양성분표, 보통 100g)
  unit        text not null default 'g',
  total       numeric,                                              -- 한 개 중량 (모르면 null)
  kcal        numeric not null,
  carb        numeric not null,
  protein     numeric not null,
  fat         numeric not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, name)
);
alter table public.my_foods enable row level security;
create policy "own rows" on public.my_foods for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
