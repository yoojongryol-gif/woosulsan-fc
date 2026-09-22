/* 웃을산 FC — 실제 Firebase 공급자 (cloud.js 의 provider 인터페이스 구현)
 *
 * 이 파일은 firebase-config.js 가 있을 때만 동적으로 import 된다(설정 없으면 앱은 로컬 단독 모드).
 * SDK 는 CDN 모듈을 그대로 쓴다 — 빌드 도구 없음 원칙 유지.
 *
 * 5959에서 얻은 교훈 두 가지를 그대로 적용한다:
 *  1) 구글 로그인 주소 통일: 리디렉트 도메인과 앱 주소가 다르면 iOS standalone(홈 화면 앱)에서
 *     로그인 후 세션이 유실된다 → 앱은 항상 <projectId>.firebaseapp.com 에서 연다.
 *     (github.io 는 안내 화면만 두고 실제 앱은 이쪽으로 보낸다.)
 *  2) 오프라인 persistence 는 켜지 않는다 — 여러 기기·역할(운영자/책임자/회원)이 같은 문서를 보는 구조에서
 *     로컬 캐시가 권한 변경보다 앞서면 "보이는데 저장 안 되는" 혼란이 생긴다. 대신 cloud.js 가
 *     마지막 스냅샷을 localStorage 에 캐시해 첫 화면만 빠르게 그린다.
 */

const SDK = 'https://www.gstatic.com/firebasejs/11.3.1';

export async function createFirebaseProvider(config) {
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);

  const app = initializeApp(config);
  const authInst = auth.getAuth(app);
  const db = fs.getFirestore(app);

  const ref = (path) => (path.length % 2 === 0
    ? fs.doc(db, ...path)
    : fs.collection(db, ...path));

  const shape = (u) => (u ? { uid: u.uid, displayName: u.displayName || null, isAnonymous: !!u.isAnonymous } : null);

  return {
    _app: app, _db: db, _auth: authInst,
    auth: {
      onChange(cb) { return auth.onAuthStateChanged(authInst, (u) => cb(shape(u))); },
      async signInGoogle() {
        const provider = new auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        // 팝업이 막히는 환경(iOS standalone 등)에서는 리디렉트로 넘어간다.
        try {
          const res = await auth.signInWithPopup(authInst, provider);
          return shape(res.user);
        } catch (e) {
          if (['auth/popup-blocked', 'auth/popup-closed-by-user', 'auth/operation-not-supported-in-this-environment'].includes(e.code)) {
            await auth.signInWithRedirect(authInst, provider);
            return null; // 리디렉트 복귀 후 onAuthStateChanged 가 처리
          }
          throw e;
        }
      },
      async signInAnonymous() {
        const res = await auth.signInAnonymously(authInst);
        return shape(res.user);
      },
      async signOut() { return auth.signOut(authInst); },
      async resolveRedirect() {
        try { const r = await auth.getRedirectResult(authInst); return shape(r?.user); }
        catch (e) { console.warn('[auth] redirect 결과 없음', e?.code); return null; }
      },
    },
    db: {
      async getDoc(path) {
        const snap = await fs.getDoc(ref(path));
        return snap.exists() ? snap.data() : null;
      },
      async setDoc(path, data) { return fs.setDoc(ref(path), data); },
      async updateDoc(path, patch) { return fs.updateDoc(ref(path), patch); },
      async deleteDoc(path) { return fs.deleteDoc(ref(path)); },
      onDoc(path, cb) {
        return fs.onSnapshot(ref(path), (snap) => cb(snap.exists() ? snap.data() : null),
          (err) => console.warn('[fs] onDoc', path.join('/'), err.code));
      },
      onCollection(path, cb) {
        return fs.onSnapshot(ref(path), (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
          (err) => console.warn('[fs] onCollection', path.join('/'), err.code));
      },
      /** 내 uid 가 속한 클럽 찾기 — rules 상 클럽 열거가 막혀 있으므로 로컬 캐시/초대 경로로 해결한다.
       *  (운영자·책임자는 로그인 기기에 clubId 가 캐시되고, 없으면 초대 링크로 들어온다.) */
      async findClubForUid() { return null; },
    },
  };
}

/** firebase-config.js 가 있으면 로드해서 설정을 돌려준다 (없으면 null → 로컬 단독 모드) */
export async function loadConfig() {
  if (globalThis.__FC_FIREBASE_CONFIG__) return globalThis.__FC_FIREBASE_CONFIG__;
  try {
    const mod = await import('./firebase-config.js');
    return mod.firebaseConfig || mod.default || null;
  } catch (e) {
    return null; // 설정 파일 없음 = 아직 로컬 단독 모드
  }
}
