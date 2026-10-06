// 종목 설정 — 노트북(gym_log.ipynb) ②의 EXERCISES를 그대로 옮긴 것
//   part = 부위, range = 반복 범위 [최소, 최대], step = 증량 무게(kg). step 0 = 맨몸 운동
//   노트북에서 값을 바꾸면 여기도 같이 바꿔 주세요.
const EXERCISES = {
  "Bench press": { part: "가슴", range: [6, 8], step: 5 },
  "Free IBP": { part: "가슴", range: [8, 10], step: 5 },
  "DB press": { part: "가슴", range: [12, 15], step: 2 },
  "Dips": { part: "가슴", range: [10, 15], step: 0 },
  "Pull up": { part: "등", range: [8, 12], step: 0 },
  "Wide pull up": { part: "등", range: [8, 12], step: 0 },
  "Straight arm pull down": { part: "등", range: [12, 15], step: 5 },
  "Deadlift": { part: "등", range: [6, 8], step: 5 },
  "Long pull": { part: "등", range: [12, 15], step: 5 },
  "DB row": { part: "등", range: [12, 15], step: 2 },
  "Smith behind neck press": { part: "어깨", range: [8, 10], step: 5 },
  "DB shoulder press": { part: "어깨", range: [12, 15], step: 2 },
  "Peck deck fly": { part: "어깨", range: [15, 20], step: 5 },
  "Smith SLL": { part: "어깨", range: [15, 20], step: 2.5 },
  "Bench lateral raise": { part: "어깨", range: [15, 20], step: 2 },
  "SLL": { part: "어깨", range: [15, 20], step: 2 },
  "Squat": { part: "하체", range: [8, 10], step: 5 },
  "Kettle bell wide squat": { part: "하체", range: [15, 20], step: 4 },
  "Dumbbell curl": { part: "이두", range: [10, 12], step: 2 },
  "BB curl": { part: "이두", range: [8, 10], step: 5 },
  "Hammer curl": { part: "이두", range: [10, 12], step: 2 },
  "EZ bar curl": { part: "이두", range: [10, 12], step: 5 },
  "Cable push down": { part: "삼두", range: [10, 12], step: 5 },
  "Overhead extension": { part: "삼두", range: [10, 12], step: 5 },
  "Leg raise": { part: "복근", range: [20, 30], step: 0 },
  "HLR": { part: "복근", range: [20, 30], step: 0 },
};

const DAYS = ["가슴", "등", "어깨", "하체"];                       // 4분할
const DEFAULT_SETTING = { part: "미분류", range: [8, 12], step: 5 };  // 목록에 없는 종목
