/* 웃을산 FC — Firebase 설정
 *
 * ⚠ 사장님이 콘솔에서 받은 값을 여기에 붙여넣으면 클럽 모드가 켜집니다.
 *   Firebase 콘솔 → 프로젝트 설정 → 일반 → "내 앱" → 웹 앱 → firebaseConfig 복사
 *
 *   export const firebaseConfig = {
 *     apiKey: "...",
 *     authDomain: "woosulsan-fc.firebaseapp.com",
 *     projectId: "woosulsan-fc",
 *     storageBucket: "woosulsan-fc.firebasestorage.app",
 *     messagingSenderId: "...",
 *     appId: "...",
 *   };
 *
 * 값이 null 이면 앱은 지금처럼 "혼자 쓰기(이 기기 저장)" 로만 동작합니다.
 * (이 파일의 값은 공개되어도 되는 클라이언트 설정입니다. 권한은 firestore.rules 가 지킵니다.)
 */
export const firebaseConfig = null;
