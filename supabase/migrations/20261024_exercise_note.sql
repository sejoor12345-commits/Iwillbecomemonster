-- v0.5-e: 메모를 세트가 아니라 종목 단위로 (사용자 결정). sets.note는 쓰지 않음 (비어 있음)
alter table public.workout_exercises add column note text;
