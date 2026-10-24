-- v0.5-j: 체성분 (인바디를 잰 날만). 인바디는 개인용 공개 API가 없어서 직접 적음
alter table public.body_weights add column skeletal_muscle_kg numeric;   -- 골격근량 (kg)
alter table public.body_weights add column body_fat_pct numeric;         -- 체지방률 (%)
