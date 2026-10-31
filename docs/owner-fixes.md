# 내 손으로 고칠 것 (v0.6-d) — 1~2줄짜리 3개

네 규칙: **"1~2줄짜리는 내가 직접 고친다"** (2026-10-07 중간 점검에서 정함). 그래서 이번 v0.6-d에서 찾은 것 중 짧은 3개는 Claude가 안 고치고 여기에 남겨 뒀어.
1번은 바로 정답을 보지 말고 **힌트 1 → 힌트 2 → 정답** 순서로 열어 봐. 2 · 3번은 위치와 바꿀 글자를 그대로 적어 뒀어.

고친 뒤 확인하는 방법은 두 가지야.
- **폰에서**: PR 화면의 Vercel 댓글에 있는 미리보기 주소(Preview)를 열어서 아래 "확인" 순서대로 눌러 보기
- **GitHub에서**: 커밋하면 PR 아래 **Checks**(또는 위쪽 **Actions** 탭)에서 자동 검사가 돌아. 1 · 2번은 `tests/owner-fixes.test.js`에 미리 시험을 만들어 뒀어 — 고치기 전에는 `not ok … # TODO`, 고치고 나면 `ok … # TODO`로 바뀌어 (Actions → 맨 위 실행 → "문법 · node 시험" → "node 시험" 칸을 펼치면 보여)

---

## GitHub 웹 편집기로 고치고 커밋하는 법 (세 개 다 같음)

1. github.com에서 이 저장소 → 왼쪽 위 브랜치 칸을 **`v0.6-d`** 로 바꾸기 (PR이 아직 열려 있으면 이 브랜치에 고쳐야 PR에 같이 들어가. PR을 이미 합쳤으면 `v0.6`)
2. 고칠 파일을 열고 → 오른쪽 위 **연필(✏️ Edit this file)**
3. 줄 번호를 찾아서 고치기 (편집기 안에서 `Ctrl+F`로 글자 찾기도 돼)
4. 오른쪽 위 **Commit changes…** → 메시지는 한국어로 "무엇을 왜" (예: `B2: 백업 복원할 때 내 음식도 같이 복원`) → **Commit directly to the `v0.6-d` branch** → Commit
5. **앱 파일(`app/…`)을 고쳤으면 버전 두 줄도 같이** (CLAUDE.md 규칙 — 안 올리면 폰이 옛 파일을 계속 씀):
   - `app/app.js` 22줄: `const APP_VERSION = "v0.6-d.1";` → `"v0.6-d.2"`
   - `app/sw.js` 4줄: `const CACHE = "iwbm-v0.6d-1";` → `"iwbm-v0.6d-2"`
   - 1번 · 2번을 둘 다 고칠 거면 버전은 마지막에 한 번만 올리면 돼
6. 다 하면 Claude한테 "고쳤어, pull해서 확인해 줘"라고 말하기

---

## 1. B2 — 백업을 복원하면 "내 음식"이 사라짐 (힌트 사다리)

**증상**: 식단 → 음식 추가 → "직접 등록"으로 내 음식(예: 홀리닭 스테이크)을 만들고 → 홈 → **백업** → 바로 **복원**으로 그 파일을 고르면 → 운동 · 체중 · 식사는 돌아오는데 **내 음식 목록만 비어 있어.**
백업 파일(JSON)을 메모장으로 열어 보면 `"myFoods"`는 파일 안에 멀쩡히 들어 있어. 그러니까 **저장(백업)은 맞고, 읽어 들이는(복원) 쪽**이 문제야.

**파일**: `app/app.js` · 함수 `restoreBackup` (451줄부터)

<details>
<summary>힌트 1 — 어디를 볼까?</summary>

`restoreBackup` 안에서 `data = { … }` 로 **새 data를 통째로 만드는 줄**(459~461줄)을 봐.
Python으로 치면 `data = {"workouts": restored["workouts"], "body": restored.get("body", {}), …}` 처럼 **칸을 하나하나 골라서 옮겨 담는** 모양이야.
골라 담은 칸 목록에 무엇이 있고, 무엇이 없지? 백업 파일 안의 칸 이름(`workouts`, `body`, `meals`, `nutrition`, `hiddenGraphs`, `myFoods` …)과 하나씩 맞춰 봐.

</details>

<details>
<summary>힌트 2 — 무엇을 넣어야 할까?</summary>

`{ ...EMPTY_EXTRAS(), … }` 의 `...EMPTY_EXTRAS()` 는 "빈 칸들을 먼저 깔아 둔다"는 뜻이야 (40~42줄의 `EMPTY_EXTRAS` 안에 `myFoods: {}`가 있음). 그래서 `myFoods`를 골라 담지 않으면 **빈 `{}`가 그대로 남아.**
그 뒤 줄들을 보면 운동 · 체중 · 식사는 `synced = false`, 내 종목은 `customDirty: true`, 숨긴 그래프는 `hiddenDirty: true` 로 **"인터넷에 다시 올려 줘" 표시**도 같이 하지?
내 음식에도 똑같이 두 가지가 필요해: ① 백업의 `myFoods`를 옮겨 담기 (없으면 `{}`) ② 다시 올리기 표시 — 내 음식의 표시 이름은 nutrition.js 13줄 주석에 있어.

</details>

<details>
<summary>정답 (힌트 2까지 보고 직접 써 본 다음에 열기)</summary>

461줄 끝을 이렇게:

```js
// 전
               hiddenGraphs: restored.hiddenGraphs || [], hiddenDirty: true };
// 후
               hiddenGraphs: restored.hiddenGraphs || [], hiddenDirty: true, myFoods: restored.myFoods || {}, myFoodsDirty: true };
```

- `restored.myFoods || {}` = Python의 `restored.get("myFoods") or {}` — 옛날 백업(v0.6-a 전)에는 이 칸이 없어서 `{}`로
- `myFoodsDirty: true` = 다음 동기화 때 `my_foods` 표에 다시 올림 (다른 기록들처럼)

</details>

**확인 (폰, 미리보기 주소)**: 식단 → 아무 끼니 "+ 추가" → 직접 등록으로 내 음식 하나 만들기 → 홈 → 백업 → 복원(방금 받은 파일) → 식단 → "+ 추가" → 음식 칸에 그 이름 앞글자를 치면 **내 음식이 맨 위에 나오면 성공.**
**확인 (GitHub)**: Actions의 node 시험에서 `ok … B2: 백업 복원 뒤에도 내 음식(myFoods)이 남아 있음 # TODO`

---

## 2. 메모 가져오기 화면의 "Workout" 버튼 → "운동"

화면 글자는 전부 한국어인데 이 버튼만 영어로 남아 있어 (v0.5-k에서 아래 탭 바를 "운동"으로 바꿀 때 빠짐).

- **파일**: `app/import.js` · **191줄**
- **바꿀 것**: `data-action="workouts">Workout</button>` 의 `Workout` → `운동`
  ```js
  // 전
      <header class="bar"><h1>메모 가져오기</h1><button class="small" data-action="workouts">Workout</button></header>
  // 후
      <header class="bar"><h1>메모 가져오기</h1><button class="small" data-action="workouts">운동</button></header>
  ```
- **확인 (폰)**: 아래 탭 "운동" → 기록 탭 → "메모 가져오기" → 오른쪽 위 버튼이 **운동**이고, 누르면 운동 화면으로 돌아가면 성공
- **확인 (GitHub)**: `ok … 메모 가져오기 화면의 돌아가기 버튼 글자가 한국어(운동) # TODO`
- 버전 두 줄도 잊지 말기 (위 5번)

---

## 3. README의 v0.6-a 표시 🔨 → ✅

v0.6-a(음식 g · 고치기 · 내 음식)는 이미 다 만들어서 쓰고 있는데 로드맵 표에는 아직 "만드는 중"(🔨)으로 남아 있어.

- **파일**: `README.md` · **36줄** (v0.6 줄)
- **바꿀 것**: `**a 🔨 음식 g · 고치기 · 내 음식**` → `**a ✅ 음식 g · 고치기 · 내 음식**`
- 앱 파일이 아니라서 버전은 안 올려도 돼
- **확인**: 저장소 첫 화면(README)에서 "2. 단계 계획" 표의 v0.6 칸

---

다 끝나면 이 파일 맨 위에 `✅ 다 고침 (날짜)` 한 줄 적고, `tests/owner-fixes.test.js`의 `{ todo: … }` 두 개를 지워서 진짜 시험으로 바꿔도 돼 (그것도 1줄씩).
