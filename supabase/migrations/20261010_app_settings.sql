-- v0.4-d: 앱 설정 (사람마다 한 줄) — 지금은 운동 그래프에서 숨긴 종목 목록만
create table public.app_settings (
  user_id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  hidden_graphs  jsonb not null default '[]',                     -- ["어깨|Bench lateral raise", …]
  updated_at     timestamptz not null default now()
);

alter table public.app_settings enable row level security;

create policy "own rows" on public.app_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
