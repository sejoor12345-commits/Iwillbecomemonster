// 시험에서 같이 쓰는 작은 기록 만들기 도우미
//   workout("w1", "가슴", "2026-10-20", [["Bench press", 80, [8, 8, 7]]]) → 앱 모양의 끝난 운동 하나
function workout(id, split, day, exercises, extra = {}) {
  const start = new Date(`${day}T10:00:00.000Z`);
  return {
    id, split, start: start.toISOString(), end: new Date(start.getTime() + 3600000).toISOString(), synced: false,
    exercises: exercises.map(([name, w, reps, rpe], i) => ({
      name, rpe: rpe ?? null,
      sets: reps.map((r, j) => ({ w, r, t: new Date(start.getTime() + (i * 10 + j + 1) * 60000).toISOString() })),
      draft: { w, r: reps[0] },
    })),
    ...extra,
  };
}

function baseData(extra = {}) {
  return { workouts: [], currentId: null, custom: {}, deleted: [], customDirty: false, body: {}, meals: [], nutrition: null,
    deletedMeals: [], deletedWeights: [], hiddenGraphs: [], hiddenDirty: false, deletedCustoms: [], myFoods: {}, myFoodsDirty: false,
    ...extra };
}

module.exports = { workout, baseData };
