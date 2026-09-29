# 축구&joy (저장소·URL 은 woosulsan-fc 그대로)

우리팀 관리 + 상대 전력 대비 전술보드 PWA. 빌드 도구 없음(단일 HTML + ES 모듈), 외부 의존성 0.

- 라이브: https://yoojongryol-gif.github.io/woosulsan-fc/
- 저장: 지금은 localStorage 어댑터 1개(`store.js`). 나중에 같은 인터페이스로 Firestore 어댑터 교체 가능.
- 백업/이관: 우리팀 탭 하단 설정 → JSON 내보내기 / 가져오기 (**가져오기는 합치기가 기본**).
- AI 기능(선택): 설정 → AI 설정에 본인 Anthropic API 키 입력. 키는 이 기기에만 저장되고 내보내기 JSON에 포함되지 않는다.

## v1.0 개편 (2026-09-29)

내부 5팀(교역·장년·청년·체육·학생) 구조를 걷어내고 **상대는 외부 클럽만** 두는 구조로 바꿌다.
하단 탭은 **우리팀 · 상대팀 · 전술보드 · 경기** 4개.

| 단계 | 버전 | 내용 |
|---|---|---|
| S1 | `v1.0.0-alpha` | 5팀 구조 제거 + 마이그레이션(자동 백업·복원) + 우리팀 탭 완성 |
| S2 | `v1.0.0-beta` | 상대팀 카드 + 경기 기록 + 전적 누적 |
| S3 | `v1.0.0` | 전술보드 엔진 (준비 모드) |
| S4 | `v1.0.1` | 경기 모드(세로 폰·고대비·잠금·Wake Lock) + 핀 탭 교체 + 빠른 지시 프리셋 ← 지금 |
| S5 | `v1.1` | 팀·개인 훈련 프로그램 |

올릴 때 옛 데이터를 `localStorage["woosulsan-fc:backup-v0.7"]` 에 통째로 남긴다 →
화면에서 **파일로 받기 / 되돌리기** 가능. 자세한 규칙은 `dev/DATA_MODEL.md` 5장.

## 파일
| 파일 | 역할 |
|---|---|
| `index.html` | 앱 셸(하단 탭 4개) |
| `app.js` | 화면 렌더·이벤트 |
| `store.js` | 저장 계층 어댑터(localStorage) · 스키마 · 마이그레이션 |
| `ai.js` | AI 기능 (Anthropic Messages API 브라우저 직접 호출) |
| `roster.js` | 카톡 명단 붙여넣기 파서 · 회원 매칭 |
| `env.js` / `drafts.js` | 실행 환경 안내 · 입력 초안 보호 |
| `sw.js` | 서비스워커 — network-first + 버전 스탬프 캐시명 |
| `dev/DATA_MODEL.md` | 데이터 모델 · 마이그레이션 · 권한 설계 |
| `dev/parked/` | 앱에 배선되지 않은 보류 모듈 (v0.7 팀 구조·전술판 v0.x 등) |

## 개발
```
node dev/test-migrate.mjs   # v0.7 → v1.0 마이그레이션 (데이터 손실 0)
node dev/test-core.mjs      # 스토어·출석·나이·능력치·측정 환산
node dev/test-opponent.mjs  # S2: 상대팀 카드·경기 기록·전적 자동 계산·백업 왕복
node dev/test-position.mjs  # 이름/포지션 파서
node dev/test-roster.mjs    # 카톡 명단 파서·회원 매칭
node dev/test-import.mjs    # 백업 가져오기(합치기 기본)·명단 텍스트
node dev/test-ai.mjs        # AI 모듈(fetch 목)
node dev/test-env.mjs       # 실행 환경 판정
node dev/test-date.mjs      # 기기(한국) 날짜 기준
node dev/make-icons.mjs     # 아이콘 PNG 생성
python dev/serve.py 5178    # 로컬 미리보기 (no-store)
```
