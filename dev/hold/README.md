# 보류 (2026-09-22 사장님 지시: "복잡해지니 내가 다 관리할 수 있는 걸로, 단계를 밟자")

v1.0 서버 연결(Firebase)과 v0.6 상대 클럽 링크 공유는 **둘 다 보류**한다.
라이브 앱에는 단독 사용 기능만 있고, 로그인·초대·"책임자" 류 안내는 화면에 없다.

## 여기 있는 것 (앱에 배선 안 됨, 커밋은 보관용)
| 파일 | 내용 |
|---|---|
| `cloud.js` | 공급자 추상화 기반 클럽 서버 계층(역할 판정·초대·승인·이관). 실제 SDK 없이 동작 |
| `cloudui.js` | 클라우드 모드 UI + 스토어 브리지(화면 코드는 로컬/클라우드 구분 없이 같은 API 사용) |
| `firebase-provider.js` | 실제 Firebase SDK 배선(CDN import). config 가 있을 때만 로드 |
| `firebase-config.js` | 설정 자리(값 null = 혼자 쓰기). 콘솔 값 붙여넣는 위치 |
| `firestore.rules` | 권한 3등급 실제 규칙 (dev/firestore.rules.draft 의 완성본) |
| `firebase.json` / `firestore.indexes.json` / `firebaserc.json` | 배포 설정 (`.firebaserc` 는 확장자만 바꿔 보관) |
| `mock-provider.js` | Java 없이 e2e 하기 위한 메모리 Firestore/Auth + 규칙 시뮬레이션 |
| `test-cloud.mjs` | 3역할 e2e 49 PASS (운영자/책임자/회원, 권한 밖 거부 포함) |

## 검증까지 끝난 상태 (다시 켤 때 참고)
- `node dev/hold/test-cloud.mjs` → 49 PASS (import 경로만 `../../` 로 맞추면 그대로 돈다)
- 브라우저 목 백엔드로 운영자 흐름 10 PASS(로그인→이관 마법사→클럽 생성→역할 표시),
  책임자 흐름 9/10 PASS(초대 발급→수락→자기 팀만 평가→남의 팀 거부 토스트)
- 남아 있던 배선 항목: 실제 config, rules 배포·REST 실측, Hosting 배포,
  데스크톱 구글 실로그인 스모크, github.io 이사 안내 화면

## 되살릴 때
1. 이 폴더의 파일을 루트로 되돌린다(`firebaserc.json` → `.firebaserc`).
2. app.js 에 다시 배선한다: `initCloud()` 부트, 설정의 계정 카드, 역할 가드(isOwner),
   감독 평가 화면 기본 팀 = 내 팀. (이번에 만들었던 패치 내용은 이 README 의 표와 test-cloud.mjs 가 근거)
3. 모달 체인 주의: `closeModal()` 직후 다른 모달을 열면 popstate 경합으로 닫힌다 —
   `afterModalClose(fn)` 같은 헬퍼로 감싸야 한다(이번에 실제로 겪은 버그).

권한 3등급 표(dev/DATA_MODEL.md §9)와 `dev/firestore.rules.draft` 는 그대로 남겨 둔다 — 설계 근거 문서라서.
