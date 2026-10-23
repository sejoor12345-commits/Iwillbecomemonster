-- v0.4-e: 처음 유지 칼로리(공식 · 직접 입력) + 날마다 "다 적음 / 덜 적음" 직접 표시
alter table public.nutrition_settings
  add column sex                text check (sex in ('남', '여')),      -- Mifflin-St Jeor 공식용
  add column birth_year         int,
  add column height_cm          numeric(4, 1),
  add column activity           int check (activity between 0 and 4), -- 활동 수준 5단계 (0 = 거의 안 움직임)
  add column manual_maintenance int,                                    -- 직접 입력한 유지 칼로리 (있으면 공식보다 먼저)
  add column day_status         jsonb not null default '{}';            -- {"2026-10-10": false} = 덜 적은 날로 직접 표시
