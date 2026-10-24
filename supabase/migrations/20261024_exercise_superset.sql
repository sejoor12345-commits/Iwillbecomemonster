-- v0.5-f: 슈퍼세트 (사용자 결정 (가) 묶어서 보여 주기). true = 이 종목이 다음 종목(position + 1)과 묶임
alter table public.workout_exercises add column superset boolean not null default false;
