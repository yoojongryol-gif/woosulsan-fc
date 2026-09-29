# 축구&joy 데이터 모델 (schema 3, v1.0.0-beta)

> **v1.0 전면 개편 (2026-09-29)** — 마스터플랜 `C:/종합상사/data/plans/soccer_app_v1_tactics_masterplan_2026-09-29.md`
> 사장님 확정: **상대는 외부 클럽만**. 내부 팀 배정(A~F)·팀 묶음 제안·팀별 감독 평가는 이 앱에서 없앴다.
> 하단 탭은 **우리팀 · 상대팀 · 전술보드 · 경기** 4개.
> **S1**(v1.0.0-alpha, 2026-09-29 아침): 우리팀 탭만 완성, 나머지는 자리표시.
> **S2**(v1.0.0-beta, 2026-09-29 오후): 상대팀 카드 + 경기 기록(라인업 목록 배치·결과·득점자/도움) + 전적 자동 계산. 전술보드는 여전히 자리표시(S3 준비 중).
> 내려간 코드는 `dev/parked/`(balance.js · tactics-v0.x.js · team-tab-v0.7.js · test-teams-v0.7.mjs)에 있다.

> **앱 이름 vs 클럽 이름** (v0.5.7, 2026-09-22 사장님)
> - `APP_NAME = '축구&joy'` (app.js) — 앱 자체의 이름. 제목표시줄·헤더·manifest·설정 하단·파일명·AI 프롬프트·`exportJSON().app`.
> - `club.name` (기본값 "웃을산 FC") — **모임 이름**. 설정에서 편집한다(`store.club.name()` / `setName()`).
> - **바뀔 수 없는 것**: localStorage 키(`woosulsan-fc:*`), 저장소·URL, sw 캐시 접두 `woosulsan-fc-`. 이름이 아니라 **주소**라서 바꾸면 기존 데이터가 끊긴다.
> - `importJSON` 은 `app` 필드를 보지 않는다 → 옛 백업 파일도 그대로 들어온다.

저장은 `store.js` 어댑터 한 곳을 통해서만 이루어진다. 지금은 `LocalStorageAdapter`(키 `woosulsan-fc:v1`),
나중에 같은 인터페이스(`load()` / `save(state)` / `clear()`)를 가진 `FirestoreAdapter` 로 갈아끼우면 화면 코드는 그대로다.

## 1. 상태 전체 (localStorage 한 덩어리)

```jsonc
{
  "schema": 3,
  "club": {
    "name": "웃을산 FC",
    "rubric": { "male": {...}, "female": {...} },   // 능력치 5단계 문구 (남/여)
    "tests": { "shuttle20": {...}, "run1500": {...} },  // 측정 경계값
    "squadSize": 11                                  // 한 팀 기본 인원 (라인업 기준)
  },
  "members":   [ /* Member */ ],
  "matches":   [ /* Match */ ],
  "opponents": [ /* Opponent — S2 에서 채운다. v1.0 은 빈 배열로 자리만 */ ],
  "tactics":   [ /* Tactic — S3 에서 새 보드 엔진으로 다시 정의 */ ],
  "updatedAt": "2026-09-29T06:00:00.000Z"
}
```

`club` 에서 사라진 것: `teamNames` · `teamOrder` · `teamAliases` · `mixedTeams` · `lockWomen` · `coaches` · `mixedFactor`.

## 2. Member — 회원

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | string | `m_xxx` |
| `name` | string | 이름 (일괄 추가 시 중복 이름은 건너뜀) |
| `skill` | 1~5 (소수 1자리) | **종합 실력 — 자동 계산**. `abil` 6항목 중 입력된 것들의 평균(`effectiveSkill()`). 하나도 입력이 없으면 예전 수동 값(기본 3)을 두고 화면에는 "미평가"로 표시한다(`isUnrated()`) |
| `gk` | boolean | 골키퍼 가능 여부 (선호 포지션과 별개) |
| `pos` | `FW`\|`MF`\|`DF`\|`GK` | 선호 포지션 1개 |
| `birthYear` | number \| null | 출생년도(선택). 2자리 입력은 `parseBirthYear()` 가 19xx/20xx 로 보정. 표시는 **연 나이 = 올해 - 출생년도** |
| `abil` | object | **간단 체크 6항목** — `{speed, stamina, basic, shoot, defense, physical}`, 각 1~5 또는 `null`. 순서·이름 고정(`ABILITIES`). 이 6항목의 평균이 곧 종합 `skill` 이다 — `normalizeMember()` 가 저장할 때마다 다시 계산한다 |
| `tests` | object | 측정 기록 `{ shuttle20: {sec, at, manual} \| null, run1500: … }`. 기록을 넣으면 성별 경계값으로 1~5 를 환산해 `abil.speed` / `abil.stamina` 에 반영한다(`manual:true` 면 손으로 매긴 값 유지) |
| `gender` | `남`\|`여`\|`null` | 성별(선택). 평가 기준표가 남/여로 갈린다 |
| `skillUpdatedAt` / `skillUpdatedBy` | string \| null | 종합 실력이 누구 평가로 언제 바뀌었는지 |
| `abilUpdatedAt` / `abilUpdatedBy` | string \| null | 간단 체크 6항목의 평가 메타 |
| `active` | boolean | 비활동 회원은 출석·라인업 후보에서 제외 |
| `createdAt` | ISO string | |

**v1.0 에서 사라진 필드: `team`** (A~F 내부 소속 팀). 되살릴 계획 없음 — 상대는 외부 클럽만이다.

## 3. Match — 경기 / 오늘 자리

우리팀 탭의 "오늘 출석"은 **오늘 날짜의 Match 한 건**에 쌓인다(`store.matches.today({create})` — 첫 체크 때 만든다).
덕분에 v0.7 까지 쌓인 경기별 출석 기록과 출석률(`stats.attendance`)이 그대로 이어진다.

| 필드 | 타입 | 단계 | 설명 |
|---|---|---|---|
| `id` | string | S1 | `g_xxx` |
| `date` / `time` / `place` | string | S1 | `2026-09-29` / `20:00` / 장소 |
| `status` | `예정`\|`확정`\|`종료` | S1 | |
| `attendance` | `{ [memberId]: "in"\|"out"\|"maybe" }` | S1 | 키가 없으면 미응답 |
| `home` | boolean | **S2** | 홈/원정. 기본 `true`(홈) |
| `opponentId` | string \| null | **S2** | 상대 클럽 카드 id. 상대 카드를 지우면 `null` 로 풀린다(경기 자체는 안 지워짐) |
| `lineup` | `{ formation, slots: (memberId\|null)[] }` \| null | **S2/S3** | `formation` 은 `FORMATION_PRESETS` 중 하나(store.js). `slots` 길이·순서는 `formationSlots(formation)` 의 포지션 목록과 1:1 — S2 는 포지션별 목록 배치만, 좌표 배치는 S3 |
| `result` | `{ gf, ga }` \| null | **S2** | 득실(0 이상 정수). 상대 전적 계산의 근거 |
| `scorers` | `[{ memberId, count, assistId }]` | **S2** | 득점자·개수·도움(선택). `assistId` 는 S2 에서 새로 추가된 칸(마스터플랜 "득점자·도움 선택") |
| `review` | string | **S2** | 경기 총평 |
| `createdAt` | ISO string | S1 | |

**v1.0 에서 사라진 필드**: `teamCount` · `teams` · `teamPlan`(내부 팀 묶음 제안 상태).

## 3-1. Opponent — 상대 클럽 카드 (**S2, 2026-09-29 구현**)

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | string | `o_xxx` |
| `name` | string | 상대 클럽 이름 |
| `formation` | string | `FORMATION_PRESETS`(`4-4-2`·`4-3-3`·`3-5-2`·`4-2-3-1`·`5-3-2`) 중 하나 또는 "기타" 직접 입력 문구. 전술보드(S3)에서 상대 배치의 근거 |
| `keyPlayers` | string | 핵심 선수 메모 (자유 텍스트 — 사장님 확정: 상대 정보는 메모 수준) |
| `strengths` / `weaknesses` | string | 강점 / 약점 메모 |
| `notes` | `[{ at, text }]` | 경기 때마다 덧붙이는 짧은 메모. 카드 상세에서 계속 쌓인다 |
| `record` | `{ w, d, l, gf, ga }` | 전적 — **`store.js computeRecordFor()` 가 경기 기록(`match.opponentId`+`match.result`)에서 매번 다시 센다. `opponents.update()` 에 넘겨도 무시된다** (직접 입력 금지 원칙을 코드로 강제) |
| `createdAt` / `updatedAt` | ISO string | |

카드를 지워도(`store.opponents.remove`) 경기 기록은 남고 `match.opponentId` 만 `null` 로 풀린다 — 데이터 손실 0 원칙.
`store.opponents.matchesOf(id)` 로 카드 상세에서 경기 이력 목록을 보여준다(최신순).

## 4. Tactic — 전술 (**S3 에서 새 엔진으로 재정의**)

v0.x 전술판 스키마(`{id, matchId, team, teamLabel, formation, pins[], strokes[], note}`)는
`dev/parked/tactics-v0.x.js` 와 함께 보류했다. 기존 데이터는 `state.tactics` 에 그대로 남겨 두고 건드리지 않는다.
S3 의 새 보드는 **우리 라인업 + 상대 포메이션 겹치기**가 들어가므로 `opponentId`·`boardSnapshot` 을 포함해 다시 정의한다.

## 4.5 AI 설정 — **앱 데이터와 분리 저장**

AI 설정은 `state` 에 **넣지 않는다**. localStorage 의 **다른 키**(`woosulsan-fc:ai`)에 따로 저장한다.

```jsonc
// localStorage["woosulsan-fc:ai"]  ← JSON 내보내기에 포함되지 않음
{ "key": "sk-ant-...", "model": "claude-sonnet-5" }
```

| 필드 | 설명 |
|---|---|
| `key` | Anthropic API 키. **이 기기 브라우저에만** 저장. 저장소·코드·로그·내보내기 JSON 어디에도 포함 금지 |
| `model` | `claude-sonnet-5`(기본) 또는 `claude-haiku-4-5`(절약) |

- 내보내기(`exportJSON`)는 `state` 만 직렬화하므로 키가 섞일 수 없다(테스트 `dev/test-ai.mjs` 가 검증).
- 호출은 브라우저에서 `https://api.anthropic.com/v1/messages` 로 직접, 헤더는
  `x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true`.
- 컨텍스트로는 회원(이름·실력·포지션·출석률)과 경기 요약만 보낸다. 연락처 등 민감 필드가 생기면 `memberBrief()` 에서 제외할 것.
- v1.0 에서 내부 팀 나누기 프롬프트(`teamCoachPrompt`)는 기능과 함께 제거. S5 에서 "상대 카드 + 우리 라인업" 코치로 다시 들어온다.

## 5. 마이그레이션 규칙 (store.js `migrate()`)

### 5-1. schema 2 → 3 (v0.7 → v1.0) — **데이터 손실 0 이 조건**

1. **올리기 직전 자동 백업 1회**: `localStorage["woosulsan-fc:backup-v0.7"]` 에
   `{ app, backupOf:'v0.7', fromSchema, savedAt, members, data:<옛 상태 전체> }` 를 통째로 넣는다.
   이미 있으면 **덮어쓰지 않는다**(두 번째 실행에서 "이미 올라간 데이터"로 갈아치우면 되돌릴 게 없어진다).
2. 보존: 회원(이름·포지션·GK·출생년도·성별·`abil`·`tests`·활동 여부·평가 메타)·출석 기록·출석률·
   클럽명·평가 기준표·측정 경계값·한 팀 인원·AI 키(원래 별도 키).
3. 제거: `member.team` / `club.teamNames`·`teamOrder`·`teamAliases`·`mixedTeams`·`lockWomen`·`coaches`·`mixedFactor` /
   `match.teamCount`·`teams`·`teamPlan`.
4. 복원 경로(화면): 우리팀 탭 상단 안내 카드와 설정에 **"옛 데이터 받기"**(백업 JSON 파일 다운로드)와
   **"v0.7 백업에서 되돌리기"**(`store.restoreLegacy()` = 전체 교체)가 있다.
   되돌려도 스키마는 v1.0 이므로 팀 배정은 다시 붙지 않는다 — 회원·출석·능력치가 돌아온다.
   내려받은 JSON 파일에는 옛 팀 배정까지 그대로 들어 있다.
5. 검증: `node dev/test-migrate.mjs` (회원 수·보존 필드 동일 / 팀 값 제거 / 백업·복원 / 가져오기=합치기).

### 5-2. 상시 규칙

- `member.birthYear` 없으면 `null`. 잘못된 값도 `null` 로 정규화된다.
- `member.abil` 없으면 6항목 모두 `null`. 1~5 밖의 값·문자도 `null`(`normalizeAbil`).
- `member.gender` 없으면 `null`. `tests` 의 모르는 키는 버린다(`normalizeTests`).
- `club.rubric`·`club.tests` 는 저장된 문구를 살리고 빠진 칸만 기본값으로 채운다.
- `club.squadSize` 는 `SQUAD_SIZES`(5·6·7·9·11) 중 하나가 아니면 11 로 되돌린다.
- 알 수 없는 필드는 버려지므로, 새 필드는 반드시 `normalizeMember` / `normalizeMatch` 에 추가할 것.

## 6. Firestore 이관 시 대응 (예정)

```
clubs/{clubId}                    name, adminUids[]
  members/{memberId}              name, skill, gk, pos, abil, tests, active
  opponents/{opponentId}          name, formation, keyPlayers, strengths, weaknesses, record{}
  matches/{matchId}               date, time, place, status, opponentId, lineup{}, result{}, scorers[], review
    votes/{memberId}              status(in/out/maybe), ts      ← 지금의 match.attendance
    boards/{boardId}              formation, ourPins[], oppPins[], strokes[], snapshot
```
- 지금의 `match.attendance` 맵은 회원 배포 단계에서 `votes` 서브컬렉션으로 분리한다(동시 쓰기 충돌 방지).
- JSON 내보내기 파일이 그대로 이관 입력이 된다 (`{ app, exportedAt, data: <상태 전체> }`).

## 7. 명단 붙여넣기 (roster.js)

카톡 투표 결과·댓글을 그대로 붙여넣으면 번호·이모지·참석/불참 구분·쉼표 나열을 정리해
`{ in[], out[], maybe[], info{} }` 로 돌려준다. `info[이름]` 에는 줄에서 읽은 `pos·gk·gender·birthYear` 가 담겨
새 회원으로 추가할 때 그대로 쓰인다. 적용 대상은 **오늘 자리**(`matches.today`)다.

## 8. 권한 3등급 (회원 배포 단계 설계, 미구현)

지금은 사장님 혼자 쓰는 단독 앱이라 모든 편집이 운영자 권한이다.
규칙 초안은 `dev/firestore.rules.draft` 에 있다. v1.0 에서 **팀 감독 등급은 사라졌다**(내부 팀이 없으므로).

| 대상 | 운영자(owner) | 회원(member, 본인만) |
|---|---|---|
| 회원 추가·삭제·이름 | O | X |
| 종합 실력(`skill`)·간단 체크(`abil`)·측정(`tests`) | O | 자기평가는 `selfAbil` 로 분리 |
| 출생년도·성별·선호 포지션 | O | **O** (본인) |
| GK 가능·활동 여부 | O | X |
| 출석 체크 | O | **O** (본인 참석/불참) |
| 상대 카드·경기 기록·라인업 | O | 읽기만 |
| 전술보드 | O | 읽기만 |

## 9. 일괄 추가 파서 (`parseMemberLine`)

한 줄을 토큰(공백·쉼표·슬래시·괄호)으로 나눈 뒤 종류별로 읽는다. 순서는 상관없다.

| 종류 | 예 | 결과 |
|---|---|---|
| 출생년도 | `95`, `1995` | `birthYear` (2자리는 19xx/20xx 보정) |
| 성별 | `여`, `남`, `F`, `M` | `gender` |
| 포지션 | `포워드`, `미들`, `센터백`, `레프트 윙`, `GK` | `pos` (+ GK면 `gk:true`) |
| 나머지 | `한가람` | `name` |

- **v1.0: 줄 맨 앞 팀 약자 읽기는 사라졌다.** 앞에 떨어져 남은 **한 글자**가 흔한 성(姓)이 아니면
  군더더기로 보고 떼어 내고 `unknownLead` 로 알려 준다 (`체 한가람` → `한가람`, 미리보기에 "앞 글자 "체" 는 뺐습니다").
  성이면 이름의 일부로 둔다(`홍 길동`, `장 홍길동`). 두 글자 이상 앞말은 절대 건드리지 않는다(`교역 홍길동`).
- 두 단어 포지션(`레프트 윙`·`라이트 백`·`센터 백`)은 앞말(레프트/라이트/센터/사이드)을 수식어로 소비해 합쳐 읽는다.
- **토큰이 따로 떨어져 있을 때만** 포지션으로 본다 → `김수비`·`박미들` 같은 이름은 건드리지 않는다.
- 포지션이 둘 이상이면 첫 번째만 쓰고 나머지는 미리보기에 "무시"로 표시한다.

### 9-1. 이름 정리 도구 (`analyzeMemberName`)

`analyzeMemberName(name)` 이 이름 한 칸을 통째로 분석해 돌려준다.

| 반환 | 뜻 |
|---|---|
| `name` | 정리된 이름 |
| `pos` / `gk` / `gender` / `birthYear` | 이름에서 읽어낸 값 |
| `reasons[]` | 왜 후보인지 — `구분기호`·`공백`·`앞 글자`·`포지션`·`성별`·`출생년도` (화면의 "읽은 것:" 줄) |
| `changed` | 정리할 게 있는지 |

- 체크박스 기본값은 "이름이 바뀌면 켬". 각 행은 **이름·포지션을 그 자리에서 고쳐** 적용할 수 있고, 몇 번이든 다시 돌릴 수 있다.
- 같은 분석기를 회원 폼 저장에도 쓴다 → 이름 칸에 `김하나 95 여 포워드` 를 통째로 넣어도 갈라서 채운다.

## 10. 화면 ↔ 데이터 (S1 기준)

| 탭 | 화면 | 읽는 것 | 쓰는 것 |
|---|---|---|---|
| 우리팀 | 명단·포지션·능력치·오늘 출석·"오늘 가능" 필터 | `members`, `matches.today()`, `stats.attendance` | `members.*`, `matches.setAttendance` |
| 상대팀 | 클럽 카드 목록·상세(메모·경기 이력) | `opponents.all()`, `opponents.matchesOf()` | `opponents.add/update/remove/addNote` |
| 전술보드 | 자리표시 (S3 준비 중) | — | — |
| 경기 | 목록·만들기·라인업·결과 입력 | `matches.sorted()`, `opponents.all()`, `members.active()` | `matches.add/update/remove` (저장할 때마다 상대 전적 자동 재계산) |

- 버전 스탬프: `app.js APP_VERSION` = `store.js`/`env.js`/`drafts.js` 의 `MODULE_VERSION` = `sw.js VERSION`.
  네 값이 어긋나면 부팅 때 `checkModuleVersions()` 가 캐시를 비우고 다시 받는다. 화면 표식은 상단 우측(`#topbar-sub`).
