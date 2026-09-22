# 웃을산 FC 데이터 모델 (schema 2, v0.5.0)

저장은 `store.js` 어댑터 한 곳을 통해서만 이루어진다. 지금은 `LocalStorageAdapter`(키 `woosulsan-fc:v1`),
나중에 같은 인터페이스(`load()` / `save(state)` / `clear()`)를 가진 `FirestoreAdapter` 로 갈아끼우면 화면 코드는 그대로다.

## 1. 상태 전체 (localStorage 한 덩어리)

```jsonc
{
  "schema": 2,
  "club": {
    "name": "웃을산 FC",
    "teamNames": { "A": "A팀", "B": "번개", "C": "C팀", "D": "D팀" },  // 고정 소속 팀 4개 이름(편집 가능)
    "mixedTeams": ["D"],      // 혼성팀(여성 회원 소속) 키 목록, 1개 이상 가능
    "lockWomen": true         // 여성 회원 혼성팀 고정 (기본 ON, 팀 탭 토글)
  },
  "members": [ /* Member */ ],
  "matches": [ /* Match */ ],
  "tactics": [ /* Tactic */ ],
  "updatedAt": "2026-09-22T03:00:00.000Z"
}
```

## 2. Member — 회원 (고정 소속 팀)

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | string | `m_xxx` |
| `name` | string | 이름 (일괄 추가 시 중복 이름은 건너뜀) |
| `skill` | 1~5 | 실력. 팀 전력합 = 구성원 skill 합 |
| `gk` | boolean | 골키퍼 가능 여부 (포지션과 별개) |
| `pos` | `FW`\|`MF`\|`DF`\|`GK` | 선호 포지션 1개 (복수 포지션은 미구현) |
| `team` | `A`\|`B`\|`C`\|`D`\|`null` | **고정 소속 팀**. `null` = 미배정 |
| `birthYear` | number \| null | 출생년도(선택). 2자리 입력은 `parseBirthYear()` 가 19xx/20xx 로 보정 — 20xx 로 봐서 15세 이상이면 20xx, 아니면 19xx(19xx 가 100세 초과면 다시 20xx). 표시는 **연 나이 = 올해 - 출생년도**("90년생 · 36세") |
| `abil` | object | **간단 체크 6항목** — `{speed, stamina, basic, shoot, defense, physical}`, 각 1~5 또는 `null`(미입력). 순서·이름 고정(`ABILITIES`). 팀 밸런스·합치기 점수에는 **쓰지 않는다**(종합 `skill` 만 사용). 폼의 "세부 평균으로 종합 실력 채우기" 버튼이 평균을 반올림해 `skill` 에 넣어 준다(자동 아님) |
| `gender` | `남`\|`여`\|`null` | 성별(선택). 일괄 추가에서 `이영희 92 여` 처럼 출생년도와 순서 무관하게 파싱(`남/여/M/F`). 여성 회원은 혼성팀 고정 규칙의 대상 |
| `active` | boolean | 비활동 회원은 출석·팀 배분에서 제외 |
| `createdAt` | ISO string | |

## 3. Match — 경기

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | string | `g_xxx` |
| `date` / `time` / `place` | string | `2026-09-24` / `20:00` / 장소 |
| `status` | `예정`\|`확정`\|`종료` | 팀 확정 저장 시 `예정` → `확정` |
| `teamCount` | 2~4 | 오늘 실제로 뛴 팀 수 |
| `attendance` | `{ [memberId]: "in"\|"out"\|"maybe" }` | 키가 없으면 미응답 |
| `teams` | `string[][]` | **오늘의 팀** — 팀별 memberId 배열 |
| `teamPlan` | `{ mode, groups }` \| null | 오늘의 팀을 만든 방법 |

### teamPlan
- `mode: "merge"` — 고정 소속 팀을 묶어서 구성. `groups: [["A"],["B","D"],["C"]]`
  (`"none"` 은 미배정 회원 묶음). `teams[i]` 는 `groups[i]` 에 속한 참석자들.
- `mode: "shuffle"` — 소속을 무시하고 참석자를 새로 섞음. `groups: []`, 팀 이름은 `1조·2조…`.
- `labels: string[]` — 팀 표시 이름을 직접 지정(AI 팀 코치가 지은 "레드/블루/옐로" 등). 있으면 `groups` 라벨보다 우선.

## 4. Tactic — 전술판 (경기당 여러 장)

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` / `matchId` | string | |
| `team` | number | 대상 팀 인덱스. `0~3`=오늘의 팀, `100+i`=고정 소속 팀 A~D, `-1`=전체 참석자 |
| `teamLabel` | string | 저장 당시 팀 표시 이름 (이름이 바뀌어도 기록 유지) |
| `formation` | string | `4-3-3` 등 |
| `pins` | `[{ memberId, name, x, y, gk }]` | x·y 는 경기장 대비 % (0~100) |
| `strokes` | `[{ type, color, points }]` | `type`: `free`\|`line`\|`arrow`, `points`: `[[x,y],…]` % 좌표 |
| `note` | string | 전술 메모(AI 지시문 등) |
| `updatedAt` | ISO string | |

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
- 컨텍스트로는 회원(이름·실력·포지션·소속·출석률)과 경기 요약만 보낸다. 연락처 등 민감 필드가 생기면 `memberBrief()` 에서 제외할 것.

## 5. 마이그레이션 규칙 (store.js `migrate()`)

- `member.team` 이 없으면 `null`(미배정). 기존 v0.1~0.2 데이터는 그대로 열린다.
- `member.birthYear` 없으면 `null`(미입력). 잘못된 값도 `null` 로 정규화된다.
- `member.abil` 없으면 6항목 모두 `null`. 1~5 밖의 값·문자도 `null` 로 정규화된다(`normalizeAbil`).
- `member.gender` 없으면 `null`. `club.mixedTeams` 없으면 `[]`, `club.lockWomen` 없으면 `true`(기본 ON).
- `club.teamNames` 없으면 기본값 `A팀~D팀`.
- `match.teamCount` 가 범위를 벗어나면 2, `teamPlan` 없으면 `null`(옛 `teams` 는 merge 로 간주해 라벨만 `1조…`로 표시).
- `teamPlan.labels` 없으면 `[]` (라벨 없으면 `groups` 로 이름 생성).
- 알 수 없는 필드는 버려지므로, 새 필드는 반드시 `normalizeMember` / `normalizeMatch` 에 추가할 것.

## 6. Firestore 이관 시 대응 (예정)

```
clubs/{clubId}                    name, teamNames{A..D}, adminUids[]
  members/{memberId}              name, skill, gk, pos, team, active
  matches/{matchId}               date, time, place, status, teamCount, teams[], teamPlan{}
    votes/{memberId}              status(in/out/maybe), ts      ← 지금의 match.attendance
    tactics/{tacticId}            team, teamLabel, formation, pins[], strokes[]
```
- 지금의 `match.attendance` 맵은 회원 배포 단계에서 `votes` 서브컬렉션으로 분리한다(동시 쓰기 충돌 방지).
- `teams`/`teamPlan` 은 운영자만 쓰므로 문서 필드로 유지.
- JSON 내보내기 파일이 그대로 이관 입력이 된다 (`{ app, exportedAt, data: <상태 전체> }`).

## 7. 명단 붙여넣기 (roster.js, v0.5.0)

저장 데이터가 아니라 **입력 도우미**다. 출석 탭 → "카톡 명단 붙여넣기".

- `parseRoster(text)` → `{ in: [], out: [], maybe: [] }`
  - 구간 머리줄(`✅ 참석 (12)`, `불참:`), 줄별 표시(`홍길동 O` / `김철수 X` / `이영희 미정`),
    번호(`1.` `2)` `①`), 불릿, 이모지, 괄호 주석(`(늦참)`), 쉼표·슬래시 나열을 처리한다.
  - 한 글자·숫자·안내 문구(`이번주 경기 명단`, `총 3명`)는 이름에서 제외.
- `matchNames(names, members)` → 회원 매칭 단계: 완전일치 → 공백 제거 일치 → 성 제외 뒤 2글자 일치
  → (그래도 안 되면) 부분·초성 일치는 **후보로만** 제시해 사용자가 고른다. 비활동 회원은 제외.
- 적용 시: 매칭된 사람 `in`, 불참 섹션의 매칭된 사람 `out`, 명단에 없는 회원은 사용자가 고른 값(`불참`/`미정`/`그대로`).
  미등록 이름은 체크하면 신규 회원으로 추가(팀 미배정).
- AI 는 보조 수단이다(키가 있을 때만 "AI로 정리" 버튼). 기본 경로는 로컬 파서.

## 8. 혼성팀 규칙 (v0.5.0)

- 팀 이름 시트에서 팀마다 "혼성팀" 지정(1개 이상 가능). 팀 카드에 `남 N · 여 M` 과 `혼성` 표시.
- 팀 탭 상단 토글 **여성 회원 혼성팀 고정**(기본 ON)일 때:
  - 합치기 제안 → 소속 팀 단위 분할이라 여성이 흩어지지 않는다(구조적으로 충족).
  - 완전 새로 섞기 → `balanceTeams(..., { lock })` 로 여성 전원을 혼성팀이 든 묶음에 고정(hill climb 에서도 이동 금지).
  - AI 팀 코치 적용 → 여성이 흩어져 있으면 가장 많이 몰린 묶음으로 모아 보정하고 토스트로 알린다.
  - AI 프롬프트에 혼성팀·성별·고정 규칙을 함께 전달.
- 토글 OFF 면 성별을 전혀 보지 않는다. 수동 탭 스왑은 항상 자유.
- PNG 공유 이미지·전술 핀에는 성별을 표시하지 않는다.
