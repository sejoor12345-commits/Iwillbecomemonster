-- sets 표의 "가리키는 칸" 이름을 가리키는 표 이름에 맞춤 (사용자 제안: 가독성)
--   exercise_id → workout_exercise_id   (workout_exercises 표의 id를 가리킴)
alter table public.sets rename column exercise_id to workout_exercise_id;
