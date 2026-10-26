# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal workout + nutrition tracker built as a learning project. Two layers:

- **Notebooks (the "lab")**: `gym_log.ipynb` (workout memo → table → growth → next-weight suggestion) and `weight_log.ipynb` (daily weight + kcal → 7-day average → maintenance kcal). Run in Google Colab.
- **App (the "product")**: `app/` — a no-build static PWA (vanilla JS, no framework, no bundler, no npm). Rules are proven in a notebook first, then ported to JS. Keep the two in sync when a rule changes (e.g. `app/exercises.js` mirrors notebook ② `EXERCISES`; `nextWeight` mirrors ⑧; e1RM mirrors ④ including rounding to 0.1 so change % matches ⑥; Nutrition maintenance mirrors `weight_log.ipynb` ④–⑤).

**Exercise dictionary (v0.5)**: `app/exercises.js` maps canonical English names to `ko`, `part`, `range`, `step`, `aliases`, plus hidden `LEGACY_NAMES`; `dictionaryName()` resolves any alias / Korean name / old name, ignoring case, spaces and "-" (`compactName`). Notes are per exercise (`e.note` ↔ `workout_exercises.note`), not per set. Splits: `DAYS` (+ `SPLIT_PARTS`, e.g. 팔 → 이두 · 삼두); a workout can combine splits as `"어깨+팔"`, and a combination counts as its own split (owner's rule, v0.6-b): `exerciseSplit(w, name)` returns `w.split`, so last-time lookup, suggestions, graphs and the memo header keep 어깨+팔 / 가슴+팔 / 팔 separate. Notebook ① parses `+`-joined headers the same way (`isSplitName` in the app). Supersets: `e.ss = true` links an exercise to the next one (↔ `workout_exercises.superset`); the memo export stays one line per exercise. Records always store the canonical name; `canonicalizeData()` in `load()` renames old saves and marks them for re-upload. Notebook ② (`EXERCISES`, `ALIASES`, `canonical()`) is generated to match — change both together.

The owner is a beginner learning "vibe coding" and reads code at map level. Talk to them in Korean 반말, beginner-friendly. Code comments are in Korean, and each file opens with a `[지도]` block (들어오는 것 / 하는 일 / 나가는 것); keep that style. Tunable numbers live as named constants at the top of each file so they can be changed in one line.

## Suggesting tools (owner's rule)

작업 중 더 효율적으로 작업할 수 있는 방법이 보이면 skill, MCP, hook, 외부 도구·라이브러리 등을 제안할 것.
- 진행 중인 작업을 끊지 말고, 작업을 마친 뒤 답변 끝에 한 줄로 제안
- 이유와 추가했을 때 달라지는 점을 짧게 함께 적을 것
- 직접 추가하지 말고 내 동의를 받을 것
- 이미 거절한 제안은 반복하지 말 것
- Claude Code 웹 환경에서 작동하지 않는 것(plugin 등)은 제안하지 말 것

For a full review on demand, the owner runs the `tooling-review` skill.

## Running and checking

- Serve locally: `cd app && python3 -m http.server 8772` → http://localhost:8772
- Syntax check: `node --check app/<file>.js`
- There is no test suite in the repo. Changes have been verified with ad-hoc Playwright scripts (global `playwright` npm package, Chromium preinstalled) that replace `vendor/supabase-*.js` via `page.route` with a fake client recording calls, seed `localStorage["iwbm-data-v1"]`, and click through `[data-action=...]` buttons. Use iPhone device emulation; for performance checks use CDP `Emulation.setCPUThrottlingRate`.
- Deploy: Vercel serves `app/` (root `vercel.json` sets `outputDirectory: "app"` and no-cache for `sw.js`). Vercel Production tracks **`main`** (set by the owner, 2026-10-24). Whenever the current version branch is updated and pushed, fast-forward `main` to it and push `main` too (e.g. `git push origin v0.6:main`), so the phone app updates without changing Vercel settings. Step branches (e.g. `v0.5-j`) are previews only.

## Branches and versions

One branch per version (`v0.1` … `v0.6`); each new version branches from the previous one. Work on the current version branch (or a step branch off it), not directly on `main`; `main` only mirrors the latest released version for deployment. When the app changes, bump **both** `APP_VERSION` in `app/app.js` (shown at the bottom of Home) and `CACHE` in `app/sw.js`; otherwise phones keep the old cached files (stale-while-revalidate) and only show the update on the second open. The README roadmap table tracks version status; update it when a version moves.

## App architecture (`app/`)

Classic `<script>` tags sharing globals; **load order in `index.html` matters**: `exercises.js` → `exercise-media.js` → `app.js` → `nutrition.js` → `progress.js` → `exercise-detail.js` → `vendor/supabase` → `sync.js` → `import.js`. `sync.js` starts a sync immediately on load, so any file whose sync hook it calls must load before it (this was a real bug). Cross-file calls are guarded with `typeof fn === "function"`.

- **State**: `data` (persisted to `localStorage` key `iwbm-data-v1` via `save()`/`load()`; `load()` spreads `EMPTY_EXTRAS()` under old saves so new fields exist) and `ui` (screen state, not persisted; other files add their fields with `Object.assign(ui, …)`).
- **Render loop**: every action mutates `data`/`ui` → `save()` → `render()` → `views[ui.screen]()` returns an HTML string → `#app.innerHTML`. User-entered text must go through `escapeHtml`. Full re-render wipes inputs, so typing-heavy UI updates only a sub-container (see `updateSearch` → `.pick-results`) and keeps typed values in `ui` drafts; `sync.js`'s `refreshIfSafe()` skips re-render while a form is open.
- **Events**: one `document` click listener per file, dispatching on `data-action` (`el.closest("[data-action]")`, values via `dataset`, which are strings). Prefixes: Nutrition `n-…`, graphs `graph-…`.
- **Design (v0.5-k)**: one dark theme (tokens at the top of `style.css`: near-black + one orange accent, Pretendard from jsDelivr); bottom tab bar 홈 · 운동 · 식단 (`tabBar()` in `app.js`, hidden only on login). Exercise detail screen `exercise` (`exercise-detail.js`: 요약 · 기록 · 자세) opens from the graph list and from each workout card. Exercise GIFs/muscles/Korean steps come from `exercise-media.js` (hasaneyldrm/exercises-dataset; GIFs © Gym visual, personal non-commercial use only, hot-linked via jsDelivr, `MEDIA_ENABLED` switch) — remove or license before any public release.
- **Screens**: Home has two sections — Workout (`workoutsView`: 기록/그래프 tabs; recording in `workoutView`) and Nutrition (`nutrition.js`: 식단/체중 tabs sharing one day picker). Graphs: `progress.js` (top weight per split+exercise per day; e1RM shown as a single line under the chart); weight chart in `nutrition.js`. Charts are hand-written SVG with shared `.chart` styles and colors from CSS tokens.
- **Nutrition rules**: maintenance = mean intake of *complete* days − daily weight slope × 7700 over the last 14 days (needs 10 weight days and 7 complete meal days; today excluded). A past day counts as complete if a user mark says so, otherwise if kcal ≥ 60% of the target derived from the starting estimate. Starting estimate: manual value > Mifflin-St Jeor BMR × activity factor > `INITIAL_MAINTENANCE`. Body composition (InBody, typed by hand) rides on the weight record: `data.body[day].smm` / `.pbf` ↔ `body_weights.skeletal_muscle_kg` / `body_fat_pct`. Food search goes app → Edge Function `food-search` (holds the data.go.kr key as secret `FOOD_API_KEY`) → 식약처 API (endpoint version 03). Meals keep the eaten amount `g` (↔ `meals.grams`); changing grams scales kcal and macros by the same ratio (add form via `mealPick`, edit via `scaleEdit`). Foods the user registers live in `data.myFoods` (per-basis numbers, ↔ `my_foods`, `myFoodsDirty`) and are searched first, offline too.

## Sync (Supabase)

`sync.js` (`syncNow`) runs on app open, login, workout finish, reconnect, and after Nutrition changes. Order: delete what was deleted locally → upload unsynced → download. Change tracking: per-record `synced: false` (workouts, weights, meals; upload one at a time and save after each so interrupted syncs resume) and whole-object dirty flags (`customDirty`, `nutrition.dirty`, `hiddenDirty`). Downloads remove local synced records missing remotely, except ids in `justUploaded`. Workouts are split across `workouts` ─< `workout_exercises` ─< `sets`; also `my_exercises`, `body_weights`, `meals`, `nutrition_settings`, `app_settings`. Every table has an "own rows" RLS policy on `user_id = auth.uid()`; the client uses the publishable key. Schema lives in `supabase/migrations/` (applied to the project via the Supabase MCP); note `meals.slot` has a CHECK constraint, so adding a meal slot needs a migration too. Exercise names are stored as text, so renames need a local migration (see `canonicalizeData` in `load()`).

## Other folders

- `study/` — offline review notes (HTML + print PDF) generated for the owner; not part of the app or deploy.
- `.claude/skills/code-reading` (how to teach code reading to this user), `.claude/skills/study-log` (Notion learning-log format), `.claude/skills/tooling-review` (manual-only tool review), and `.claude/skills/frontend-design` (copied from anthropics/claude-code `plugins/frontend-design`; visual design guidance for UI/UX work). Follow them when the user asks to read code, record progress, review tooling, or improve the UI.
