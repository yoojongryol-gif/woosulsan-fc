# 축구&joy 데이터 모델 (schema 2, v0.5.7)

> **앱 이름 vs 클럽 이름** (v0.5.7, 2026-09-22 사장님)
> - `APP_NAME = '축구&joy'` (app.js) — 앱 자체의 이름. 제목표시줄·헤더·manifest·설정 하단·공유 이미지 푸터·파일명·AI 프롬프트·`exportJSON().app`.
> - `club.name` (기본값 "웃을산 FC") — **모임 이름**. 팀 설정에서 편집하고, 공유 이미지·전술판 이미지의 머리글에 찍힌다(`store.club.name()` / `setName()`).
> - **바뀜 수 없는 것**: localStorage 키(`woosulsan-fc:*`), 저장소·URL, sw 캐시 접두 `woosulsan-fc-`. 이름이 아니라 **주소**라서 바꾸면 기존 데이터가 끊긴다.
> - `importJSON` 은 `app` 필드를 보지 않는다 → 옛 "웃을산 FC" 백업 파일도 그대로 들어온다.

저장은 `store.js` 어댑터 한 곳을 통해서만 이루어진다. 지금은 `LocalStorageAdapter`(키 `woosulsan-fc:v1`),
나중에 같은 인터페이스(`load()` / `save(state)` / `clear()`)를 가진 `FirestoreAdapter` 로 갈아끼우면 화면 코드는 그대로다.

## 1. 상태 전체 (localStorage 한 덩어리)

```jsonc
{
  "schema": 2,
  "club": {
    "name": "웃을산 FC",
    "teamNames": { "A": "A팀", "B": "번개", "C": "C팀", "D": "D팀" },  // 고정 소속 팀 4개 이름(편집 가능)
    "teamAliases": { "A": "교", "B": "장", "C": "청", "D": "체" },  // 일괄 추가에서 줄 맨 앞에 쓰는 1~2글자(편집 가능)
    "mixedTeams": ["D"],      // 혼성팀(여성 회원 소속). 기본값 = 체육(D)
    "lockWomen": true,        // 여성 회원 혼성팀 고정 (기본 ON, 팀 탭 토글)
    "coaches": { "A": "m_x1", "B": null, "C": null, "D": null }  // 팀별 감독 memberId (감독의 단일 출처)
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
| `skill` | 1~5 (소수 1자리) | **종합 실력 — v0.5.6부터 자동 계산**. `abil` 6항목 중 입력된 것들의 평균(`effectiveSkill()`). 하나도 입력이 없으면 예전 수동 값(기본 3)을 그대로 두고 화면에는 "미평가"로 표시한다(`isUnrated()`). 팀 전력합 = 구성원 skill 합 |
| `gk` | boolean | 골키퍼 가능 여부 (포지션과 별개) |
| `pos` | `FW`\|`MF`\|`DF`\|`GK` | 선호 포지션 1개 (복수 포지션은 미구현) |
| `team` | `A`\|`B`\|`C`\|`D`\|`null` | **고정 소속 팀**. `null` = 미배정 |
| `birthYear` | number \| null | 출생년도(선택). 2자리 입력은 `parseBirthYear()` 가 19xx/20xx 로 보정 — 20xx 로 봐서 15세 이상이면 20xx, 아니면 19xx(19xx 가 100세 초과면 다시 20xx). 표시는 **연 나이 = 올해 - 출생년도**("90년생 · 36세") |
| `abil` | object | **간단 체크 6항목** — `{speed, stamina, basic, shoot, defense, physical}`, 각 1~5 또는 `null`(미입력). 순서·이름 고정(`ABILITIES`). 팀 밸런스·합치기 점수에는 **쓰지 않는다**(종합 `skill` 만 사용). **v0.5.6부터 이 6항목의 평균이 곧 종합 `skill`** 이다 — 저장할 때마다 `normalizeMember()` 가 다시 계산하므로 종합을 따로 입력하는 자리는 없앴다(폼의 종합 칸은 읽기 전용, "세부 평균으로 채우기" 버튼은 제거) |
| `gender` | `남`\|`여`\|`null` | 성별(선택). 일괄 추가에서 `이영희 92 여` 처럼 출생년도와 순서 무관하게 파싱(`남/여/M/F`). 여성 회원은 혼성팀 고정 규칙의 대상 |
| `skillUpdatedAt` / `skillUpdatedBy` | string \| null | 종합 실력이 **누구 평가로 언제** 바뀌었는지. v0.5.6부터 종합은 평균이므로 `abil` 이 바뀔 때 같이 갱신된다 |
| `abilUpdatedAt` / `abilUpdatedBy` | string \| null | 간단 체크 6항목의 평가 메타 (같은 규칙) |
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
- **v0.5.4 마이그레이션**: 팀 이름이 옛 기본값(`A팀~D팀`)이면 새 기본값 `교역/장년/청년/체육` 으로 자동 갱신하고
  혼성팀이 비어 있으면 `체육(D)` 을 기본 지정한다. 사용자가 직접 바꾼 이름은 그대로 둔다.
- 화면에는 내부 키(A~D)를 절대 노출하지 않는다 — 항상 `club.teamName(k)` / `club.teamAlias(k)` 로만 표시.
- `club.coaches` 없으면 `{A:null,B:null,C:null,D:null}`. 회원을 삭제하면 그 회원이 맡던 감독 자리는 자동으로 비워진다.
- 감독은 **회원 문서에 role 을 두지 않는다**. `club.coaches` 가 단일 출처이고, 화면의 감독 뱃지는 여기서 파생된다.
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

## 9. 권한 3등급 (3단계 Firestore rules 근거)

지금(1~2단계)은 사장님 혼자 쓰는 단독 앱이라 모든 편집이 운영자 권한이다.
아래 표는 회원 배포(3단계) 때 적용할 설계이며, 규칙 초안은 `dev/firestore.rules.draft` 에 있다.

| 대상 | 운영자(owner) | 감독(coach, 자기 팀만) | 회원(member, 본인만) |
|---|---|---|---|
| 회원 추가·삭제·이름 | O | X | X |
| 소속 팀(`team`) | O | X | X |
| 종합 실력(`skill`) | O | **O** (자기 팀 선수) | X |
| 간단 체크(`abil`) | O | **O** (자기 팀 선수) | 자기평가는 `selfAbil` 로 분리 |
| 출생년도·성별·선호 포지션 | O | X | **O** (본인) |
| GK 가능·활동 여부 | O | X | X |
| 출석 체크 | O | **O** (자기 팀 대리 체크) | **O** (본인 참석/불참) |
| 경기 생성·팀 확정 | O | X | X |
| 전술판 | O | **O** | 읽기만 |
| 팀 이름·혼성팀·감독 지정 | O | X | X |

- 감독 평가에는 `skillUpdatedBy: "coach:<팀키>"` 가 남는다(누가 고쳤는지 추적).
- 감독이 다른 팀으로 이적하면 `club.coaches` 는 그대로이므로 앱이 노란 안내를 띄우고, 운영자가 팀·감독 설정에서 정리한다.
- 회원 자기평가(`selfAbil`)는 감독·운영자 평가(`abil`)와 **다른 필드**로 저장해 덮어쓰기 분쟁을 막는다(3단계 구현 예정).

## 10. 감독 평가 화면 (v0.5.1)

회원 탭 → "🎽 감독 평가 화면". 팀을 고르면 그 팀 선수만 세로로 나열되고,
**v0.5.6**: 종합 실력이 평균 자동이 되면서, 행은 처음부터 펼쳐진 상태로 **간단 체크 6항목**을 바로 보여 준다.
점 1~5 를 누르면 폼을 열지 않고 즉시 저장되고, 행 오른쪽 "종합" 배지가 그 자리에서 다시 계산된다
(미입력이면 "미평가"). 평가 메타(`abilUpdatedAt/By`, `skillUpdatedAt/By`)는 자동 기록.
사장님이 감독에게 폰을 건네거나, 감독 말을 들으며 빠르게 채우는 용도(로그인은 3단계).

## 11. 일괄 추가 파서 (v0.5.3)

`parseMemberLine(line, { teamNames })` 는 한 줄을 토큰(공백·쉼표·슬래시·괄호)으로 나눈 뒤 종류별로 읽는다.
순서는 상관없다.

| 종류 | 예 | 결과 |
|---|---|---|
| 팀 약자(줄 맨 앞) | `체`, `체육`, `D` | `team` — `club.teamAliases`(기본 교·장·청·체) → 팀 이름 → 내부 키 순으로 매칭 |
| 출생년도 | `95`, `1995` | `birthYear` (2자리는 19xx/20xx 보정) |
| 성별 | `여`, `남`, `F`, `M` | `gender` |
| 포지션 | `포워드`, `미들`, `센터백`, `레프트 윙`, `GK` | `pos` (+ GK면 `gk:true`) |
| 나머지 | `진혜린` | `name` |

- 두 단어 포지션(`레프트 윙`·`라이트 백`·`센터 백`)은 앞말(레프트/라이트/센터/사이드)을 수식어로 소비해 합쳐 읽는다.
- **토큰이 따로 떨어져 있을 때만** 포지션으로 본다 → `김수비`·`박미들` 같은 이름은 건드리지 않는다.
- 포지션이 둘 이상이면 첫 번째만 쓰고 나머지는 미리보기에 "무시"로 표시한다.
- 실제 입력 예: `교 진혜린 95 여 포워드` → 이름 진혜린 / A팀 / 1995 / 여 / FW.
- 이미 이름에 포지션이 섞여 저장된 회원은 회원 탭 배너 → "분리하기" 로 정리한다.

### 11-1. 이름 정리 도구 (`analyzeMemberName`, v0.5.6)

2026-09-22 실증: "분리하기" 를 눌러도 이름이 `체 진혜린`, `교 박관식` 처럼 **앞 약자 한 글자 + 공백**이 남았다.
로컬 재현으로 확인한 원인은 두 가지다.

1. 앞 버전이 이미 포지션을 떼어 `pos` 를 채워 둔 회원은 도구가 "포지션 유지" 로 보고
   **체크박스를 꺼진 채** 보여 줬다 → 적용에서 통째로 빠졌다.
2. `체이영희` 처럼 약자가 **붙어 있는** 이름은 후보로도 잡히지 않았다.

`analyzeMemberName(name, { teamNames, teamAliases })` 가 이름 한 칸을 통째로 분석해 돌려준다.

| 반환 | 뜻 |
|---|---|
| `name` | 정리된 이름 |
| `team` / `pos` / `gk` / `gender` / `birthYear` | 이름에서 읽어낸 값 |
| `reasons[]` | 왜 후보인지 — `구분기호`·`공백`·`팀 약자`·`포지션`·`성별`·`출생년도`·`붙은 약자` (화면의 "읽은 것:" 줄) |
| `glued` | 약자가 공백 없이 붙어 있어 **추정**인 경우(사용자 확인 필요) |
| `changed` | 정리할 게 있는지 |

- 이름 앞 팀 글자는 `team`·`pos` 가 이미 지정돼 있든 말든 **항상 후보**이고, 체크박스 기본값은 "이름이 바뀌면 켬".
- 적용하면 약자를 떼고 그 팀으로 배정한다. 이미 다른 팀이면 행에 충돌 표시를 남기고 팀 선택을 그대로 둔다.
- 각 행은 **이름·팀·포지션을 그 자리에서 고쳐** 적용할 수 있고, 도구는 몇 번이든 다시 돌릴 수 있다.
- 배너 문구: "이름 앞에 팀 글자가 남은 회원 N명".
- 같은 분석기를 회원 폼 저장에도 쓴다 → 이름 칸에 `체 김하나 95 여 포워드` 를 통째로 넣어도 갈라서 채운다.
