# 웃을산 FC

축구 모임 관리 PWA — 회원(고정 4팀 소속)·출석·팀 합치기·전술판. 빌드 도구 없음(단일 HTML + ES 모듈), 외부 의존성 0.

- 라이브: https://yoojongryol-gif.github.io/woosulsan-fc/
- 저장: 지금은 localStorage 어댑터 1개(`store.js`). 나중에 같은 인터페이스로 Firestore 어댑터 교체 가능.
- 백업/이관: 회원 탭 하단 → JSON 내보내기 / 가져오기.

## 파일
| 파일 | 역할 |
|---|---|
| `index.html` | 앱 셸(5탭) |
| `app.js` | 화면 렌더·이벤트·PNG 내보내기 |
| `store.js` | 저장 계층 어댑터(localStorage) |
| `balance.js` | 팀 자동 밸런스 알고리즘(순수 함수) |
| `tactics.js` | 전술판(포메이션·핀·그림판) |
| `sw.js` | 서비스워커 — network-first + 버전 스탬프 캐시명 |
| `dev/DATA_MODEL.md` | 데이터 모델 (Firestore 이관 대비) |

## 개발
```
node dev/test-core.mjs     # 코어 로직 테스트
node dev/make-icons.mjs    # 아이콘 PNG 생성
python -m http.server 5177 # 로컬 미리보기
```
