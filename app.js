/* 축구&joy — 앱 본체 (저장소·URL·localStorage 키는 woosulsan-fc 그대로)
 * v1.0 전면 개편(2026-09-29, S1): 내부 5팀 구조를 걷어내고 하단 탭을
 *   우리팀 · 상대팀 · 전술보드 · 경기 4개로 바꿌다.
 *   S1 은 우리팀 탭만 완성하고, 나머지 3개는 무엇이 들어올지 보여 주는 자리표시다.
 */
/* ---------- 링크 안전 import (v0.5.9) ----------
 * 배포 직후에는 app.js 만 새 버전이고 다른 파일은 옛 버전인 구간이 생긴다
 * (GitHub Pages 는 파일별로 갱신됨). 이때 `import { 새이름 } from` 은
 * 모듈 링크 단계에서 터져 앱이 통째로 안 뜼고(흰 화면), 버전 가드도 못 돌아간다.
 * 네임스페이스 import + 구조분해는 없는 이름을 undefined 로 남길 뿐이라
 * 가드가 돌아 캐시를 비우고 복구할 수 있다. 호출부는 그대로다.
 * → 앞으로 모듈에 새 export 를 추가할 때도 이 방식을 유지할 것.
 */
import * as STORE_NS from './store.js';
import * as ROSTER_NS from './roster.js';
import * as ENV_NS from './env.js';
import * as DRAFTS_NS from './drafts.js';
import * as AI from './ai.js';

const { createStore, LocalStorageAdapter, ageOf, ageLabel, parseBirthYear,
  ABILITIES, abilAvg, GENDERS, parseMemberLine, splitNamePosition, analyzeMemberName,
  effectiveSkill, isUnrated, MODULE_VERSION: STORE_VERSION,
  RUBRIC_GENDERS, rubricKeyFor, TESTS, testForAbil, parseTestInput, formatTestValue,
  localDateStr, FORMATION_PRESETS, formationSlots,
  layoutFormation, buildOurPins, buildOppPins, SET_PIECE_TEMPLATES, QUICK_INSTRUCTION_PRESETS,
  DRILL_CATEGORIES, DRILL_CATEGORY_KEYS, trainingSessionDrillMinutes,
  currentWeekMonday, weekLabel, weakestAbilities } = STORE_NS;
const { parseRoster, matchNames } = ROSTER_NS;
const { currentEnv, bannerFor, androidChromeIntent, readMeta, writeMeta, needsBackup, sinceLabel,
  moduleFixPlan, MODULE_VERSION: ENV_VERSION } = ENV_NS;
const { saveDraft, readDraft, clearDraft, hasAnyDraft, debounce, draftAgeLabel } = DRAFTS_NS;

export const APP_VERSION = 'v1.1.0';
/** 앱 이름 (2026-09-22 사장님 지시). 클럽 이름(store.club.name)과는 다른 값이다. */
export const APP_NAME = '축구&joy';

const store = createStore(new LocalStorageAdapter());
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ui = {
  tab: 'ourteam',
  memberQuery: '',
  memberFilter: 'all',   // all | today | unrated | gk
  memberSort: 'name',    // 'name' | 'age'
  showInactive: false,
  rosterDone: null,      // 명단 적용 결과 배너
  legacyHidden: false,   // v1.0 업데이트 안내를 이 화면에서 닫았나
  trainSub: 'team',      // 훈련 탭 하위 — 'team' | 'personal' (S5)
};

/* ================= 유틸 ================= */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function todayStr() { return localDateStr(); }   // v0.6.2: UTC 아님 — 기기(한국) 날짜
/* ---------- 평가 기준표 (v0.6.0) ----------
 * 사장님 2026-09-22: "남자와 여자 기준이 달라야 되는데 기준을 잡아놓고 평가를 해야 될 듯"
 * 회원의 성별에 맞는 기준표를 자동으로 붙여 준다. 성별 미입력은 남성 기준 + 노랑 표시.
 */
function rubricKeyOf(member) { return rubricKeyFor(member?.gender); }
function rubricBadge(member) {
  const key = rubricKeyOf(member);
  const g = RUBRIC_GENDERS.find((x) => x.key === key);
  const unknown = !member?.gender;
  return `<span class="rbadge${key === 'female' ? ' f' : ''}${unknown ? ' warn' : ''}">기준: ${esc(g.badge)}${unknown ? ' · 성별 미입력' : ''}</span>`;
}
/** 점 버튼 hover/길게누르기용 한 줄 */
function rubricLine(itemKey, level, member) {
  const label = ABILITIES.find((a) => a.key === itemKey)?.label || itemKey;
  const txt = store.club.rubricText(itemKey, level, rubricKeyOf(member));
  return `${label} ${level} — ${txt}`;
}
/**
 * 6항목 한 줄 (폼·감독 화면 공용)
 * 스피드·지구력은 측정 기록(20m 왕복 / 1.5km)이 있으면 점 대신 기록 칸을 보여 주고
 * 점수는 성별 경계값으로 자동 환산한다. 자물쇠를 풀면 손으로도 매길 수 있다.
 * @param rec  { sec, manual } 저장된 기록 (없으면 null)
 */
function abilRow(a, value, member, attr, rec) {
  const v = Number(value) || 0;
  const t = testForAbil(a.key);
  const locked = !!(t && rec && rec.sec != null && rec.manual !== true);
  const head = `<button type="button" class="nm nmbtn" data-rubric="${a.key}" aria-label="${esc(a.label)} 기준 보기">${esc(a.label)}${t ? `<i>${esc(t.label)}</i>` : a.hint ? `<i>${esc(a.hint)}</i>` : ''}<span class="q">?</span></button>`;
  const dots = `<span class="dots">
      ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="dot" data-v="${n}"
        aria-pressed="${v >= n}" aria-label="${esc(a.label)} ${n}점"
        title="${esc(rubricLine(a.key, n, member))}"></button>`).join('')}
      <button type="button" class="clr" data-v="0" aria-label="${esc(a.label)} 지우기">×</button>
    </span>`;
  if (!t) return `<div class="abil-row${v ? '' : ' empty'}" ${attr}>${head}${dots}</div>`;

  const val = rec && rec.sec != null ? (t.unit === 'mmss' ? formatTestValue(t.key, rec.sec) : String(rec.sec)) : '';
  const testBox = `<span class="tst">
      <input type="text" class="tin" data-test="${t.key}" value="${esc(val)}"
        inputmode="${t.unit === 'mmss' ? 'text' : 'decimal'}" placeholder="${esc(t.placeholder)}"
        aria-label="${esc(t.label)} 기록">${t.suffix ? `<span class="unit">${esc(t.suffix)}</span>` : ''}
      <span class="tauto${v ? '' : ' none'}" data-tauto="${t.key}">${v ? `${v}점` : '–'}</span>
      ${rec && rec.sec != null ? `<button type="button" class="tlock" data-tlock="${t.key}" aria-pressed="${locked}"
        title="${locked ? '기록으로 자동 계산 중 — 누르면 손으로 고칠 수 있습니다' : '손으로 매기는 중 — 누르면 기록 기준으로 되돌립니다'}">${locked ? '🔒' : '🔓'}</button>` : ''}
    </span>`;
  return `<div class="abil-row test${v ? '' : ' empty'}${locked ? ' locked' : ''}" ${attr}>
    ${head}${testBox}
    ${locked ? '' : dots}
  </div>`;
}
/** 한 항목의 5단계 기준을 보여 주는 시트 (현재 점수 강조, 눌러서 바로 평가) */
function rubricSheet(itemKey, member, current, onPick) {
  const a = ABILITIES.find((x) => x.key === itemKey);
  const key = rubricKeyOf(member);
  const rows = store.club.rubric(key)[itemKey];
  const g = RUBRIC_GENDERS.find((x) => x.key === key);
  openModal(`
    <h3>${esc(a.label)} 기준</h3>
    <div class="rsheet-head">${rubricBadge(member)}${member?.name ? `<span class="dim">${esc(member.name)}</span>` : ''}</div>
    ${rows.map((t, i) => `<button type="button" class="rlevel${current === i + 1 ? ' on' : ''}" data-lv="${i + 1}">
      <span class="lv">${i + 1}</span><span class="tx">${esc(t)}</span>
    </button>`).join('')}
    <div class="hint" style="margin-top:8px">기준 문구는 설정 → 평가 기준표에서 고칠 수 있습니다.</div>
    <div class="foot"><button class="btn ghost" data-act="close">닫기</button></div>`, (m) => {
    m.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="close"]')) return closeModal();
      const b = e.target.closest('[data-lv]');
      if (!b) return;
      const lv = Number(b.dataset.lv);
      // afterModalClose 가 이 시트를 닫는다 — 여기서 closeModal() 을 또 부르면 뒤에 있던 폼까지 닫힌다
      if (onPick) afterModalClose(() => onPick(lv));
      else closeModal();
    });
  });
}
/** 점을 길게 누르면 그 단계 설명을 한 줄로 띄운다 (폰에는 hover 가 없다) */
function bindLongPressRubric(root, memberOf) {
  let timer = null;
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
  root.addEventListener('touchstart', (e) => {
    const dot = e.target.closest('.dot[data-v]');
    const row = dot?.closest('[data-abil], [data-cabil]');
    if (!dot || !row) return;
    const itemKey = row.dataset.abil || String(row.dataset.cabil || '').split(':')[1];
    timer = setTimeout(() => { toast(rubricLine(itemKey, Number(dot.dataset.v), memberOf(row))); timer = null; }, 500);
  }, { passive: true });
  ['touchend', 'touchmove', 'touchcancel'].forEach((ev) => root.addEventListener(ev, clear, { passive: true }));
}

/** 설정 → 평가 기준표 (v0.6.0) — 남/여 탭, 6항목 × 5단계 문구 + 측정 경계값 */
function rubricModal(genderKey = 'male') {
  const g = genderKey === 'female' ? 'female' : 'male';
  const rows = store.club.rubric(g);
  const th = store.club.testThresholds();
  openModal(`
    <h3>평가 기준표</h3>
    <div class="seg-wide" id="rb-gender">
      ${RUBRIC_GENDERS.map((x) => `<button type="button" data-rg="${x.key}" aria-pressed="${x.key === g}">${esc(x.label)} 기준</button>`).join('')}
    </div>
    <div class="hint" style="margin:8px 0 12px">${g === 'female'
      ? '여성 회원끼리 비교하되, 혼성 경기에서 어느 정도인지를 함께 적습니다.'
      : '이 동호회 남성 회원들 사이의 비교입니다.'}
      기본값은 동호회 성인 기준 <b>초안</b>이라, 첫 측정 뒤 조정하시길 권합니다.</div>
    ${TESTS.map((t) => `<div class="rbsec">
      <div class="rbhd">${esc(t.label)}<span>${esc(ABILITIES.find((a) => a.key === t.abil).label)} 자동 환산${t.hint ? ` · ${esc(t.hint)}` : ''}</span></div>
      <div class="rbth">
        ${[5, 4, 3, 2].map((lv, i) => `<label class="thcell"><span class="lv">${lv}점</span>
          <input type="text" data-th="${t.key}:${i}" value="${esc(formatTestValue(t.key, th[t.key][g][i]).replace('초', ''))}"
            inputmode="${t.unit === 'mmss' ? 'text' : 'decimal'}" aria-label="${esc(t.label)} ${lv}점 경계">
          <span class="u">${esc(t.unit === 'mmss' ? '이하' : '초 이하')}</span></label>`).join('')}
        <div class="thlast">1점 = ${esc(store.club.testBound(t.key, 1, g === 'female' ? '여' : '남'))}</div>
      </div>
    </div>`).join('')}
    ${ABILITIES.map((a) => `<div class="rbsec">
      <div class="rbhd">${esc(a.label)}${testForAbil(a.key) ? '<span>기록으로 자동 환산되는 항목</span>' : ''}</div>
      ${rows[a.key].map((txt, i) => `<label class="rbrow"><span class="lv">${i + 1}</span>
        <input type="text" data-rb="${a.key}:${i + 1}" value="${esc(txt)}" maxlength="40" aria-label="${esc(a.label)} ${i + 1}점 기준"></label>`).join('')}
    </div>`).join('')}
    <div class="foot">
      <button class="btn ghost" data-act="reset">기본값으로 되돌리기</button>
      <button class="btn primary" data-act="save">저장</button>
    </div>`, (m) => {
    m.addEventListener('click', async (e) => {
      const gb = e.target.closest('#rb-gender [data-rg]');
      if (gb) {
        // 탭을 옮기기 전에 지금 입력한 내용을 먼저 저장한다
        saveRubricInputs(m, g);
        return afterModalClose(() => rubricModal(gb.dataset.rg));
      }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'reset') {
        closeModal();
        if (await confirmDialog({ title: '기준표를 기본값으로 되돌릴까요?', body: '남·여 문구와 측정 경계값이 모두 처음 상태로 돌아갑니다. 회원 점수는 기록 기준으로 다시 계산됩니다.', ok: '되돌리기', danger: true })) {
          store.club.resetRubric();
          store.club.resetTestThresholds();
          toast('기본값으로 되돌렸습니다');
          render();
        }
        return;
      }
      if (act === 'save') {
        saveRubricInputs(m, g);
        closeModal();
        toast('기준표를 저장했습니다');
        render();
      }
    });
  });
}
function saveRubricInputs(m, g) {
  $$('[data-rb]', m).forEach((inp) => {
    const [key, lv] = inp.dataset.rb.split(':');
    store.club.setRubricText(g, key, Number(lv), inp.value);
  });
  $$('[data-th]', m).forEach((inp) => {
    const [tk, i] = inp.dataset.th.split(':');
    const sec = parseTestInput(tk, inp.value);
    if (sec != null) store.club.setTestThreshold(tk, g, Number(i), sec);
  });
}

/** 종합 실력 표시: 자동 평균이면 숫자, 없으면 "미평가" */
function skillLabel(m) {
  return isUnrated(m) ? '미평가' : String(effectiveSkill(m));
}
function num1(v) { return Math.round(Number(v) * 10) / 10; }

function stars(n) {
  const v = Math.round(Number(n) || 0);
  let out = '';
  for (let i = 1; i <= 5; i += 1) out += i <= v ? '★' : '<span class="off">★</span>';
  return `<span class="stars">${out}</span>`;
}
function initial(name) { return String(name || '?').trim().slice(-2); }
/** 감독 뱃지 (팀 감독이면 표시) */
let toastTimer;
function toast(msg, kind = '') {
  const wrap = $('#toasts');
  wrap.innerHTML = `<div class="toast ${kind}">${esc(msg)}</div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { wrap.innerHTML = ''; }, 2200);
}

/* 모달: 뒤로가기로 닫힘 */
const modalStack = [];
function openModal(html, onMount) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  back.addEventListener('click', (e) => { if (e.target === back) closeModal(); });
  document.body.appendChild(back);
  document.body.style.overflow = 'hidden';
  modalStack.push(back);
  history.pushState({ modal: modalStack.length }, '');
  onMount?.($('.modal', back), back);
  const firstInput = $('input:not([type=file]), textarea', back);
  if (firstInput && !('ontouchstart' in window)) setTimeout(() => firstInput.focus(), 60);
  return back;
}
/* 우리가 부른 history.back() 으로 생길 popstate 개수.
 * 2026-09-22 실측 버그: closeModal() 이 history.back() 을 부르고 곧바로 다음 모달을 열면,
 * 뒤늦게 도착한 popstate 가 "뒤로가기" 로 오해돼 방금 연 모달을 닫아 버렸다.
 * → 회원 삭제·경기 삭제·기준표 되돌리기의 확인 창이 아예 뜨지 않았다(눌러도 아무 일 없음).
 * 우리가 부른 back 은 여기서 세어 두고 popstate 에서 한 번 소비한다. */
let pendingPop = 0;
function closeModal({ fromPop = false } = {}) {
  const back = modalStack.pop();
  if (!back) return;
  back.remove();
  if (!modalStack.length) document.body.style.overflow = '';
  if (!fromPop && history.state?.modal) {
    pendingPop += 1;
    setTimeout(() => { pendingPop = Math.max(0, pendingPop - 1); }, 1000);   // back 이 안 오는 경우 대비
    history.back();
  }
}
window.addEventListener('popstate', () => {
  if (pendingPop > 0) { pendingPop -= 1; return; }   // 우리가 이미 닫은 몫 — 아무 것도 더 닫지 않는다
  if (modalStack.length) closeModal({ fromPop: true });
  else applyHash();
});

/** 모달을 닫은 뒤 다음 모달/동작을 연다.
 *  closeModal() 의 history.back() 이 popstate 로 돌아오면서 새로 연 모달까지 닫아버리는
 *  경합을 막는다 (v0.5.3: 붙여넣어 가져오기에서 실제로 발생). */
function afterModalClose(fn) {
  if (!modalStack.length) { setTimeout(fn, 0); return; }
  let done = false;
  const run = () => { if (done) return; done = true; window.removeEventListener('popstate', onPop); setTimeout(fn, 20); };
  const onPop = () => run();
  window.addEventListener('popstate', onPop);
  closeModal();
  setTimeout(run, 120);   // popstate 가 오지 않아도 진행
}

function confirmDialog({ title, body = '', ok = '확인', danger = false }) {
  return new Promise((resolve) => {
    openModal(`
      <h3>${esc(title)}</h3>
      ${body ? `<p style="margin:0 0 4px;color:var(--text-2);font-size:14px;line-height:1.55">${body}</p>` : ''}
      <div class="foot">
        <button class="btn ghost" data-x="no">취소</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-x="yes">${esc(ok)}</button>
      </div>`, (m) => {
      m.addEventListener('click', (e) => {
        const x = e.target.closest('[data-x]')?.dataset.x;
        if (!x) return;
        closeModal();
        resolve(x === 'yes');
      });
    });
  });
}

/* ================= 아이콘 ================= */
const ICON = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10"/><path d="M4 12h7"/><path d="M4 17h7"/><path d="m15 15 2.5 2.5L22 13"/></svg>',
  team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><path d="M15.5 19c0-2.4 1.6-4 3-4 1.6 0 3 1.4 3 4"/></svg>',
  tactic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18"/><circle cx="12" cy="12" r="2.6"/><path d="M8.5 3v2.5h7V3"/><path d="M8.5 21v-2.5h7V21"/></svg>',
  member: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.4"/><path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m4 18 5-5 4 4 3-2.5 4 3.5"/></svg>',
  paste: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="3" width="8" height="4" rx="1"/><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/><path d="M8.5 12h7M8.5 16h5"/></svg>',
  ai: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.2 13.5 8 18 9.5 13.5 11 12 15.8 10.5 11 6 9.5 10.5 8 12 3.2Z"/><path d="M18.5 15.5 19.2 17.6 21.3 18.3 19.2 19 18.5 21.1 17.8 19 15.7 18.3 17.8 17.6 18.5 15.5Z"/><path d="M5.5 14 6 15.6 7.6 16.1 6 16.6 5.5 18.2 5 16.6 3.4 16.1 5 15.6 5.5 14Z"/></svg>',
  ball: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="m12 7 4 2.8-1.5 4.7h-5L8 9.8 12 7z" fill="currentColor" stroke="none" opacity=".3"/><path d="M12 3v4M3.6 9.6 8 9.8M20.4 9.6 16 9.8M6.5 19.6 9.5 14.5M17.5 19.6 14.5 14.5"/></svg>',
  train: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17 9 12l3 3 5-5"/><path d="M14 8h3v3"/><path d="M3 20h18"/></svg>',
};

const LOGO = `<svg class="mark" viewBox="0 0 48 48" aria-hidden="true">
  <rect width="48" height="48" rx="13" fill="url(#lg)"/>
  <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a9a63"/><stop offset="1" stop-color="#14573a"/></linearGradient></defs>
  <circle cx="24" cy="24" r="11" fill="none" stroke="#fff" stroke-width="2" opacity=".55"/>
  <path d="M24 15.5 31 20.6l-2.7 8.2h-8.6L17 20.6 24 15.5Z" fill="#fff"/>
</svg>`;

/* ================= AI ================= */
const aiState = { controller: null, history: [] };

function aiKeyNotice(extra = '') {
  return `<div class="ai-card notice">
    <div class="t">AI 기능을 쓰려면 API 키가 필요합니다</div>
    <div class="s">회원 탭 → 맨 아래 <b>AI 설정</b>에서 Anthropic API 키를 한 번만 넣어 주세요. 키는 이 기기에만 저장됩니다.${extra}</div>
    <button class="btn sm" data-go="members">설정으로 이동</button>
  </div>`;
}
function aiSkeleton(label) {
  return `<div class="ai-card loading">
    <div class="ai-head"><span class="spin"></span><b>${esc(label)}</b>
      <button class="btn sm ghost" data-ai-cancel style="margin-left:auto">취소</button></div>
    <div class="sk"></div><div class="sk"></div><div class="sk short"></div>
  </div>`;
}
function aiErrorCard(e) {
  const hint = e.kind === 'no_key' ? aiKeyNotice() : '';
  if (e.kind === 'cancelled') return '';
  return hint || `<div class="ai-card err">
    <div class="t">AI 호출 실패${e.status ? ` (${e.status})` : ''}</div>
    <div class="s">${esc(e.message)}</div>
    ${e.detail ? `<div class="s dim">${esc(String(e.detail).slice(0, 160))}</div>` : ''}
  </div>`;
}
function aiCostLine(r) {
  const cost = AI.formatCost(r.costUsd);
  return `<div class="ai-foot">${esc(r.model)}${cost ? ' · ' + esc(cost) : ''}${r.truncated ? ' · <b>응답이 잘렸습니다</b>' : ''}</div>`;
}

/** 공통 실행기: 로딩 → 결과/오류 렌더. render(r) 는 HTML 문자열을 돌려준다. */
async function aiRun(boxSel, label, prompt, render, { json = false } = {}) {
  const box = $(boxSel);
  if (!box) return null;
  if (!AI.hasKey()) { box.innerHTML = aiKeyNotice(); return null; }
  aiState.controller?.abort();
  const ctrl = new AbortController();
  aiState.controller = ctrl;
  box.innerHTML = aiSkeleton(label);
  let cancelled = false;
  box.querySelector('[data-ai-cancel]')?.addEventListener('click', () => {
    cancelled = true;
    ctrl.abort();
    box.innerHTML = '';   // 네트워크가 늦게 응답해도 화면은 바로 닫는다
  });
  try {
    const r = json
      ? await AI.askJSON({ ...prompt, signal: ctrl.signal })
      : await AI.callClaude({ ...prompt, signal: ctrl.signal });
    if (cancelled) return null;
    box.innerHTML = render(r);
    return r;
  } catch (e) {
    if (cancelled || e.kind === 'cancelled') return null;
    box.innerHTML = aiErrorCard(e);
    toast(e.message, 'err');
    return null;
  } finally {
    if (aiState.controller === ctrl) aiState.controller = null;
  }
}

function aiTextCard(title, text, r, { copyId = 'ai-copy-' + Math.random().toString(36).slice(2, 7) } = {}) {
  return `<div class="ai-card">
    <div class="ai-head"><b>${esc(title)}</b>
      <button class="btn sm" data-copy="${copyId}" style="margin-left:auto">복사</button>
      <button class="btn sm" data-share="${copyId}">공유</button></div>
    <div class="ai-body" id="${copyId}">${AI.renderMini(text, esc)}</div>
    ${aiCostLine(r)}
  </div>`;
}

/* ---------- 4) AI에게 물어보기 ---------- */
function aiAskModal() {
  openModal(`
    <h3>AI에게 물어보기</h3>
    <div style="font-size:12.5px;color:var(--text-2);margin-bottom:10px">모임 데이터(회원·출석·경기)를 근거로 답합니다. 예: "출석률 낮은 사람은?", "GK 후보 누구야?"</div>
    <textarea id="f-ask" rows="3" placeholder="궁금한 것을 적어 주세요"></textarea>
    <div class="row" style="margin-top:8px">
      <button class="btn sm" data-q="출석률이 가장 낮은 회원 5명과 비율을 알려줘">출석률 낮은 사람</button>
      <button class="btn sm" data-q="GK를 맡을 수 있는 회원과, GK가 부족한 팀을 알려줘">GK 후보</button>
    </div>
    <div id="ai-ask-box" style="margin-top:10px"></div>
    <div class="foot">
      <button class="btn ghost" data-act="close">닫기</button>
      <button class="btn primary" data-act="ask">물어보기</button>
    </div>`, (m) => {
    const ask = async () => {
      const q = $('#f-ask', m).value.trim();
      if (!q) { toast('질문을 입력해 주세요', 'err'); return; }
      const r = await aiRun('#ai-ask-box', '생각하는 중', AI.askPrompt({ store, question: q, history: aiState.history }),
        (res) => aiTextCard('답변', res.text, res));
      if (r) {
        aiState.history.push({ role: 'user', content: q }, { role: 'assistant', content: r.text });
        aiState.history = aiState.history.slice(-6); // 최근 6턴(메시지 6개)만 유지
      }
    };
    m.addEventListener('click', (e) => {
      const qb = e.target.closest('[data-q]');
      if (qb) { $('#f-ask', m).value = qb.dataset.q; return; }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'close') return closeModal();
      if (act === 'ask') ask();
    });
  });
}

/* ---------- AI 설정 카드 ---------- */
function aiSettingsCard() {
  const s = AI.getSettings();
  return `<div class="section-title">AI 설정</div>
    <div class="card">
      <div class="field"><label>Anthropic API 키</label>
        ${s.key
          ? `<div class="keyrow"><code>${esc(AI.maskKey(s.key))}</code>
              <button class="btn sm danger" id="btn-ai-key-del">삭제</button></div>`
          : `<input type="password" id="f-ai-key" placeholder="sk-ant-..." autocomplete="off" spellcheck="false">
             <button class="btn block" id="btn-ai-key-save" style="margin-top:8px">키 저장</button>`}
      </div>
      <div class="field"><label>모델</label>
        <div class="seg-wide" id="f-ai-model">
          ${AI.AI_MODELS.map((m) => `<button type="button" data-model="${m.id}" aria-pressed="${s.model === m.id}">${esc(m.label)}</button>`).join('')}
        </div>
      </div>
      <div class="row">
        <button class="btn grow" id="btn-ai-test" ${s.key ? '' : 'disabled'}>연결 테스트</button>
        <button class="btn grow ai" id="btn-ai-ask-2">AI에게 물어보기</button>
      </div>
      <div id="ai-test-box"></div>
      <div style="font-size:12px;color:var(--text-3);line-height:1.6;margin-top:10px">
        키는 이 기기 브라우저에만 저장되며 JSON 내보내기에 포함되지 않습니다.
        키 발급: console.anthropic.com → API Keys. 호출 1회 비용은 보통 10~30원 수준입니다.
      </div>
    </div>`;
}

/* ================= 렌더 ================= */
function render() {
  renderOurTeam();
  renderOpponent();
  renderBoard();
  renderMatch();
  renderTraining();
  document.dispatchEvent(new CustomEvent('app:render'));
}

/* ---------- 실행 환경 안내 (v0.5.3) ---------- */
function envBanner() {
  const env = currentEnv();
  const meta = readMeta();
  const b = bannerFor(env, store.members.all().length, Date.now(), meta.bannerHiddenUntil);
  if (!b) return '';
  const actionBtn = {
    'android-open': `<a class="btn sm primary" href="${androidChromeIntent(location.href)}">크롬으로 열기</a>`,
    'ios-open': '<button class="btn sm primary" data-envhelp="ios-open">여는 방법</button>',
    'ios-add': '<button class="btn sm primary" data-envhelp="ios-add">홈 화면에 추가</button>',
    'android-add': '<button class="btn sm primary" data-envhelp="android-add">홈 화면에 추가</button>',
  }[b.action] || '';
  return `<div class="envbanner ${b.type}">
    <div class="eb-top"><b>${esc(b.title)}</b>
      <button class="eb-x" data-envclose aria-label="하루 동안 숨기기">✕</button></div>
    <div class="eb-body">${esc(b.body)}</div>
    <div class="row" style="margin-top:8px">${actionBtn}
      <button class="btn sm" data-go="members">이 앱이 열린 곳 보기</button></div>
  </div>`;
}

function backupCard() {
  const meta = readMeta();
  const n = store.members.all().length;
  if (!needsBackup(n, meta.lastBackupAt)) return '';
  return `<div class="backupcard">
    <div class="bc-top"><b>백업해 두세요</b><span class="dim">마지막 백업 ${esc(sinceLabel(meta.lastBackupAt))}</span></div>
    <div class="bc-body">회원 ${n}명·경기 기록이 이 기기에만 있습니다. JSON 파일로 내려받아 두면 기기를 바꿔도 그대로 옮길 수 있습니다.</div>
    <div class="row" style="margin-top:8px">
      <button class="btn sm primary" id="btn-backup-now">지금 백업</button>
      <button class="btn sm" data-backup-later>나중에</button>
    </div>
  </div>`;
}

/** 설정용: 이 앱이 열린 곳 */
function envCard() {
  const env = currentEnv();
  const meta = readMeta();
  const n = store.members.all().length;
  const saved = store.get().updatedAt;
  const tone = env.mode === 'standalone' ? 'ok' : (env.mode === 'inapp' ? 'warn' : '');
  return `<div class="section-title">이 앱이 열린 곳</div>
    <div class="card envcard ${tone}">
      <div class="ec-row"><span class="k">지금 위치</span><b>${esc(env.label)}</b></div>
      <div class="ec-row"><span class="k">이 저장소의 회원</span><b>${n}명</b></div>
      <div class="ec-row"><span class="k">마지막 저장</span><b>${esc(sinceLabel(saved))}</b></div>
      <div class="ec-row"><span class="k">마지막 백업</span><b>${esc(sinceLabel(meta.lastBackupAt))}</b></div>
      <div class="ec-note">${env.mode === 'standalone'
        ? '홈 화면 앱에서 쓰고 있습니다. 명단은 여기에 저장됩니다.'
        : env.mode === 'inapp'
          ? `${esc(env.appLabel)} 안의 브라우저는 <b>별도 저장소</b>를 씁니다. 여기서 넣은 명단은 사파리·크롬·홈 화면 앱에서 보이지 않습니다.`
          : '브라우저 탭입니다. 홈 화면에 추가한 앱과는 저장이 분리되니 한 곳만 정해 쓰세요.'}</div>
      <div class="ec-note">홈 화면 아이콘 이름은 추가할 때 정해져서, 이미 추가해 둔 아이콘은 전 이름 그대로입니다.
        바꾸려면 아이콘을 지우고 <b>다시 추가</b>하세요(명단은 그대로 남습니다).</div>
      <button class="btn block" id="btn-move-data" style="margin-top:10px">다른 곳으로 옮기기</button>
    </div>`;
}

/** 옮기기 도우미 */
function moveDataSheet() {
  const json = store.exportJSON();
  openModal(`
    <h3>다른 곳으로 옮기기</h3>
    <div style="font-size:13px;color:var(--text-2);line-height:1.6;margin-bottom:10px">
      지금 저장소의 데이터를 통째로 꺼냅니다. 옮길 곳(홈 화면 앱·사파리 등)에서 <b>회원 탭 → JSON 가져오기</b>로 붙여넣거나 파일을 고르면 됩니다.
    </div>
    <div class="row wrap">
      <button class="btn grow" data-act="copy">클립보드 복사</button>
      <button class="btn grow" data-act="file">파일로 저장</button>
      <button class="btn grow" data-act="share">공유</button>
    </div>
    <div class="hint" style="margin-top:8px">회원 ${store.members.all().length}명 · 경기 ${store.matches.all().length}건 · ${Math.round(json.length / 1024)}KB</div>
    <div class="foot"><button class="btn primary" data-act="close">닫기</button></div>`, (m) => {
    m.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'close') return closeModal();
      if (act === 'copy') {
        try { await navigator.clipboard.writeText(json); markBackup(); toast('복사했습니다. 옮길 곳에서 붙여넣으세요'); }
        catch (err) { toast('이 브라우저에서는 복사가 막혀 있습니다. 파일로 저장해 주세요', 'err'); }
        return;
      }
      if (act === 'file') { exportJSON(); return; }
      if (act === 'share') {
        const file = new File([json], `woosulsan-fc_${todayStr()}.json`, { type: 'application/json' });
        try {
          if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: `${APP_NAME} 백업` }); markBackup(); toast('공유했습니다'); }
          else if (navigator.share) { await navigator.share({ title: `${APP_NAME} 백업`, text: json.slice(0, 100000) }); markBackup(); }
          else { exportJSON(); }
        } catch (err) { if (err?.name !== 'AbortError') exportJSON(); }
      }
    });
  });
}

/** 붙여넣기로 가져오기 */
function pasteImportSheet() {
  openModal(`
    <h3>붙여넣어 가져오기</h3>
    <div style="font-size:13px;color:var(--text-2);line-height:1.6;margin-bottom:10px">
      다른 곳에서 "클립보드 복사"한 내용을 그대로 붙여넣으세요. 파일이 있으면 아래 "파일 고르기"를 쓰면 됩니다.
    </div>
    <textarea id="f-paste" rows="7" placeholder='{"app":"축구&amp;joy", ...}'></textarea>
    <div class="pastemeta" id="f-paste-meta">아직 비어 있습니다</div>
    <div class="row" style="margin-top:8px">
      <button class="btn grow" data-act="file">파일 고르기</button>
      <button class="btn grow primary" data-act="go">가져오기</button>
    </div>
    <div class="foot"><button class="btn ghost" data-act="close">닫기</button></div>`, (m) => {
    // 붙여넣은 양과 끝 모양을 바로 보여 준다 (아이폰에서 복사가 중간에 잘리는 경우를 눈으로 확인)
    const meta = () => {
      const v = $('#f-paste', m).value;
      const box = $('#f-paste-meta', m);
      if (!box) return;
      const t = v.trim();
      if (!t) { box.textContent = '아직 비어 있습니다'; box.className = 'pastemeta'; return; }
      const endOk = /[}\]]$/.test(t.replace(/```\s*$/, '').trim());
      const startOk = /^[\s\uFEFF]*(```[a-z]*\s*)?[{[]/.test(v);
      box.innerHTML = `${v.length.toLocaleString()}자 · 시작 ${startOk ? '{ 확인' : '<b>{ 로 시작하지 않음</b>'} · 끝 ${endOk ? '} 확인' : '<b>} 로 끝나지 않음 — 복사가 잘렸을 수 있어요</b>'}`;
      box.className = `pastemeta${startOk && endOk ? ' ok' : ' warn'}`;
    };
    $('#f-paste', m).addEventListener('input', meta);
    m.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'close') return closeModal();
      if (act === 'file') { afterModalClose(() => $('#file-import').click()); return; }
      if (act === 'go') {
        const text = $('#f-paste', m).value;
        if (!text.trim()) { toast('내용을 붙여넣어 주세요', 'err'); return; }
        // 먼저 읽어 보고, 안 되면 이 시트에 그대로 머물며 이유를 보여 준다
        let pv;
        try { pv = store.previewImport(text); }
        catch (err) {
          const box = $('#f-paste-meta', m);
          if (box) { box.textContent = err.message; box.className = 'pastemeta err'; }
          toast('가져오지 못했습니다 — 아래 이유를 확인해 주세요', 'err');
          return;
        }
        afterModalClose(() => importChoice(text, pv));
      }
    });
  });
}

function envHelpSheet(kind) {
  const body = {
    'ios-open': `<b>사파리로 여는 방법</b><br>
      1. 화면 오른쪽 위(또는 아래) <b>⋯ / 공유</b> 버튼을 누릅니다.<br>
      2. <b>"Safari로 열기"</b> 를 고릅니다.<br>
      3. 사파리에서 공유 → <b>홈 화면에 추가</b> 를 하면 앱처럼 쓸 수 있습니다.`,
    'ios-add': `<b>홈 화면에 추가 (아이폰)</b><br>
      1. 사파리 아래 가운데 <b>공유</b> 버튼(네모에 화살표)을 누릅니다.<br>
      2. 목록을 내려 <b>"홈 화면에 추가"</b> 를 누릅니다.<br>
      3. 다음부터는 홈 화면 아이콘으로만 여세요. 탭과 저장이 분리됩니다.`,
    'android-add': `<b>홈 화면에 추가 (안드로이드)</b><br>
      1. 크롬 오른쪽 위 <b>⋮</b> 를 누릅니다.<br>
      2. <b>"홈 화면에 추가"</b> 또는 <b>"앱 설치"</b> 를 고릅니다.<br>
      3. 다음부터는 홈 화면 아이콘으로만 여세요.`,
  }[kind] || '';
  openModal(`<h3>여는 방법</h3>
    <div style="font-size:13.5px;line-height:1.8;color:var(--text-2)">${body}</div>
    <div class="ai-card notice" style="margin-top:12px"><div class="s">
      옮기기 전에 <b>회원 탭 → 다른 곳으로 옮기기</b> 로 지금 데이터를 먼저 복사해 두세요.
    </div></div>
    <div class="foot"><button class="btn primary" data-act="close">알겠습니다</button></div>`, (m) => {
    m.addEventListener('click', (e) => { if (e.target.closest('[data-act="close"]')) closeModal(); });
  });
}

/* ---------- 입력 초안 (v0.5.3) ---------- */
/** 시트 안의 입력 요소를 초안 키에 묶는다. 저장 성공 시 clearDraft(form) 호출. */
function bindDraft(modalEl, form, selector, { onRestore } = {}) {
  const el = $(selector, modalEl);
  if (!el) return null;
  let done = false;   // 저장 완료 후에는 blur 로 초안이 되살아나면 안 된다
  const saver = debounce((v) => { if (!done) saveDraft(form, v); }, 300);
  el.addEventListener('input', () => { if (!done) saver(el.value); });
  el.addEventListener('blur', () => { if (!done) saveDraft(form, el.value); });

  const prev = readDraft(form);
  if (prev && prev.value && !el.value.trim()) {
    const bar = document.createElement('div');
    bar.className = 'draftbar';
    bar.innerHTML = `<span>${esc(draftAgeLabel(prev.at))}에 쓰던 내용이 있습니다</span>
      <button class="btn sm primary" data-draft="restore">복원</button>
      <button class="btn sm ghost" data-draft="drop">버리기</button>`;
    el.parentNode.insertBefore(bar, el);
    bar.addEventListener('click', (e) => {
      const act = e.target.closest('[data-draft]')?.dataset.draft;
      if (!act) return;
      if (act === 'restore') { el.value = prev.value; onRestore?.(prev.value); }
      else clearDraft(form);
      bar.remove();
    });
  }
  return { el, clear: () => { done = true; saver.cancel(); clearDraft(form); } };
}

function markBackup() { writeMeta({ lastBackupAt: new Date().toISOString() }); }

/* ================= 우리팀 (S1 완성 탭) =================
 * 한 화면에서: 명단 · 포지션 · 능력치 · 오늘 출석 체크 · "오늘 가능 선수" 필터.
 * 출석은 "오늘 자리" 하나에 쌓인다(처음 누를 때 만든다) → 옛 경기별 출석 기록은 그대로 살아 있다.
 */
function myRoleLabel() { return 'owner'; }

/** 평가 시각·주체 표기 */
function fmtWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  return same ? `오늘 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    : `${d.getMonth() + 1}월 ${d.getDate()}일`;
}
function whoLabel(by) {
  if (!by) return '';
  if (by === 'owner') return '운영자';
  return String(by);
}

function testRecOf(member, abilKey) {
  const t = testForAbil(abilKey);
  return t ? (member?.tests?.[t.key] || null) : null;
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
function todayHead() {
  const d = new Date();
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY_KO[d.getDay()]})`;
}
/** "YYYY-MM-DD" → "9월 29일(화)" (경기·상대 화면 공용) */
function fmtDate(dstr) {
  const d = new Date(`${dstr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dstr;
  return `${d.getMonth() + 1}월 ${d.getDate()}일(${WEEKDAY_KO[d.getDay()]})`;
}

/** 오늘 자리 — 출석을 처음 누를 때만 만든다 (빈 자리를 미리 만들지 않는다) */
function todaySession({ create = false } = {}) {
  return store.matches.today({ create });
}
function attOf(g, id) { return g ? g.attendance[id] : undefined; }

function countAttendance(g) {
  const c = { in: 0, out: 0, maybe: 0, none: 0 };
  for (const m of store.members.active()) {
    const v = attOf(g, m.id);
    c[v === 'in' || v === 'out' || v === 'maybe' ? v : 'none'] += 1;
  }
  return c;
}
/** 오늘 가능 선수 (출석 = 참석) */
function availableToday() {
  const g = todaySession();
  if (!g) return [];
  return store.members.active().filter((m) => g.attendance[m.id] === 'in');
}

/** v1.0 으로 올렸을 때 한 번 보여 주는 안내 — 자동 백업 내려받기·되돌리기 경로 */
function legacyCard() {
  const b = store.legacyBackup?.();
  // 옛 명단이 실제로 있던 기기에서만 띄운다 (빈 기기에 "회원 0명" 안내가 뜨지 않게)
  const had = Number(b?.payload?.members) || 0;
  if (!b || !had || ui.legacyHidden) return '';
  return `<div class="migratecard">
    <div class="mc-top"><b>v1.0 으로 올렸습니다</b><span class="dim">${esc(sinceLabel(b.savedAt))}</span></div>
    <div class="mc-body">회원 ${had}명·출석·능력치는 그대로입니다.
      내부 팀 배정(교역·장년·청년·체육·학생)과 팀 나누기 기록만 빠졌습니다.
      올리기 직전 데이터는 이 기기에 통째로 남겨 두었습니다 — 아래에서 파일로 받아 두세요.</div>
    <div class="row wrap" style="margin-top:8px">
      <button class="btn sm primary grow" id="btn-legacy-download">옛 데이터 받기</button>
      <button class="btn sm grow" id="btn-legacy-restore">되돌리기</button>
      <button class="btn sm ghost" id="btn-legacy-hide">닫기</button>
    </div>
  </div>`;
}

function chip(label, n, key) {
  return `<button data-mf="${key}" aria-pressed="${ui.memberFilter === key}">${esc(label)} ${n}</button>`;
}

function memberRow(m, g) {
  const st = store.stats.attendance(m.id);
  const v = attOf(g, m.id);
  const avg = abilAvg(m.abil);
  return `<div class="att-item${m.active ? '' : ' off'}">
    <button class="mr-main" data-member-edit="${m.id}">
      <div class="avatar">${esc(initial(m.name))}</div>
      <div class="nm">
        <b>${esc(m.name)}${m.birthYear ? ` <span class="agebadge">${ageOf(m.birthYear)}세</span>` : ''}${m.active ? '' : ' <span class="chip">비활동</span>'}</b>
        <div class="sub"><span class="chip pos">${esc(m.pos)}</span>${m.gk && m.pos !== 'GK' ? '<span class="chip gk">GK 가능</span>' : ''}${m.gender ? `<span class="chip g${m.gender === '여' ? 'f' : 'm'}">${m.gender}</span>` : ''}${avg == null ? '<span class="chip">미평가</span>' : `${stars(m.skill)}<span class="skillnum">${skillLabel(m)}</span>`}${st.rate != null ? `<span class="rate-mini">출석 ${st.rate}%</span>` : ''}</div>
      </div>
    </button>
    <div class="seg" data-member="${m.id}">
      <button class="in" data-v="in" aria-pressed="${v === 'in'}">참석</button>
      <button class="out" data-v="out" aria-pressed="${v === 'out'}">불참</button>
      <button class="maybe" data-v="maybe" aria-pressed="${v === 'maybe'}">미정</button>
    </div>
  </div>`;
}

/** "가능 8명 · GK 없음" — 출석을 누를 때마다 이 한 줄만 다시 칠한다 */
function availLabel(avail) {
  const gk = avail.some((m) => m.gk || m.pos === 'GK');
  return `가능 <i>${avail.length}</i>명${avail.length && !gk ? ' · <em>GK 없음</em>' : ''}`;
}

function renderOurTeam() {
  const root = $('#view-ourteam');
  const g = todaySession();
  const all = store.members.all();
  const active = all.filter((m) => m.active);
  const counts = countAttendance(g);
  const q = ui.memberQuery.trim();
  const avail = availableToday();
  const nUnrated = active.filter((m) => isUnrated(m)).length;
  const nGk = active.filter((m) => m.gk || m.pos === 'GK').length;

  const list = all
    .filter((m) => (ui.showInactive ? true : m.active))
    .filter((m) => !q || m.name.includes(q))
    .filter((m) => {
      if (ui.memberFilter === 'today') return attOf(g, m.id) === 'in';
      if (ui.memberFilter === 'unrated') return isUnrated(m);
      if (ui.memberFilter === 'gk') return m.gk || m.pos === 'GK';
      return true;
    })
    .sort((a, b) => (ui.memberSort === 'age'
      ? ((a.birthYear || 9999) - (b.birthYear || 9999)) || a.name.localeCompare(b.name, 'ko')
      : a.name.localeCompare(b.name, 'ko')));

  // v1.0 안내 카드가 떠 있으면 "백업해 두세요" 는 같은 말을 두 번 하는 셈이라 접는다
  const legacy = legacyCard();
  let html = legacy + envBanner() + (legacy ? '' : backupCard());

  html += `<div class="todaycard">
    <div class="tc-top"><b>오늘 ${esc(todayHead())}</b>
      <span class="tc-avail">${availLabel(avail)}</span></div>
    <div class="count-strip">
      <div class="c in"><b>${counts.in}</b><span>참석</span></div>
      <div class="c out"><b>${counts.out}</b><span>불참</span></div>
      <div class="c"><b>${counts.maybe}</b><span>미정</span></div>
      <div class="c"><b>${counts.none}</b><span>미응답</span></div>
    </div>
    <div class="row" style="margin-top:9px">
      <button class="btn sm grow" data-att-all="in">전체 참석</button>
      <button class="btn sm grow" data-att-all="clear">초기화</button>
    </div>
    <div class="row" style="margin-top:6px">
      <button class="btn sm block grow paste" id="btn-roster">${ICON.paste} 카톡 명단 붙여넣기</button>
    </div>
    ${ui.rosterDone ? `<div class="tc-done">명단 적용 완료 · 참석 ${ui.rosterDone.inCount}${ui.rosterDone.added ? ` (신규 ${ui.rosterDone.added})` : ''} · 불참 ${ui.rosterDone.outCount}</div>` : ''}
  </div>`;

  html += `<div class="row" style="margin:12px 0 10px">
      <button class="btn primary grow" id="btn-add-member">${ICON.plus} 회원 추가</button>
      <button class="btn grow" id="btn-bulk-member">일괄 추가</button>
    </div>`;

  const fixRows = nameCandidates();
  if (fixRows.length) {
    html += `<div class="fixbanner">
      <div><b>이름에 정보가 섞인 회원 ${fixRows.length}명</b>
        <div class="s">${esc(fixRows.slice(0, 3).map((r) => r.member.name).join(', '))}${fixRows.length > 3 ? ' 외' : ''}</div></div>
      <button class="btn sm primary" id="btn-fix-names">정리하기</button>
    </div>`;
  }

  html += `<div class="search-wrap">${ICON.search}<input id="member-q" type="search" placeholder="이름 검색" value="${esc(q)}"></div>
    <div class="filterchips">
      ${chip('전체', active.length, 'all')}
      ${chip('오늘 가능', avail.length, 'today')}
      ${chip('미평가', nUnrated, 'unrated')}
      ${chip('GK', nGk, 'gk')}
    </div>
    <div class="section-title">명단 <span class="count">${list.length}${all.length !== list.length ? ` / ${all.length}` : ''}</span>
      <button class="btn sm ghost right" id="btn-sort">${ui.memberSort === 'age' ? '나이순 ↑' : '이름순'}</button>
      <button class="btn sm ghost" id="btn-toggle-inactive">${ui.showInactive ? '활동 회원만' : '비활동 포함'}</button>
    </div>`;

  if (!list.length) {
    html += `<div class="empty">${ICON.member}
      <div class="big">${all.length ? '해당하는 회원이 없습니다' : '회원이 없습니다'}</div>
      <div>${all.length ? '필터를 "전체"로 바꿔 보세요.' : '"일괄 추가"로 이름을 줄바꿈으로 붙여넣으면 한 번에 등록됩니다.'}</div></div>`;
  } else {
    html += list.map((m) => memberRow(m, g)).join('');
  }

  html += `<div id="settings-anchor"></div>
    ${envCard()}
    <div class="section-title">설정 · 백업</div>
    <div class="card">
      <div class="row" style="margin-bottom:8px">
        <button class="btn grow" id="btn-export">JSON 내보내기</button>
        <button class="btn grow" id="btn-import">JSON 가져오기</button>
      </div>
      <button class="btn block" id="btn-paste-import" style="margin-bottom:8px">붙여넣어 가져오기 (JSON)</button>
      <button class="btn block" id="btn-text-import" style="margin-bottom:8px">명단 텍스트로 가져오기</button>
      <button class="btn block" id="btn-fix-names-2" style="margin-bottom:8px">이름 정리 (포지션·나이 분리)</button>
      <button class="btn block" id="btn-rubric" style="margin-bottom:8px">평가 기준표 (남/여)</button>
      ${Number(store.legacyBackup?.()?.payload?.members) > 0 ? `<button class="btn block" id="btn-legacy-download" style="margin-bottom:8px">v0.7 옛 데이터 받기 (자동 백업)</button>
      <button class="btn block" id="btn-legacy-restore" style="margin-bottom:8px">v0.7 백업에서 되돌리기</button>` : ''}
      <input type="file" id="file-import" accept=".json,application/json,text/plain,*/*" class="hidden">
      <div style="font-size:12.5px;color:var(--text-2);line-height:1.6">
        데이터는 이 기기(브라우저)에만 저장됩니다. 기기를 바꾸거나 백업하려면 JSON으로 내보내 두세요.
      </div>
      <button class="btn danger block" id="btn-reset" style="margin-top:12px">전체 데이터 초기화</button>
    </div>
    ${aiSettingsCard()}
    <div class="footer-note">${esc(APP_NAME)} · <b>${APP_VERSION}</b> · <span id="sw-state">로컬 저장</span></div>`;

  root.innerHTML = html;
}

/** 출석만 다시 칠한다 (목록 전체를 다시 그리면 스크롤이 튄다) */
function updateAttendCounts() {
  const c = countAttendance(todaySession());
  const strip = $('#view-ourteam .count-strip');
  if (strip) {
    const cells = $$('.c b', strip);
    [c.in, c.out, c.maybe, c.none].forEach((n, i) => { if (cells[i]) cells[i].textContent = String(n); });
  }
  const avail = availableToday();
  const box = $('#view-ourteam .tc-avail');
  if (box) box.innerHTML = availLabel(avail);   // GK 경고까지 함께 갱신 (묵은 경고가 남지 않게)
  const chipToday = $('#view-ourteam .filterchips [data-mf="today"]');
  if (chipToday) chipToday.textContent = `오늘 가능 ${avail.length}`;
}

/* ================= 전술보드 — 준비 모드 (S3, 2026-09-29) =================
 * 마스터플랜 §3·§4(S3): 필드 SVG + 우리 라인업(파란 원) + 상대 포메이션(회색 점선 원) 겹치기.
 * 드래그 이동 · 화살표 · 세트피스 템플릿 · 스냅샷 저장(match.boardSnapshot)까지 이 화면에서 처리한다.
 * 경기 모드(S4)는 토글 자리만 — 누르면 "S4에서 만듭니다" 안내만 뜬다.
 */
const bd = {
  matchId: '',        // '' = 임시 라인업 (경기 미선택)
  opponentId: '',      // '' = 상대 미선택 (직접 포메이션만 고름)
  formation: FORMATION_PRESETS[0],
  oppFormation: FORMATION_PRESETS[0],
  ourPins: [],          // [{x,y,memberId,name,gk}]
  oppPins: [],           // [{x,y,pos}]
  arrows: [],             // [{x1,y1,x2,y2,style}]
  ball: null,
  setPiece: null,
  mode: 'move',            // 'move' | 'arrow' | 'sub'(경기 모드 전용 — 핀 탭 = 교체)
  arrowStyle: 'solid',
  panelOpen: false,         // 폰(세로)에서 후보 패널 펼침 여부
  pendingCand: null,         // 드래그 미지원 환경 대비 — 탭으로 고른 후보 선수 id
  loadedFrom: null,           // 마지막으로 불러온 matchId+snapshot 여부(경기 바뀔 때만 다시 채움)
  dirty: false,
  /* ---- 경기 모드 (S4, 2026-09-29) ---- */
  viewMode: 'prep',          // 'prep' | 'live'
  locked: false,              // true 면 드래그·화살표·교체 시트를 모두 막는다(길게 눌러야 해제)
  substitutions: [],           // [{minute,out,in}] — 선택된 경기의 교체 기록(store.matches.byId().substitutions 미러)
};

function boardMatches() { return store.matches.sorted(); }

/** 경기를 고르면 그 경기의 라인업/상대/저장된 스냅샷으로 보드를 채운다. 임시 라인업이면 오늘 가능 선수로 기본 배치 */
function loadBoardFor(matchId) {
  bd.matchId = matchId || '';
  const g = matchId ? store.matches.byId(matchId) : null;
  if (g?.boardSnapshot) {
    const s = g.boardSnapshot;
    bd.formation = s.formation; bd.oppFormation = s.oppFormation || s.formation;
    bd.ourPins = s.ourPins.map((p) => ({ ...p }));
    bd.oppPins = s.oppPins.map((p) => ({ ...p }));
    bd.arrows = s.arrows.map((a) => ({ ...a }));
    bd.ball = s.ball ? { ...s.ball } : null;
    bd.setPiece = s.setPiece || null;
    bd.opponentId = g.opponentId || '';
  } else {
    bd.formation = g?.lineup?.formation || FORMATION_PRESETS[0];
    bd.opponentId = g?.opponentId || '';
    const opp = bd.opponentId ? store.opponents.byId(bd.opponentId) : null;
    bd.oppFormation = opp?.formation && FORMATION_PRESETS.includes(opp.formation) ? opp.formation : FORMATION_PRESETS[0];
    const slots = g?.lineup?.slots || [];
    bd.ourPins = buildOurPins(bd.formation, slots, (id) => store.members.byId(id));
    bd.oppPins = buildOppPins(bd.oppFormation);
    bd.arrows = [];
    bd.ball = null;
    bd.setPiece = null;
  }
  bd.substitutions = (g?.substitutions || []).map((x) => ({ ...x }));
  bd.dirty = false;
  bd.locked = false;
  bd.mode = bd.viewMode === 'live' ? 'sub' : 'move';
  bd.loadedFrom = matchId || '__temp__';
}

/** 임시 라인업 — 경기 없이 "오늘 가능 선수"(없으면 활동 회원)로 채운다 */
function loadBoardTemp() {
  bd.matchId = '';
  const cands = availableToday().length ? availableToday() : store.members.active();
  const need = formationSlots(bd.formation).length;
  const slots = cands.slice(0, need).map((m) => m.id);
  bd.ourPins = buildOurPins(bd.formation, slots, (id) => store.members.byId(id));
  bd.oppPins = buildOppPins(bd.oppFormation);
  bd.arrows = []; bd.ball = null; bd.setPiece = null; bd.substitutions = []; bd.dirty = false; bd.loadedFrom = '__temp__';
  // 임시 라인업(경기 미선택)은 자동저장 대상이 없으므로 경기 모드로 들어갈 수 없다 — 준비 모드로 되돌린다
  if (bd.viewMode === 'live') { bd.viewMode = 'prep'; releaseWakeLock(); }
  bd.locked = false;
  bd.mode = 'move';
}

/** 포메이션을 바꿀 때 — 겹치는 자리의 선수 배정은 최대한 유지하고 좌표만 새로 깐다 */
function reflowOurFormation(newFormation) {
  const oldSlots = bd.ourPins.map((p) => p.memberId);
  bd.formation = newFormation;
  bd.ourPins = buildOurPins(newFormation, oldSlots, (id) => store.members.byId(id));
}
function reflowOppFormation(newFormation) {
  bd.oppFormation = newFormation;
  bd.oppPins = buildOppPins(newFormation);
}

/** "다시 배치" — 저장된 스냅샷이 있어도 무시하고, 지금 고른 포메이션 기준 기본 좌표로 되돌린다 */
function resetBoardLayout() {
  const g = bd.matchId ? store.matches.byId(bd.matchId) : null;
  const slots = g?.lineup && g.lineup.formation === bd.formation ? g.lineup.slots : bd.ourPins.map((p) => p.memberId);
  bd.ourPins = buildOurPins(bd.formation, slots, (id) => store.members.byId(id));
  bd.oppPins = buildOppPins(bd.oppFormation);
  bd.arrows = []; bd.ball = null; bd.setPiece = null; bd.dirty = true;
}

function candidateList() {
  const today = availableToday();
  return today.length ? today : store.members.active();
}

function pinDotHTML(label, opts = {}) {
  return `<div class="dot${opts.gk ? ' gk' : ''}${opts.ghost ? ' ghost' : ''}">${esc(label)}</div>`;
}

function ourPinHTML(p, i) {
  const label = p.gk ? 'GK' : String(i);
  const name = p.name ? p.name.slice(0, 5) : (p.memberId ? '' : '공석');
  return `<div class="pin us${p.memberId ? '' : ' empty'}" data-side="us" data-idx="${i}" style="left:${p.x}%;top:${p.y}%">
    ${pinDotHTML(label, { gk: p.gk })}
    <div class="lbl">${esc(name)}</div>
  </div>`;
}
function oppPinHTML(p, i) {
  return `<div class="pin opp" data-side="opp" data-idx="${i}" style="left:${p.x}%;top:${p.y}%">
    ${pinDotHTML(p.pos, { ghost: true })}
  </div>`;
}
function ballHTML() {
  if (!bd.ball) return '';
  return `<div class="ball-marker" data-ball style="left:${bd.ball.x}%;top:${bd.ball.y}%">⚽</div>`;
}
function arrowsSVG() {
  return bd.arrows.map((a) => {
    const ang = Math.atan2((a.y2 - a.y1) * 1.5, a.x2 - a.x1);
    const L = 3.4;
    const p1x = a.x2 - L * Math.cos(ang - 0.44); const p1y = a.y2 * 1.5 - L * Math.sin(ang - 0.44);
    const p2x = a.x2 - L * Math.cos(ang + 0.44); const p2y = a.y2 * 1.5 - L * Math.sin(ang + 0.44);
    return `<line x1="${a.x1}" y1="${a.y1 * 1.5}" x2="${a.x2}" y2="${a.y2 * 1.5}" stroke="#ffd83d" stroke-width="1.1"
        stroke-linecap="round" ${a.style === 'dashed' ? 'stroke-dasharray="3 2.4"' : ''}/>
      <polygon points="${a.x2},${a.y2 * 1.5} ${p1x},${p1y} ${p2x},${p2y}" fill="#ffd83d"/>`;
  }).join('');
}
function boardPitchSVG() {
  return `<svg class="pitch" viewBox="0 0 100 150" aria-hidden="true">
    <defs><linearGradient id="bgrass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a9b66"/><stop offset="1" stop-color="#2b7f52"/>
    </linearGradient></defs>
    <rect width="100" height="150" fill="url(#bgrass)"/>
    <g fill="none" stroke="#fff" stroke-width=".7" opacity=".85">
      <rect x="4" y="4" width="92" height="142"/>
      <line x1="4" y1="75" x2="96" y2="75"/>
      <circle cx="50" cy="75" r="14"/><circle cx="50" cy="75" r="1" fill="#fff"/>
      <rect x="24" y="4" width="52" height="20"/><rect x="38" y="4" width="24" height="8"/>
      <rect x="24" y="126" width="52" height="20"/><rect x="38" y="138" width="24" height="8"/>
      <path d="M34 24a18 14 0 0 0 32 0"/><path d="M34 126a18 14 0 0 1 32 0"/>
    </g>
  </svg>`;
}

function boardCandPanelHTML() {
  const cands = candidateList();
  const placed = new Set(bd.ourPins.map((p) => p.memberId).filter(Boolean));
  const opp = bd.opponentId ? store.opponents.byId(bd.opponentId) : null;
  return `
    <div class="board-panel-sec">
      <div class="section-title" style="margin-top:0">라인업 후보 <span class="count">${cands.length}</span></div>
      <div class="cand-hint">선수를 눌러 고른 뒤 보드의 자리를 누르면 배치됩니다</div>
      <div class="cand-list">${cands.length ? cands.map((m) => `
        <button type="button" class="cand-chip${placed.has(m.id) ? ' placed' : ''}${bd.pendingCand === m.id ? ' picking' : ''}"
          data-cand="${m.id}">${esc(m.name)}${placed.has(m.id) ? ' ✓' : ''}</button>`).join('')
        : '<div class="empty" style="padding:16px"><div>오늘 가능 선수가 없습니다. 우리팀 탭에서 출석을 먼저 체크하세요.</div></div>'}</div>
    </div>
    <div class="board-panel-sec">
      <div class="section-title">상대 메모</div>
      ${opp ? `<div class="card flat" style="padding:12px">
          <b>${esc(opp.name)}</b>${opp.formation ? ` <span class="chip">${esc(opp.formation)}</span>` : ''}
          ${opp.keyPlayers ? `<div class="opp-line" style="margin-top:6px"><span class="k">핵심</span>${esc(opp.keyPlayers)}</div>` : ''}
          ${opp.strengths ? `<div class="opp-line"><span class="k">강점</span>${esc(opp.strengths)}</div>` : ''}
          ${opp.weaknesses ? `<div class="opp-line"><span class="k">약점</span>${esc(opp.weaknesses)}</div>` : ''}
        </div>` : '<div class="dim">선택된 상대가 없습니다.</div>'}
    </div>`;
}

function renderBoard() {
  const root = $('#view-board');
  if (!root) return;
  const matches = boardMatches();
  // render() 는 다른 탭에 있을 때도 배경에서 모든 화면을 다시 그린다(app.js 공통 패턴) — 이때는
  // 아직 회원·경기 데이터가 없을 수 있으므로, "경기 자동 선택"은 사용자가 실제로 전술보드 탭에
  // 들어왔을 때(ui.tab === 'board')만 한 번 한다. 그래야 나중에 경기를 만들고 탭에 들어와도
  // "임시 라인업"에 갇히지 않는다.
  if (!bd.loadedFrom && ui.tab === 'board') {
    if (matches.length) loadBoardFor((store.matches.upcoming()[0] || matches[0]).id);
    else loadBoardTemp();
  }
  // 보드가 켜진 채로 다른 곳에서 선택된 경기가 지워졌으면 임시 라인업으로 조용히 내려온다
  if (bd.matchId && !matches.some((m) => m.id === bd.matchId)) loadBoardTemp();

  if (bd.viewMode === 'live') { renderBoardLive(root); bindBoardPointer(); return; }
  renderBoardPrep(root, matches);
  bindBoardPointer();
}

/** 경기 모드(S4) — 세로 폰·한 손 조작·야외 고대비. 준비 모드와 같은 bd 상태를 그대로 쓴다 */
function renderBoardLive(root) {
  const opp = bd.opponentId ? store.opponents.byId(bd.opponentId) : null;
  const g = bd.matchId ? store.matches.byId(bd.matchId) : null;
  root.innerHTML = `
    <div class="board-live" id="bd-live-root">
      <div class="live-topbar">
        <button type="button" class="livebtn lockbtn${bd.locked ? ' on' : ''}" id="bd-lock" aria-pressed="${bd.locked}">${bd.locked ? '🔒 잠김' : '🔓 잠금'}</button>
        <div class="live-title">${esc(opp ? opp.name : '상대 미정')}${g ? ` · ${esc(fmtDate(g.date))}` : ''}</div>
        <button type="button" class="livebtn ghost" id="bd-exit-live">준비 모드로</button>
      </div>
      <div class="pitch-wrap live-pitch" id="bd-pitch">
        ${boardPitchSVG()}
        <svg class="draw-layer on" id="bd-arrows" viewBox="0 0 100 150" preserveAspectRatio="none" style="pointer-events:none">${arrowsSVG()}</svg>
        <div id="bd-pins" style="position:absolute;inset:0">
          ${bd.oppPins.map(oppPinHTML).join('')}
          ${bd.ourPins.map(ourPinHTML).join('')}
          ${ballHTML()}
        </div>
        ${bd.locked ? '<div class="live-lock-veil">잠김 — 잠금 버튼을 길게 눌러 해제</div>' : ''}
      </div>
      ${bd.mode === 'sub' ? '<div class="live-hint">우리 선수를 눌러 교체하세요</div>' : ''}
      ${bd.mode === 'arrow' ? `<div class="row" style="justify-content:center;gap:8px;margin:6px 0">
          <button class="toolbtn" data-astyle="solid" aria-pressed="${bd.arrowStyle === 'solid'}">실선</button>
          <button class="toolbtn" data-astyle="dashed" aria-pressed="${bd.arrowStyle === 'dashed'}">점선</button>
        </div>` : ''}
      <div class="live-presets">
        ${Object.entries(QUICK_INSTRUCTION_PRESETS).map(([k, p]) => `<button type="button" class="livebtn preset" data-preset="${k}">${esc(p.label)}</button>`).join('')}
      </div>
      <div class="live-bottom">
        <button type="button" class="livebtn big" id="bd-live-sub" aria-pressed="${bd.mode === 'sub'}">선수 교체</button>
        <button type="button" class="livebtn big" id="bd-live-arrow" aria-pressed="${bd.mode === 'arrow'}">화살표</button>
        <button type="button" class="livebtn big" id="bd-live-clear">지우기</button>
      </div>
      <div class="footer-note">${esc(APP_NAME)} · ${APP_VERSION}</div>
    </div>`;
}

function renderBoardPrep(root, matches) {
  const opponents = store.opponents.all().slice().sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  root.innerHTML = `
    <div class="row" style="margin:10px 0 8px;gap:8px">
      <div class="seg-wide" id="bd-view-mode" style="flex:0 0 auto">
        <button type="button" data-vm="prep" aria-pressed="true">준비 모드</button>
        <button type="button" data-vm="live" aria-pressed="false">경기 모드</button>
      </div>
    </div>
    <div class="board-layout">
      <div class="board-main">
        <div class="selectrow">
          <select id="bd-match"><option value="" ${!bd.matchId ? 'selected' : ''}>임시 라인업 (경기 미선택)</option>
            ${matches.map((m) => {
    const o = m.opponentId ? store.opponents.byId(m.opponentId) : null;
    return `<option value="${m.id}" ${bd.matchId === m.id ? 'selected' : ''}>${esc(fmtDate(m.date))} · ${o ? esc(o.name) : '상대 미정'}${m.boardSnapshot ? ' ★' : ''}</option>`;
  }).join('')}</select>
        </div>
        <div class="row" style="margin:6px 0 10px">
          <select id="bd-opponent" class="grow"><option value="">상대 직접 선택 안 함</option>
            ${opponents.map((o) => `<option value="${o.id}" ${bd.opponentId === o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>
        </div>
        <div class="row" style="margin-bottom:8px">
          <select id="bd-formation" style="max-width:120px">${FORMATION_PRESETS.map((f) => `<option value="${f}" ${bd.formation === f ? 'selected' : ''}>우리 ${f}</option>`).join('')}</select>
          <select id="bd-opp-formation" style="max-width:120px">${FORMATION_PRESETS.map((f) => `<option value="${f}" ${bd.oppFormation === f ? 'selected' : ''}>상대 ${f}</option>`).join('')}</select>
        </div>
        <div class="pitch-wrap" id="bd-pitch">
          ${boardPitchSVG()}
          <svg class="draw-layer on" id="bd-arrows" viewBox="0 0 100 150" preserveAspectRatio="none" style="pointer-events:none">${arrowsSVG()}</svg>
          <div id="bd-pins" style="position:absolute;inset:0">
            ${bd.oppPins.map(oppPinHTML).join('')}
            ${bd.ourPins.map(ourPinHTML).join('')}
            ${ballHTML()}
          </div>
        </div>
        <div class="tool-row">
          <button class="toolbtn" id="bd-m-move" aria-pressed="${bd.mode === 'move'}">이동</button>
          <button class="toolbtn" id="bd-m-arrow" aria-pressed="${bd.mode === 'arrow'}">화살표</button>
          ${bd.mode === 'arrow' ? `
            <button class="toolbtn" data-astyle="solid" aria-pressed="${bd.arrowStyle === 'solid'}">실선</button>
            <button class="toolbtn" data-astyle="dashed" aria-pressed="${bd.arrowStyle === 'dashed'}">점선</button>` : ''}
          <span style="flex:1"></span>
          <button class="toolbtn" id="bd-undo" ${bd.arrows.length ? '' : 'disabled style="opacity:.4"'}>되돌리기</button>
          <button class="toolbtn" id="bd-clear" ${bd.arrows.length ? '' : 'disabled style="opacity:.4"'}>전체 지우기</button>
        </div>
        <div class="row" style="margin-top:8px;flex-wrap:wrap;gap:6px">
          ${Object.entries(SET_PIECE_TEMPLATES).map(([k, sp]) => `<button class="toolbtn" data-setpiece="${k}">${esc(sp.label)}</button>`).join('')}
          <button class="toolbtn" id="bd-ball-clear">공 지우기</button>
        </div>
        <div class="row" style="margin-top:12px">
          <button class="btn grow" id="bd-reset">다시 배치</button>
          <button class="btn grow primary" id="bd-save" ${bd.matchId ? '' : 'disabled style="opacity:.5"'}>보드 저장</button>
        </div>
        <div class="row" style="margin-top:8px">
          <button class="btn block grow" id="bd-png">보드 이미지 저장(PNG)</button>
        </div>
        ${!bd.matchId ? '<div class="dim" style="margin-top:6px;font-size:12px">경기를 선택하면 이 배치를 경기 기록에 저장할 수 있습니다.</div>' : ''}
        <div class="footer-note">${esc(APP_NAME)} · ${APP_VERSION}</div>
      </div>
      <button type="button" class="board-panel-toggle" id="bd-panel-toggle" aria-expanded="${bd.panelOpen}">라인업 후보 · 상대 메모 ${bd.panelOpen ? '접기 ▾' : '펼치기 ▸'}</button>
      <div class="board-panel${bd.panelOpen ? ' open' : ''}" id="bd-panel">${boardCandPanelHTML()}</div>
    </div>`;
}

/* ---------- 포인터: 핀/공 드래그 · 화살표 · 후보 드래그 투입 ---------- */
function bindBoardPointer() {
  const pitch = $('#bd-pitch');
  if (!pitch) return;
  const pct = (e) => {
    const r = pitch.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)),
    };
  };
  const redrawPins = () => {
    const box = $('#bd-pins');
    if (!box) return;
    box.innerHTML = `${bd.oppPins.map(oppPinHTML).join('')}${bd.ourPins.map(ourPinHTML).join('')}${ballHTML()}`;
  };
  const redrawArrows = () => {
    const svg = $('#bd-arrows');
    if (svg) svg.innerHTML = arrowsSVG();
    const u = $('#bd-undo'); const c = $('#bd-clear');
    [u, c].forEach((b) => { if (b) { b.disabled = !bd.arrows.length; b.style.opacity = bd.arrows.length ? '' : '.4'; } });
  };

  $('#bd-pins')?.addEventListener('pointerdown', (e) => {
    if (bd.locked) return;   // 잠금 중엔 드래그·그리기·교체를 모두 무시한다
    const ball = e.target.closest('[data-ball]');
    const pin = e.target.closest('.pin');
    if (!ball && !pin) return;
    e.preventDefault();

    // 경기 모드 · 교체 모드 — 우리 핀을 탭하면 드래그 없이 바로 교체 시트를 연다
    if (bd.viewMode === 'live' && bd.mode === 'sub') {
      if (pin && pin.dataset.side === 'us') substituteSheet(Number(pin.dataset.idx));
      return;
    }

    const target = e.target.closest('.pin, .ball-marker');
    target.setPointerCapture?.(e.pointerId);

    if (bd.mode === 'arrow' && pin) {
      const side = pin.dataset.side; const idx = Number(pin.dataset.idx);
      const src = side === 'us' ? bd.ourPins[idx] : bd.oppPins[idx];
      const stroke = { x1: src.x, y1: src.y, x2: src.x, y2: src.y, style: bd.arrowStyle };
      const redrawArrowsLive = () => { const svg = $('#bd-arrows'); if (svg) svg.innerHTML = arrowsSVG() + arrowPreviewSVG(stroke); };
      const move = (ev) => { const p = pct(ev); stroke.x2 = p.x; stroke.y2 = p.y; redrawArrowsLive(); };
      const up = () => {
        pitch.removeEventListener('pointermove', move); pitch.removeEventListener('pointerup', up); pitch.removeEventListener('pointercancel', cancel);
        if (Math.hypot(stroke.x2 - stroke.x1, stroke.y2 - stroke.y1) > 1.5) {
          bd.arrows.push(stroke); bd.dirty = true;
          if (bd.viewMode === 'live') autosaveBoard();
        }
        redrawArrows();
      };
      const cancel = () => { pitch.removeEventListener('pointermove', move); pitch.removeEventListener('pointerup', up); redrawArrows(); };
      pitch.addEventListener('pointermove', move);
      pitch.addEventListener('pointerup', up);
      pitch.addEventListener('pointercancel', cancel);
      return;
    }

    if (bd.viewMode === 'live') return;   // 안전장치 — 경기 모드에는 자유 이동(드래그) 모드가 없다

    // 이동 모드(준비 모드 전용) — 핀/공 드래그
    target.classList.add('dragging');
    const move = (ev) => {
      const p = pct(ev);
      if (ball) { bd.ball = { x: p.x, y: p.y }; }
      else {
        const side = pin.dataset.side; const idx = Number(pin.dataset.idx);
        (side === 'us' ? bd.ourPins : bd.oppPins)[idx] = { ...(side === 'us' ? bd.ourPins : bd.oppPins)[idx], x: p.x, y: p.y };
      }
      target.style.left = p.x + '%'; target.style.top = p.y + '%';
    };
    const up = () => {
      target.classList.remove('dragging');
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      bd.dirty = true;
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  });

  // 경기 모드 — 잠금 버튼: 짧게 누르면 잠기고, 잠긴 상태에서는 길게(600ms) 눌러야 풀린다
  const lockBtn = $('#bd-lock');
  if (lockBtn) {
    let holdTimer = null; let longPressed = false;
    lockBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      longPressed = false;
      if (bd.locked) holdTimer = setTimeout(() => { longPressed = true; bd.locked = false; toast('잠금 해제'); renderBoard(); }, 600);
    });
    const finishHold = () => {
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      if (!bd.locked && !longPressed) { bd.locked = true; toast('보드 잠금 — 길게 눌러 해제'); renderBoard(); }
    };
    lockBtn.addEventListener('pointerup', finishHold);
    lockBtn.addEventListener('pointercancel', finishHold);
  }

  // 후보 선수 → 보드 자리로 드래그 투입 (포인터 기반, 터치 포함)
  $('#bd-panel')?.addEventListener('pointerdown', (e) => {
    const chip = e.target.closest('.cand-chip');
    if (!chip) return;
    e.preventDefault();
    const memberId = chip.dataset.cand;
    const ghost = document.createElement('div');
    ghost.className = 'cand-ghost';
    ghost.textContent = chip.textContent.replace(' ✓', '');
    document.body.appendChild(ghost);
    const moveGhost = (ev) => { ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px'; };
    moveGhost(e);
    let overIdx = -1;
    const move = (ev) => {
      moveGhost(ev);
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const pin = el?.closest?.('.pin[data-side="us"]');
      $$('.pin.us.drop-target').forEach((n) => n.classList.remove('drop-target'));
      overIdx = pin ? Number(pin.dataset.idx) : -1;
      if (pin) pin.classList.add('drop-target');
    };
    const up = (ev) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      ghost.remove();
      $$('.pin.us.drop-target').forEach((n) => n.classList.remove('drop-target'));
      if (overIdx >= 0) assignCandidateToSlot(memberId, overIdx);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });
}

function arrowPreviewSVG(s) {
  return `<line x1="${s.x1}" y1="${s.y1 * 1.5}" x2="${s.x2}" y2="${s.y2 * 1.5}" stroke="#ffd83d" stroke-width="1.1"
    stroke-linecap="round" opacity=".8" ${s.style === 'dashed' ? 'stroke-dasharray="3 2.4"' : ''}/>`;
}

/** 후보 선수를 보드의 i번 자리에 넣는다. 이미 배치된 선수면 자리를 맞바꾼다(선수 자체가 사라지지 않게) */
function assignCandidateToSlot(memberId, i) {
  const mem = store.members.byId(memberId);
  if (!mem || !bd.ourPins[i]) return;
  const fromIdx = bd.ourPins.findIndex((p) => p.memberId === memberId);
  const target = bd.ourPins[i];
  if (fromIdx >= 0 && fromIdx !== i) {
    const prevTarget = { ...target };
    bd.ourPins[i] = { ...target, memberId: mem.id, name: mem.name };
    bd.ourPins[fromIdx] = { ...bd.ourPins[fromIdx], memberId: prevTarget.memberId, name: prevTarget.name };
  } else {
    bd.ourPins[i] = { ...target, memberId: mem.id, name: mem.name };
  }
  bd.dirty = true;
  renderBoard();
  toast(`${mem.name} 배치`);
}

function boardSnapshotFromState() {
  return {
    formation: bd.formation, oppFormation: bd.oppFormation,
    ourPins: bd.ourPins.map((p) => ({ ...p })), oppPins: bd.oppPins.map((p) => ({ ...p })),
    arrows: bd.arrows.map((a) => ({ ...a })), ball: bd.ball ? { ...bd.ball } : null,
    setPiece: bd.setPiece || null, updatedAt: new Date().toISOString(),
  };
}

function saveBoardSnapshot() {
  if (!bd.matchId) { toast('경기를 선택해야 저장할 수 있습니다', 'err'); return; }
  store.matches.update(bd.matchId, { boardSnapshot: boardSnapshotFromState() });
  bd.dirty = false;
  toast('보드를 경기에 저장했습니다');
  renderBoard();
}

/* ================= 전술보드 — 경기 모드 (S4, 2026-09-29) =================
 * 마스터플랜 §3·§4(S4): 세로 폰·한 손 조작·야외 고대비. 준비 모드와 같은 bd 상태를 그대로 쓰되
 * 화면(renderBoard 의 isLive 분기)과 입력 게이트(잠금)만 다르다. 변경은 즉시 저장(자동) —
 * 준비 모드의 "보드 저장" 버튼이 하는 일을 매 조작마다 조용히 대신한다.
 */

/** 경기 모드에서의 변경을 그 자리에서 저장한다. 임시 라인업(경기 미선택)이면 조용히 무시 */
function autosaveBoard() {
  if (!bd.matchId) return;
  store.matches.update(bd.matchId, { boardSnapshot: boardSnapshotFromState(), substitutions: bd.substitutions.map((s) => ({ ...s })) });
  bd.dirty = false;
}

let wakeLockRef = null;
/** 화면 꺼짐 방지 — 미지원 브라우저/거부된 요청은 조용히 무시한다(핵심 기능이 아니므로 없어도 앱은 그대로 동작) */
async function requestWakeLock() {
  try {
    if (!('wakeLock' in navigator)) return;
    if (wakeLockRef && !wakeLockRef.released) return;
    wakeLockRef = await navigator.wakeLock.request('screen');
    wakeLockRef.addEventListener?.('release', () => { wakeLockRef = null; });
  } catch (e) { wakeLockRef = null; /* 미지원·거부 — 무시 */ }
}
async function releaseWakeLock() {
  try { await wakeLockRef?.release?.(); } catch (e) { /* 무시 */ }
  wakeLockRef = null;
}

function enterLiveMode() {
  if (!bd.matchId) { toast('경기를 선택해야 경기 모드를 쓸 수 있습니다', 'err'); return; }
  bd.viewMode = 'live';
  bd.locked = false;
  bd.mode = 'sub';
  requestWakeLock();
  renderBoard();
}
function exitLiveMode() {
  bd.viewMode = 'prep';
  bd.mode = 'move';
  bd.locked = false;
  releaseWakeLock();
  renderBoard();
}

/** 빠른 지시 프리셋 — 화살표 묶음을 그 자리에서 덧그린다(기존 화살표는 남는다) */
function applyQuickPreset(key) {
  if (bd.locked) return;
  const tpl = QUICK_INSTRUCTION_PRESETS[key];
  if (!tpl) return;
  bd.arrows = [...bd.arrows, ...tpl.arrows.map((a) => ({ ...a }))];
  bd.dirty = true;
  toast(`빠른 지시: ${tpl.label}`);
  if (bd.viewMode === 'live') autosaveBoard();
  renderBoard();
}

/** 경기 모드 — 오늘 가능 선수 중 지금 보드에 없는 선수(교체 후보) */
function subCandidates() {
  const onBoard = new Set(bd.ourPins.map((p) => p.memberId).filter(Boolean));
  const pool = availableToday().length ? availableToday() : store.members.active();
  return pool.filter((m) => !onBoard.has(m.id));
}

/** 핀을 탭했을 때 뜨는 교체 후보 시트 — 분(선택) 입력 + 큰 버튼 목록, 탭하면 즉시 교체 */
function substituteSheet(pinIdx) {
  const outPin = bd.ourPins[pinIdx];
  if (!outPin) return;
  const cands = subCandidates();
  openModal(`
    <h3>선수 교체${outPin.name ? ` · ${esc(outPin.name)} 나감` : ''}</h3>
    <div class="field"><label>몇 분 (선택)</label><input type="number" min="0" max="130" inputmode="numeric" id="f-sub-min" placeholder="예: 35"></div>
    <div class="section-title" style="margin-top:6px">들어올 선수</div>
    <div class="sub-cand-list">${cands.length ? cands.map((m) => `
        <button type="button" class="btn block sub-cand-btn" data-sub-in="${m.id}">${esc(m.name)}</button>`).join('')
      : '<div class="dim" style="padding:8px 0">교체로 넣을 수 있는 선수가 없습니다(오늘 가능 선수가 모두 보드에 있습니다).</div>'}</div>
    <div class="foot"><button class="btn ghost" data-act="cancel">닫기</button></div>`, (m) => {
    m.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="cancel"]')) return closeModal();
      const btn = e.target.closest('[data-sub-in]');
      if (!btn) return;
      const inId = btn.dataset.subIn;
      const minuteVal = $('#f-sub-min', m).value;
      const minute = minuteVal.trim() ? Math.max(0, Math.min(130, Math.round(Number(minuteVal)))) : null;
      closeModal();
      substitutePlayer(pinIdx, inId, minute);
    });
  });
}

/** 실제 교체 — 자리의 회원을 바꾸고 substitutions 에 기록, 경기 모드면 즉시 저장 */
function substitutePlayer(pinIdx, inMemberId, minute) {
  const outPin = bd.ourPins[pinIdx];
  const inMem = store.members.byId(inMemberId);
  if (!outPin || !inMem) return;
  const outId = outPin.memberId;
  bd.ourPins[pinIdx] = { ...outPin, memberId: inMem.id, name: inMem.name };
  bd.substitutions = [...bd.substitutions, { minute, out: outId, in: inMem.id }];
  bd.dirty = true;
  if (bd.viewMode === 'live') autosaveBoard();
  toast(`교체: ${inMem.name} 투입`);
  renderBoard();
}

async function exportBoardPNG() {
  const W = 760; const PH = Math.round(W * 1.5); const HEAD = 84;
  const c = document.createElement('canvas');
  c.width = W; c.height = PH + HEAD + 40;
  const x = c.getContext('2d');
  x.fillStyle = '#f7f4ee'; x.fillRect(0, 0, c.width, c.height);
  const opp = bd.opponentId ? store.opponents.byId(bd.opponentId) : null;
  x.fillStyle = '#241f1a'; x.font = '900 26px -apple-system, Malgun Gothic, sans-serif';
  x.fillText(`전술보드 · 우리(${bd.formation}) vs ${opp ? opp.name : '상대'}(${bd.oppFormation})`, 20, 38);
  x.fillStyle = '#6b6255'; x.font = '700 16px -apple-system, Malgun Gothic, sans-serif';
  x.fillText(`${store.club.name()} · ${APP_NAME} ${APP_VERSION}`, 20, 62);

  const oy = HEAD;
  const grad = x.createLinearGradient(0, oy, 0, oy + PH);
  grad.addColorStop(0, '#3a9b66'); grad.addColorStop(1, '#2b7f52');
  x.fillStyle = grad; x.fillRect(0, oy, W, PH);
  const sx = (v) => (v / 100) * W; const sy = (v) => oy + (v / 150) * PH;
  x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 2.2;
  x.strokeRect(sx(4), sy(4), sx(92), sy(146) - sy(4));
  x.beginPath(); x.moveTo(sx(4), sy(75)); x.lineTo(sx(96), sy(75)); x.stroke();
  x.beginPath(); x.ellipse(sx(50), sy(75), sx(14), sy(89) - sy(75), 0, 0, Math.PI * 2); x.stroke();

  for (const a of bd.arrows) {
    x.strokeStyle = '#e0a800'; x.lineWidth = 4; x.lineCap = 'round';
    if (a.style === 'dashed') x.setLineDash([10, 8]); else x.setLineDash([]);
    x.beginPath(); x.moveTo(sx(a.x1), oy + (a.y1 / 100) * PH); x.lineTo(sx(a.x2), oy + (a.y2 / 100) * PH); x.stroke();
    x.setLineDash([]);
  }
  x.fillStyle = '#2b7f52';
  bd.oppPins.forEach((p) => {
    const px = sx(p.x); const py = oy + (p.y / 100) * PH;
    x.beginPath(); x.arc(px, py, 17, 0, Math.PI * 2);
    x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 2.4; x.setLineDash([4, 3]); x.stroke(); x.setLineDash([]);
    x.fillStyle = '#fff'; x.font = '800 12px sans-serif'; x.textAlign = 'center'; x.fillText(p.pos, px, py + 4);
  });
  bd.ourPins.forEach((p, i) => {
    const px = sx(p.x); const py = oy + (p.y / 100) * PH;
    x.beginPath(); x.arc(px, py, 19, 0, Math.PI * 2);
    x.fillStyle = p.gk ? '#f2b705' : '#2f5fa8'; x.fill();
    x.lineWidth = 3; x.strokeStyle = 'rgba(255,255,255,.9)'; x.stroke();
    x.fillStyle = '#fff'; x.font = '900 15px sans-serif'; x.textAlign = 'center';
    x.fillText(p.gk ? 'GK' : String(i), px, py + 5);
    if (p.name) {
      x.font = '800 15px -apple-system, Malgun Gothic, sans-serif';
      const w = x.measureText(p.name).width;
      x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(px - w / 2 - 6, py + 22, w + 12, 21);
      x.fillStyle = '#fff'; x.fillText(p.name, px, py + 37);
    }
    x.textAlign = 'left';
  });
  if (bd.ball) {
    const bx = sx(bd.ball.x); const by = oy + (bd.ball.y / 100) * PH;
    x.font = '20px sans-serif'; x.textAlign = 'center'; x.fillText('⚽', bx, by + 7); x.textAlign = 'left';
  }
  x.fillStyle = '#9a9183'; x.font = '600 14px -apple-system, Malgun Gothic, sans-serif';
  x.fillText(`${APP_NAME} 앱 ${APP_VERSION}`, 20, c.height - 12);

  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  await shareOrDownload(new File([blob], `축구joy_전술보드_${todayStr()}.png`, { type: 'image/png' }), blob);
}

/* ================= 상대팀 (S2) =================
 * 상대 클럽 카드 목록. 전적(record)은 항상 경기 기록에서 계산된 값을 보여줄 뿐 이 화면에서 고치지 않는다.
 */
function opponentRow(o) {
  const rec = store.opponents.recordLabel(o);
  return `<button type="button" class="opp-card" data-opp-open="${o.id}">
    <div class="opp-top"><b>${esc(o.name)}</b>${o.formation ? `<span class="chip">${esc(o.formation)}</span>` : ''}</div>
    <div class="opp-rec">${esc(rec)}</div>
    ${o.strengths ? `<div class="opp-line"><span class="k">강점</span>${esc(o.strengths)}</div>` : ''}
    ${o.weaknesses ? `<div class="opp-line"><span class="k">약점</span>${esc(o.weaknesses)}</div>` : ''}
  </button>`;
}

function renderOpponent() {
  const root = $('#view-opponent');
  const list = store.opponents.all().slice().sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  let html = `<div class="row" style="margin:12px 0 10px">
    <button class="btn primary grow" id="btn-add-opponent">${ICON.plus} 상대팀 추가</button>
  </div>`;
  if (!list.length) {
    html += `<div class="empty">${ICON.team}<div class="big">등록된 상대팀이 없습니다</div>
      <div>경기 전에 상대 클럽 카드를 만들어 두면 경기 기록·전적이 여기 쌓입니다.</div></div>`;
  } else {
    html += `<div class="section-title">상대 클럽 <span class="count">${list.length}</span></div>`;
    html += list.map(opponentRow).join('');
  }
  root.innerHTML = html;
}

function opponentModal(existing) {
  const o0 = existing || { name: '', formation: '', keyPlayers: '', strengths: '', weaknesses: '' };
  const isCustom = !!o0.formation && !FORMATION_PRESETS.includes(o0.formation);
  openModal(`
    <h3>${existing ? '상대팀 수정' : '상대팀 추가'}</h3>
    <div class="field"><label>클럽 이름</label><input type="text" id="f-opp-name" value="${esc(o0.name)}" placeholder="예: 은빛FC" autocomplete="off"></div>
    <div class="field"><label>포메이션 (선택)</label>
      <div class="seg-wide wrap" id="f-opp-formation">
        ${FORMATION_PRESETS.map((f) => `<button type="button" data-f="${f}" aria-pressed="${o0.formation === f}">${f}</button>`).join('')}
        <button type="button" data-f="__custom" aria-pressed="${isCustom}">기타</button>
      </div>
      <input type="text" id="f-opp-formation-custom" placeholder="예: 3-4-3 변형" value="${isCustom ? esc(o0.formation) : ''}"
        style="margin-top:8px${isCustom ? '' : ';display:none'}">
    </div>
    <div class="field"><label>핵심 선수 메모</label><textarea id="f-opp-key" rows="2" placeholder="예: 10번 왼발 킥이 위협적">${esc(o0.keyPlayers)}</textarea></div>
    <div class="field"><label>강점 메모</label><textarea id="f-opp-str" rows="2">${esc(o0.strengths)}</textarea></div>
    <div class="field"><label>약점 메모</label><textarea id="f-opp-weak" rows="2">${esc(o0.weaknesses)}</textarea></div>
    <div class="foot">
      ${existing ? '<button class="btn danger" data-act="del">삭제</button>' : ''}
      <button class="btn ghost" data-act="cancel">취소</button>
      <button class="btn primary" data-act="save">저장</button>
    </div>`, (m) => {
    m.addEventListener('click', async (e) => {
      const fb = e.target.closest('#f-opp-formation [data-f]');
      if (fb) {
        const custom = $('#f-opp-formation-custom', m);
        custom.style.display = fb.dataset.f === '__custom' ? '' : 'none';
        if (fb.dataset.f === '__custom') custom.focus();
        $$('#f-opp-formation [data-f]', m).forEach((b) => b.setAttribute('aria-pressed', String(b === fb)));
        return;
      }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'cancel') return closeModal();
      if (act === 'del') {
        closeModal();
        if (await confirmDialog({ title: `${existing.name} 상대 카드를 삭제할까요?`, body: '이 상대와 치른 경기 기록은 그대로 남고, 경기의 상대 연결만 풀립니다.', ok: '삭제', danger: true })) {
          store.opponents.remove(existing.id);
          toast('삭제했습니다'); render();
        }
        return;
      }
      const name = $('#f-opp-name', m).value.trim();
      if (!name) { toast('클럽 이름을 입력해 주세요', 'err'); return; }
      const activeBtn = $('#f-opp-formation [aria-pressed="true"]', m);
      const formation = activeBtn?.dataset.f === '__custom' ? $('#f-opp-formation-custom', m).value.trim() : (activeBtn?.dataset.f || '');
      const data = { name, formation,
        keyPlayers: $('#f-opp-key', m).value.trim(), strengths: $('#f-opp-str', m).value.trim(), weaknesses: $('#f-opp-weak', m).value.trim() };
      if (existing) { store.opponents.update(existing.id, data); toast('수정했습니다'); }
      else { store.opponents.add(data); toast(`${name} 추가`); }
      closeModal(); render();
      if (ui.tab !== 'opponent') switchTab('opponent');
    });
  });
}

function matchMiniRow(g) {
  const score = g.result ? `${g.result.gf}:${g.result.ga}` : '결과 없음';
  // data-oppmatch-open (data-match-open 아님) — 상대 상세 모달 안에서만 로컬로 받는다.
  // 전역 document 클릭 핸들러도 data-match-open 을 듣기 때문에, 같은 이름이면
  // 모달을 닫기 전에 두 핸들러가 한 클릭에 겹쳐 뜬다(모달이 이중으로 열림).
  return `<button type="button" class="matchmini" data-oppmatch-open="${g.id}">
    <span>${esc(fmtDate(g.date))}</span><span class="dim">${g.home === false ? '원정' : '홈'}</span><b>${esc(score)}</b>
  </button>`;
}

function opponentDetailModal(id) {
  const o = store.opponents.byId(id);
  if (!o) return;
  const matches = store.opponents.matchesOf(id);
  openModal(`
    <h3>${esc(o.name)}</h3>
    <div class="detail-chips">${o.formation ? `<span class="chip">${esc(o.formation)}</span>` : ''}<span class="chip">${esc(store.opponents.recordLabel(o))}</span></div>
    ${o.keyPlayers ? `<div class="opp-line"><span class="k">핵심 선수</span>${esc(o.keyPlayers)}</div>` : ''}
    ${o.strengths ? `<div class="opp-line"><span class="k">강점</span>${esc(o.strengths)}</div>` : ''}
    ${o.weaknesses ? `<div class="opp-line"><span class="k">약점</span>${esc(o.weaknesses)}</div>` : ''}
    <div class="section-title" style="margin-top:14px">메모 <span class="count">${o.notes.length}</span></div>
    <div class="notelist">${o.notes.length ? o.notes.slice().reverse().map((n) => `<div class="noterow"><span class="dim">${esc(fmtWhen(n.at))}</span>${esc(n.text)}</div>`).join('') : '<div class="dim">메모가 없습니다</div>'}</div>
    <div class="row" style="margin-top:6px"><input type="text" id="f-opp-note" placeholder="짧은 메모 추가" style="flex:1" maxlength="300"><button class="btn sm primary" data-act="addnote">추가</button></div>
    <div class="section-title" style="margin-top:14px">경기 이력 <span class="count">${matches.length}</span></div>
    ${matches.length ? matches.map(matchMiniRow).join('') : '<div class="dim">아직 경기 기록이 없습니다</div>'}
    <div class="foot">
      <button class="btn danger" data-act="del">삭제</button>
      <button class="btn ghost" data-act="edit">수정</button>
      <button class="btn primary" data-act="close">닫기</button>
    </div>`, (m) => {
    m.addEventListener('click', async (e) => {
      const mo = e.target.closest('[data-oppmatch-open]');
      if (mo) { closeModal(); return afterModalClose(() => matchDetailModal(mo.dataset.oppmatchOpen)); }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'close') return closeModal();
      if (act === 'edit') { closeModal(); return afterModalClose(() => opponentModal(o)); }
      if (act === 'del') {
        closeModal();
        if (await confirmDialog({ title: `${o.name} 상대 카드를 삭제할까요?`, body: '경기 기록은 그대로 남고, 상대 연결만 풀립니다.', ok: '삭제', danger: true })) {
          store.opponents.remove(o.id); toast('삭제했습니다'); render();
        }
        return;
      }
      if (act === 'addnote') {
        const v = $('#f-opp-note', m).value.trim();
        if (!v) { toast('메모를 입력해 주세요', 'err'); return; }
        store.opponents.addNote(o.id, v);
        closeModal(); afterModalClose(() => opponentDetailModal(o.id));
      }
    });
  });
}

/* ================= 경기 (S2) =================
 * 경기 만들기(기본 정보) → 라인업(포지션별 목록 배치) → 결과(득/실·득점자·도움·총평).
 * 저장할 때마다 store 가 상대 카드 전적을 다시 계산한다 — 여기서는 화면만 그린다.
 */
function statusChip(s) { return `<span class="chip">${esc(s)}</span>`; }

function matchRow(g) {
  const o = g.opponentId ? store.opponents.byId(g.opponentId) : null;
  return `<button type="button" class="match-card" data-match-open="${g.id}">
    <div class="match-top"><b>${esc(fmtDate(g.date))}</b>${statusChip(g.status)}</div>
    <div class="match-mid"><span class="opp">${o ? esc(o.name) : '상대 미정'}</span>
      ${g.result ? `<b class="score">${g.result.gf} : ${g.result.ga}</b>` : ''}
      <span class="ha">${g.home === false ? '원정' : '홈'}</span></div>
    ${g.place ? `<div class="match-place">${esc(g.place)}</div>` : ''}
  </button>`;
}

function renderMatch() {
  const root = $('#view-match');
  const list = store.matches.sorted();
  let html = `<div class="row" style="margin:12px 0 10px">
    <button class="btn primary grow" id="btn-add-match">${ICON.plus} 경기 만들기</button>
  </div>`;
  if (!list.length) {
    html += `<div class="empty">${ICON.ball}<div class="big">경기 기록이 없습니다</div>
      <div>상대를 고르고 라인업·결과까지 한 흐름으로 남길 수 있습니다.</div></div>`;
  } else {
    html += `<div class="section-title">경기 <span class="count">${list.length}</span></div>`;
    html += list.map(matchRow).join('');
  }
  root.innerHTML = html;
}

function matchInfoModal(existing) {
  const g0 = existing || { date: todayStr(), place: '', status: '예정', opponentId: null, home: true };
  const opps = store.opponents.all().slice().sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  openModal(`
    <h3>${existing ? '경기 정보 수정' : '경기 만들기'}</h3>
    <div class="field"><label>날짜</label><input type="date" id="f-g-date" value="${esc(g0.date)}"></div>
    <div class="field"><label>상대 클럽</label>
      <select id="f-g-opp">
        <option value="">상대 미정</option>
        ${opps.map((o) => `<option value="${o.id}" ${g0.opponentId === o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}
      </select>
      ${!opps.length ? '<div class="hint">먼저 상대팀 탭에서 클럽 카드를 만들어 두면 여기서 고를 수 있습니다.</div>' : ''}
    </div>
    <div class="field"><label>홈 / 원정</label>
      <div class="seg-wide" id="f-g-home">
        <button type="button" data-h="1" aria-pressed="${g0.home !== false}">홈</button>
        <button type="button" data-h="0" aria-pressed="${g0.home === false}">원정</button>
      </div>
    </div>
    <div class="field"><label>장소 메모 (선택)</label><input type="text" id="f-g-place" value="${esc(g0.place)}" placeholder="예: 시민운동장"></div>
    <div class="field"><label>상태</label>
      <div class="seg-wide" id="f-g-status">
        ${['예정', '확정', '종료'].map((s) => `<button type="button" data-s="${s}" aria-pressed="${g0.status === s}">${s}</button>`).join('')}
      </div>
    </div>
    <div class="foot">
      ${existing ? '<button class="btn danger" data-act="del">삭제</button>' : ''}
      <button class="btn ghost" data-act="cancel">취소</button>
      <button class="btn primary" data-act="save">저장</button>
    </div>`, (m) => {
    m.addEventListener('click', async (e) => {
      const hb = e.target.closest('#f-g-home [data-h]');
      if (hb) { $$('#f-g-home [data-h]', m).forEach((b) => b.setAttribute('aria-pressed', String(b === hb))); return; }
      const sb = e.target.closest('#f-g-status [data-s]');
      if (sb) { $$('#f-g-status [data-s]', m).forEach((b) => b.setAttribute('aria-pressed', String(b === sb))); return; }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'cancel') return closeModal();
      if (act === 'del') {
        closeModal();
        if (await confirmDialog({ title: '이 경기 기록을 삭제할까요?', body: '라인업·결과가 함께 삭제되고, 상대 전적이 다시 계산됩니다.', ok: '삭제', danger: true })) {
          store.matches.remove(existing.id); toast('삭제했습니다'); render();
        }
        return;
      }
      const date = $('#f-g-date', m).value || todayStr();
      const opponentId = $('#f-g-opp', m).value || null;
      const home = $('#f-g-home [aria-pressed="true"]', m)?.dataset.h !== '0';
      const place = $('#f-g-place', m).value.trim();
      const status = $('#f-g-status [aria-pressed="true"]', m)?.dataset.s || '예정';
      if (existing) {
        store.matches.update(existing.id, { date, opponentId, home, place, status });
        toast('수정했습니다');
        closeModal(); render();
        afterModalClose(() => matchDetailModal(existing.id));
      } else {
        const created = store.matches.add({ date, opponentId, home, place, status });
        toast('경기를 만들었습니다');
        closeModal(); render();
        afterModalClose(() => matchDetailModal(created.id));
      }
    });
  });
}

function lineupSummaryHTML(lu) {
  const slotsPos = formationSlots(lu.formation);
  return `<div class="lineup-sum">${lu.slots.map((mid, i) => {
    const mem = mid ? store.members.byId(mid) : null;
    return `<div class="ls-row"><span class="pos">${esc(slotsPos[i] || '')}</span><span>${mem ? esc(mem.name) : '<span class="dim">공석</span>'}</span></div>`;
  }).join('')}</div>`;
}

function resultSummaryHTML(g) {
  const scorers = g.scorers || [];
  return `<div class="result-sum">
    <div class="rs-score"><b>${g.result.gf} : ${g.result.ga}</b></div>
    ${scorers.length ? `<div class="rs-scorers">${scorers.map((s) => {
    const m = store.members.byId(s.memberId); const a = s.assistId ? store.members.byId(s.assistId) : null;
    return `<span class="chip">${esc(m ? m.name : '알 수 없음')}${s.count > 1 ? ` ×${s.count}` : ''}${a ? ` (도움 ${esc(a.name)})` : ''}</span>`;
  }).join('')}</div>` : ''}
    ${g.review ? `<div class="rs-review">${esc(g.review)}</div>` : ''}
  </div>`;
}

function matchDetailModal(id) {
  const g = store.matches.byId(id);
  if (!g) return;
  const o = g.opponentId ? store.opponents.byId(g.opponentId) : null;
  const lu = g.lineup;
  const luCount = lu?.slots ? lu.slots.filter(Boolean).length : 0;
  openModal(`
    <h3>${esc(fmtDate(g.date))} · ${o ? esc(o.name) : '상대 미정'}</h3>
    <div class="detail-chips">${statusChip(g.status)}<span class="chip">${g.home === false ? '원정' : '홈'}</span>${g.place ? `<span class="chip">${esc(g.place)}</span>` : ''}</div>
    <div class="section-title" style="margin-top:12px">라인업 <span class="count">${lu ? `${luCount}명 · ${esc(lu.formation || '')}` : '미정'}</span>
      <button class="btn sm ghost right" data-act="lineup">${lu ? '수정' : '만들기'}</button></div>
    ${lu && luCount ? lineupSummaryHTML(lu) : '<div class="dim">아직 라인업이 없습니다.</div>'}
    <div class="section-title" style="margin-top:14px">결과 <span class="count">${g.result ? `${g.result.gf}:${g.result.ga}` : '미입력'}</span>
      <button class="btn sm ghost right" data-act="result">${g.result ? '수정' : '입력'}</button></div>
    ${g.result ? resultSummaryHTML(g) : '<div class="dim">아직 결과가 없습니다.</div>'}
    <div class="foot">
      <button class="btn danger" data-act="del">삭제</button>
      <button class="btn ghost" data-act="edit">정보 수정</button>
      <button class="btn primary" data-act="close">닫기</button>
    </div>`, (m) => {
    m.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'close') return closeModal();
      if (act === 'edit') { closeModal(); return afterModalClose(() => matchInfoModal(g)); }
      if (act === 'lineup') { closeModal(); return afterModalClose(() => lineupModal(g.id)); }
      if (act === 'result') { closeModal(); return afterModalClose(() => resultModal(g.id)); }
      if (act === 'del') {
        closeModal();
        if (await confirmDialog({ title: '이 경기 기록을 삭제할까요?', body: '라인업·결과가 함께 삭제되고, 상대 전적이 다시 계산됩니다.', ok: '삭제', danger: true })) {
          store.matches.remove(g.id); toast('삭제했습니다'); render();
        }
      }
    });
  });
}

function lineupModal(matchId) {
  const g = store.matches.byId(matchId);
  if (!g) return;
  let formation = g.lineup?.formation || FORMATION_PRESETS[0];
  let slots = formationSlots(formation).map((_, i) => g.lineup?.slots?.[i] || null);
  let useAll = false;

  const candidates = () => {
    const today = availableToday();
    return useAll || !today.length ? store.members.active() : today;
  };
  const draw = () => {
    const cands = candidates();
    const pos = formationSlots(formation);
    return `
    <h3>라인업</h3>
    <div style="font-size:12.5px;color:var(--text-2);margin-bottom:8px">슬롯 배치는 자리표시입니다 — 정밀한 위치는 전술보드(S3)에서 다룹니다.</div>
    <div class="field"><label>포메이션</label>
      <div class="seg-wide wrap" id="f-lu-formation">
        ${FORMATION_PRESETS.map((f) => `<button type="button" data-f="${f}" aria-pressed="${formation === f}">${f}</button>`).join('')}
      </div>
    </div>
    <div class="row" style="margin:6px 0 10px">
      <button type="button" class="btn sm grow ${useAll ? '' : 'primary'}" data-act="cand-today">오늘 가능(${availableToday().length})</button>
      <button type="button" class="btn sm grow ${useAll ? 'primary' : ''}" data-act="cand-all">전체 활동 회원</button>
    </div>
    <div class="lineup-form">${slots.map((mid, i) => `
      <div class="lu-row">
        <span class="pos">${esc(pos[i])}</span>
        <select data-slot="${i}">
          <option value="">비움</option>
          ${cands.map((mm) => `<option value="${mm.id}" ${mid === mm.id ? 'selected' : ''}>${esc(mm.name)}</option>`).join('')}
        </select>
      </div>`).join('')}</div>
    <div class="foot">
      <button class="btn ghost" data-act="cancel">취소</button>
      <button class="btn primary" data-act="save">저장</button>
    </div>`;
  };

  openModal(draw(), (m) => {
    const repaint = () => { m.innerHTML = draw(); };
    m.addEventListener('change', (e) => {
      const sel = e.target.closest('[data-slot]');
      if (sel) slots[Number(sel.dataset.slot)] = sel.value || null;
    });
    m.addEventListener('click', (e) => {
      const fb = e.target.closest('#f-lu-formation [data-f]');
      if (fb) {
        formation = fb.dataset.f;
        const old = slots;
        slots = formationSlots(formation).map((_, i) => old[i] || null);
        repaint();
        return;
      }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'cand-today') { useAll = false; repaint(); return; }
      if (act === 'cand-all') { useAll = true; repaint(); return; }
      if (act === 'cancel') return closeModal();
      if (act === 'save') {
        const used = slots.filter(Boolean);
        if (new Set(used).size !== used.length) { toast('같은 선수를 두 자리에 넣었습니다', 'err'); return; }
        store.matches.update(g.id, { lineup: { formation, slots } });
        toast('라인업을 저장했습니다');
        closeModal(); render();
        afterModalClose(() => matchDetailModal(g.id));
      }
    });
  });
}

function scorerRowsHTML(scorers, memberOptions, assistOptions) {
  return scorers.map((s, i) => `
    <div class="scorer-row">
      <select data-sc-mem="${i}">${memberOptions(s.memberId)}</select>
      <input type="number" min="1" data-sc-cnt="${i}" value="${s.count || 1}" aria-label="득점 수">
      <select data-sc-ast="${i}">${assistOptions(s.assistId)}</select>
      <button type="button" class="btn sm danger" data-sc-del="${i}" aria-label="이 줄 삭제">×</button>
    </div>`).join('');
}

function resultModal(matchId) {
  const g = store.matches.byId(matchId);
  if (!g) return;
  let scorers = (g.scorers || []).map((s) => ({ ...s }));
  const members = store.members.active();
  const memberOptions = (sel) => '<option value="">선수 선택</option>'
    + members.map((mm) => `<option value="${mm.id}" ${sel === mm.id ? 'selected' : ''}>${esc(mm.name)}</option>`).join('');
  const assistOptions = (sel) => '<option value="">도움 없음</option>'
    + members.map((mm) => `<option value="${mm.id}" ${sel === mm.id ? 'selected' : ''}>${esc(mm.name)}</option>`).join('');

  openModal(`
    <h3>결과 입력</h3>
    <div class="row">
      <div class="field" style="flex:1"><label>득점</label><input type="number" min="0" id="f-r-gf" value="${g.result?.gf ?? ''}" inputmode="numeric"></div>
      <div class="field" style="flex:1"><label>실점</label><input type="number" min="0" id="f-r-ga" value="${g.result?.ga ?? ''}" inputmode="numeric"></div>
    </div>
    <div class="section-title">득점자 <button type="button" class="btn sm ghost right" data-act="add-scorer">+ 추가</button></div>
    <div id="scorer-rows">${scorerRowsHTML(scorers, memberOptions, assistOptions)}</div>
    <div class="field" style="margin-top:10px"><label>총평 (선택)</label><textarea id="f-r-review" rows="3" placeholder="오늘 경기 총평">${esc(g.review || '')}</textarea></div>
    <div class="foot">
      <button class="btn ghost" data-act="cancel">취소</button>
      <button class="btn primary" data-act="save">저장</button>
    </div>`, (m) => {
    const repaint = () => { $('#scorer-rows', m).innerHTML = scorerRowsHTML(scorers, memberOptions, assistOptions); };
    m.addEventListener('change', (e) => {
      const mem = e.target.closest('[data-sc-mem]');
      if (mem) { scorers[Number(mem.dataset.scMem)].memberId = mem.value || null; return; }
      const cnt = e.target.closest('[data-sc-cnt]');
      if (cnt) { scorers[Number(cnt.dataset.scCnt)].count = Math.max(1, Math.round(Number(cnt.value)) || 1); return; }
      const ast = e.target.closest('[data-sc-ast]');
      if (ast) { scorers[Number(ast.dataset.scAst)].assistId = ast.value || null; }
    });
    m.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="add-scorer"]')) { scorers.push({ memberId: null, count: 1, assistId: null }); repaint(); return; }
      const del = e.target.closest('[data-sc-del]');
      if (del) { scorers.splice(Number(del.dataset.scDel), 1); repaint(); return; }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'cancel') return closeModal();
      if (act === 'save') {
        const gf = Number($('#f-r-gf', m).value); const ga = Number($('#f-r-ga', m).value);
        if (!Number.isFinite(gf) || !Number.isFinite(ga) || gf < 0 || ga < 0) { toast('득점·실점을 확인해 주세요', 'err'); return; }
        const cleanScorers = scorers.filter((s) => s.memberId);
        store.matches.update(g.id, { result: { gf, ga }, scorers: cleanScorers, review: $('#f-r-review', m).value.trim() });
        toast('결과를 저장했습니다');
        closeModal(); render();
        afterModalClose(() => matchDetailModal(g.id));
      }
    });
  });
}

/* ---------- 이름 정리 도구 (v0.5.6) ----------
 * 2026-09-22 사장님 실증: "분리하기" 를 눌러도 "체 한가람" 처럼 앞 글자가 남았다.
 * 원인(로컬 재현): 앞선 버전이 포지션만 떼어 pos 를 지정해 둔 회원은, 새 도구에서
 *   "이미 포지션을 지정함 = 유지" 로 보고 체크박스가 꺼진 채 표시돼 적용에서 빠졌다.
 * → 체크박스 기본값은 "이름이 바뀌면 켠다" (유지 판단은 포지션 덮어쓰기에만 적용)
 * v1.0: 팀 글자 읽기는 사라졌다. 이름 앞에 떨어져 남은 한 글자는 "앞 글자"로 표시만 한다.
 */
function nameCandidates() {
  return store.members.all().map((m) => {
    const an = analyzeMemberName(m.name);
    if (!an.changed || !an.name) return null;
    const nameChanged = an.name !== m.name;
    const posKeep = !!an.pos && m.pos !== 'MF' && m.pos !== an.pos;
    return { member: m, an, nameChanged, posKeep };
  }).filter(Boolean);
}

function nameFixSheet() {
  let rows = nameCandidates();
  if (!rows.length) { toast('정리할 이름이 없습니다'); return; }

  const posOptions = (sel) => ['FW', 'MF', 'DF', 'GK'].map((p) =>
    `<option value="${p}" ${sel === p ? 'selected' : ''}>${p}</option>`).join('');
  const draw = () => `
    <h3>이름 정리</h3>
    <div style="font-size:13px;color:var(--text-2);line-height:1.6;margin-bottom:10px">
      이름 칸에 포지션·나이·성별이 섞여 들어간 회원 ${rows.length}명입니다.
      값은 직접 고칠 수 있고, 체크한 줄만 적용됩니다.
    </div>
    ${rows.map((r, i) => `<div class="fixrow2">
      <label class="fx-chk"><input type="checkbox" data-fix="${i}" ${r.nameChanged ? 'checked' : ''}></label>
      <div class="fx-body">
        <div class="fx-line"><span class="old">${esc(r.member.name)}</span> →
          <input type="text" data-fname="${i}" value="${esc(r.an.name)}" maxlength="20"></div>
        <div class="fx-line2">
          <select data-fpos="${i}">${posOptions(r.an.pos || r.member.pos)}</select>
          ${r.an.gk ? '<span class="chip gk">GK</span>' : ''}
          ${r.an.birthYear ? `<span class="chip">${String(r.an.birthYear).slice(-2)}년생</span>` : ''}
          ${r.an.gender ? `<span class="chip g${r.an.gender === '여' ? 'f' : 'm'}">${r.an.gender}</span>` : ''}
        </div>
        <div class="fx-why">읽은 것: ${esc(r.an.reasons.join(' · ') || '이름만')}
          ${r.posKeep ? `<em>지금 포지션 ${esc(r.member.pos)} 유지</em>` : ''}</div>
      </div>
    </div>`).join('')}
    <div class="foot">
      <button class="btn ghost" data-act="close">닫기</button>
      <button class="btn" data-act="all">전체 선택</button>
      <button class="btn primary" data-act="apply">적용</button>
    </div>`;

  openModal(draw(), (m) => {
    m.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'close') return closeModal();
      if (act === 'all') { $$('[data-fix]', m).forEach((c) => { c.checked = true; }); return; }
      if (act !== 'apply') return;
      let n = 0;
      $$('[data-fix]', m).forEach((chk) => {
        if (!chk.checked) return;
        const i = Number(chk.dataset.fix);
        const r = rows[i];
        const name = $(`[data-fname="${i}"]`, m)?.value.trim() || r.an.name;
        const pos = $(`[data-fpos="${i}"]`, m)?.value || r.member.pos;
        const patch = { name, pos };
        if (r.an.gk) patch.gk = true;
        if (r.an.birthYear && !r.member.birthYear) patch.birthYear = r.an.birthYear;
        if (r.an.gender && !r.member.gender) patch.gender = r.an.gender;
        store.members.update(r.member.id, patch);
        n += 1;
      });
      closeModal();
      render();
      toast(n ? `${n}명 정리했습니다` : '선택된 줄이 없습니다', n ? '' : 'err');
    });
  });
}

/* ================= 훈련 — 팀 훈련 + 개인 훈련 (S5, 2026-09-29) =================
 * 마스터플랜 §7: 드릴 라이브러리(초기 15개, 삭제 없이 숨김만) + 팀 훈련 세션
 * (drills[]·attendees[]·notes) + 개인 훈련 과제(주 단위, 규칙 기반 추천·완료 체크·감독 확인).
 */
function drillLibraryPreview() {
  return `<div class="card flat" style="padding:12px 14px">
    <div class="row wrap">${DRILL_CATEGORIES.map((c) => `<span class="catchip">${esc(c.label)} <b>${store.drills.byCategory(c.key).length}</b></span>`).join('')}</div>
  </div>`;
}

function sessionRow(ts) {
  const mins = trainingSessionDrillMinutes(ts);
  return `<button type="button" class="match-card" data-session-open="${ts.id}">
    <div class="match-top"><b>${esc(fmtDate(ts.date))}</b>${ts.theme ? `<span class="chip">${esc(ts.theme)}</span>` : ''}</div>
    <div class="match-mid"><span class="opp">${ts.drills.length}개 드릴 · ${mins}분${ts.minutes ? ` / 목표 ${ts.minutes}분` : ''}</span>
      <span class="ha">참가 ${ts.attendees.length}명</span></div>
    ${ts.notes ? `<div class="match-place">${esc(ts.notes)}</div>` : ''}
  </button>`;
}

function renderTeamTrainList() {
  const list = store.trainingSessions.sorted();
  let html = `<div class="row" style="margin:12px 0 10px">
    <button class="btn primary grow" id="btn-add-session">${ICON.plus} 새 훈련 세션</button>
  </div>`;
  if (!list.length) {
    html += `<div class="empty">${ICON.train}
      <div class="big">등록된 훈련 세션이 없습니다</div>
      <div>드릴을 담아 오늘의 팀 훈련을 계획해 보세요.</div></div>`;
  } else {
    html += `<div class="section-title">훈련 일지 <span class="count">${list.length}</span></div>`;
    html += list.map(sessionRow).join('');
  }
  html += `<div class="section-title" style="margin-top:18px">드릴 라이브러리 <span class="count">${store.drills.visible().length}</span>
    <button class="btn sm ghost right" id="btn-drill-lib">전체 관리</button></div>`;
  html += drillLibraryPreview();
  return html;
}

/** 세션 만들기/수정 — 지역 상태(drills·attendees)를 두고 repaint 방식(라인업 모달과 같은 패턴) */
function trainingSessionModal(existing) {
  const t0 = existing || {
    date: localDateStr(), theme: '', minutes: 60,
    drills: [], attendees: (availableToday().length ? availableToday() : []).map((m) => m.id),
    notes: '',
  };
  let date = t0.date; let theme = t0.theme; let minutes = t0.minutes; let notes = t0.notes;
  let drills = t0.drills.map((d) => ({ ...d }));
  let attendees = new Set(t0.attendees);

  const activeMembers = store.members.active();

  const draw = () => {
    const visibleDrills = store.drills.visible();
    const sum = drills.reduce((s, d) => s + (Number(d.minutes) || 0), 0);
    return `
    <h3>${existing ? '훈련 세션 수정' : '새 훈련 세션'}</h3>
    <div class="row">
      <div class="field" style="flex:1"><label>날짜</label><input type="date" id="f-ts-date" value="${esc(date)}"></div>
      <div class="field" style="flex:1"><label>목표 시간(분)</label><input type="number" id="f-ts-min" min="10" max="240" value="${minutes}" inputmode="numeric"></div>
    </div>
    <div class="field"><label>주제</label><input type="text" id="f-ts-theme" value="${esc(theme)}" placeholder="예: 패스+체력" maxlength="40"></div>

    <div class="section-title" style="margin-top:14px">드릴 담기 <button type="button" class="btn sm ghost right" id="btn-ts-drilllib">라이브러리 관리</button></div>
    ${DRILL_CATEGORIES.map((c) => {
      const pool = visibleDrills.filter((d) => d.category === c.key);
      if (!pool.length) return '';
      return `<div class="cand-hint" style="margin-top:6px">${esc(c.label)}</div>
        <div class="cand-list">${pool.map((d) => `<button type="button" class="cand-chip${drills.some((x) => x.drillId === d.id) ? ' placed' : ''}" data-ts-drill="${d.id}">${esc(d.name)}${drills.some((x) => x.drillId === d.id) ? ' ✓' : ''}</button>`).join('')}</div>`;
    }).join('')}
    ${!visibleDrills.length ? '<div class="dim">쓸 수 있는 드릴이 없습니다. 라이브러리 관리에서 추가하세요.</div>' : ''}

    <div class="sess-sum${sum > minutes ? ' over' : ''}">담은 드릴 합계 ${sum}분 / 목표 ${minutes}분</div>
    <div class="sesslist-picked">${drills.length ? drills.map((d, i) => {
      const dr = store.drills.byId(d.drillId);
      return `<div class="sess-drill-row">
        <span class="n">${esc(dr?.name || '(삭제된 드릴)')}</span>
        <input type="number" min="1" max="120" data-ts-drmin="${i}" value="${d.minutes}">
        <button type="button" class="btn sm danger" data-ts-drdel="${i}" aria-label="빼기">×</button>
      </div>`;
    }).join('') : '<div class="dim">아직 담은 드릴이 없습니다</div>'}</div>

    <div class="section-title" style="margin-top:14px">참가자 <span class="count">${attendees.size}</span>
      <button type="button" class="btn sm ghost right" id="btn-ts-att-all">오늘 가능 전원</button></div>
    <div class="cand-list">${activeMembers.length ? activeMembers.map((m) => `<button type="button" class="cand-chip${attendees.has(m.id) ? ' placed' : ''}" data-ts-att="${m.id}">${esc(m.name)}${attendees.has(m.id) ? ' ✓' : ''}</button>`).join('') : '<div class="dim">활동 회원이 없습니다</div>'}</div>

    <div class="field" style="margin-top:12px"><label>메모 (선택 · 진행 후에 적어도 됩니다)</label><textarea id="f-ts-notes" rows="2" placeholder="진행 후 메모">${esc(notes)}</textarea></div>
    <div class="foot">
      ${existing ? '<button class="btn danger" data-act="del">삭제</button>' : ''}
      <button class="btn ghost" data-act="cancel">취소</button>
      <button class="btn primary" data-act="save">저장</button>
    </div>`;
  };

  openModal(draw(), (m) => {
    const repaint = () => { m.innerHTML = draw(); };
    m.addEventListener('input', (e) => {
      if (e.target.id === 'f-ts-date') date = e.target.value;
      if (e.target.id === 'f-ts-theme') theme = e.target.value;
      if (e.target.id === 'f-ts-min') minutes = Math.max(1, Math.round(Number(e.target.value)) || 60);
      if (e.target.id === 'f-ts-notes') notes = e.target.value;
      const drmin = e.target.closest('[data-ts-drmin]');
      if (drmin) drills[Number(drmin.dataset.tsDrmin)].minutes = Math.max(1, Math.round(Number(drmin.value)) || 10);
    });
    m.addEventListener('click', async (e) => {
      if (e.target.closest('#btn-ts-drilllib')) { closeModal(); return afterModalClose(() => drillLibraryModal()); }
      const dc = e.target.closest('[data-ts-drill]');
      if (dc) {
        const id = dc.dataset.tsDrill;
        const i = drills.findIndex((x) => x.drillId === id);
        if (i >= 0) drills.splice(i, 1);
        else { const dr = store.drills.byId(id); drills.push({ drillId: id, minutes: dr?.minutes || 10 }); }
        repaint(); return;
      }
      const del = e.target.closest('[data-ts-drdel]');
      if (del) { drills.splice(Number(del.dataset.tsDrdel), 1); repaint(); return; }
      if (e.target.closest('#btn-ts-att-all')) {
        const cands = availableToday().length ? availableToday() : activeMembers;
        attendees = new Set(cands.map((mm) => mm.id));
        repaint(); return;
      }
      const at = e.target.closest('[data-ts-att]');
      if (at) {
        const id = at.dataset.tsAtt;
        if (attendees.has(id)) attendees.delete(id); else attendees.add(id);
        repaint(); return;
      }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'cancel') return closeModal();
      if (act === 'del') {
        closeModal();
        if (await confirmDialog({ title: '이 훈련 세션을 삭제할까요?', body: '담긴 드릴·참가자·메모가 함께 지워집니다.', ok: '삭제', danger: true })) {
          store.trainingSessions.remove(existing.id);
          toast('삭제했습니다'); render();
        }
        return;
      }
      if (act === 'save') {
        const data = { date, theme: theme.trim(), minutes, drills, attendees: [...attendees], notes: notes.trim() };
        if (existing) { store.trainingSessions.update(existing.id, data); toast('수정했습니다'); }
        else { store.trainingSessions.add(data); toast('훈련 세션을 만들었습니다'); }
        closeModal(); render();
        if (ui.tab !== 'training') switchTab('training');
      }
    });
  });
}

function drillRowHTML(d) {
  const cat = DRILL_CATEGORIES.find((c) => c.key === d.category);
  return `<div class="drill-row${d.hidden ? ' hidden' : ''}">
    <div class="dr-main">
      <div class="dr-top"><span class="catchip">${esc(cat?.label || d.category)}</span><b>${esc(d.name)}</b>${d.hidden ? '<span class="chip">숨김</span>' : ''}</div>
      ${d.desc ? `<div class="dr-desc">${esc(d.desc)}</div>` : ''}
      <div class="dr-meta"><span>${d.minutes}분</span>${d.players ? `<span>${esc(d.players)}</span>` : ''}${d.equipment ? `<span>${esc(d.equipment)}</span>` : ''}</div>
    </div>
    <div class="dr-act"><button type="button" class="btn sm ghost" data-dr-edit="${d.id}">수정</button></div>
  </div>`;
}

function drillLibraryModal() {
  const list = store.drills.all().slice()
    .sort((a, b) => DRILL_CATEGORY_KEYS.indexOf(a.category) - DRILL_CATEGORY_KEYS.indexOf(b.category) || a.name.localeCompare(b.name, 'ko'));
  openModal(`
    <h3>드릴 라이브러리</h3>
    <div style="font-size:12.5px;color:var(--text-2);margin-bottom:10px">숨긴 드릴도 이미 담긴 세션·과제에는 그대로 남습니다 — 지우기는 없습니다.</div>
    <div class="row" style="margin-bottom:10px"><button type="button" class="btn primary grow" data-act="add">${ICON.plus} 드릴 추가</button></div>
    <div class="drilllist">${list.map(drillRowHTML).join('')}</div>
    <div class="foot"><button class="btn primary" data-act="close">닫기</button></div>`, (m) => {
    m.addEventListener('click', (e) => {
      const edit = e.target.closest('[data-dr-edit]');
      if (edit) { closeModal(); return afterModalClose(() => drillFormModal(store.drills.byId(edit.dataset.drEdit))); }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'close') return closeModal();
      if (act === 'add') { closeModal(); return afterModalClose(() => drillFormModal(null)); }
    });
  });
}

function drillFormModal(existing) {
  const d0 = existing || { category: 'pass', name: '', desc: '', minutes: 15, players: '', equipment: '' };
  openModal(`
    <h3>${existing ? '드릴 수정' : '드릴 추가'}</h3>
    <div class="field"><label>카테고리</label>
      <div class="seg-wide wrap" id="f-dr-cat">
        ${DRILL_CATEGORIES.map((c) => `<button type="button" data-c="${c.key}" aria-pressed="${d0.category === c.key}">${esc(c.label)}</button>`).join('')}
      </div>
    </div>
    <div class="field"><label>이름</label><input type="text" id="f-dr-name" value="${esc(d0.name)}" placeholder="예: 삼각패스 로테이션" maxlength="40"></div>
    <div class="field"><label>설명 (2줄 정도)</label><textarea id="f-dr-desc" rows="3" maxlength="200" placeholder="어떻게 하는 드릴인지, 무엇을 기르는지">${esc(d0.desc)}</textarea></div>
    <div class="row">
      <div class="field" style="flex:1"><label>소요 분</label><input type="number" id="f-dr-min" min="1" max="120" value="${d0.minutes}" inputmode="numeric"></div>
      <div class="field" style="flex:1"><label>인원</label><input type="text" id="f-dr-players" value="${esc(d0.players)}" placeholder="예: 4인 이상"></div>
    </div>
    <div class="field"><label>필요 장비</label><input type="text" id="f-dr-equip" value="${esc(d0.equipment)}" placeholder="예: 콘 4개 · 없음"></div>
    <div class="foot">
      ${existing ? `<button type="button" class="btn ${existing.hidden ? 'primary' : 'danger'}" data-act="toggle-hide">${existing.hidden ? '다시 보이기' : '숨기기'}</button>` : ''}
      <button class="btn ghost" data-act="cancel">취소</button>
      <button class="btn primary" data-act="save">저장</button>
    </div>`, (m) => {
    m.addEventListener('click', (e) => {
      const cb = e.target.closest('#f-dr-cat [data-c]');
      if (cb) { $$('#f-dr-cat [data-c]', m).forEach((b) => b.setAttribute('aria-pressed', String(b === cb))); return; }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'cancel') return closeModal();
      if (act === 'toggle-hide') {
        store.drills.setHidden(existing.id, !existing.hidden);
        toast(existing.hidden ? '다시 보이게 했습니다' : '숨겼습니다(세션엔 그대로 남습니다)');
        closeModal(); return afterModalClose(() => drillLibraryModal());
      }
      if (act === 'save') {
        const name = $('#f-dr-name', m).value.trim();
        if (!name) { toast('드릴 이름을 입력해 주세요', 'err'); return; }
        const category = $('#f-dr-cat [aria-pressed="true"]', m)?.dataset.c || 'pass';
        const data = {
          category, name,
          desc: $('#f-dr-desc', m).value.trim(),
          minutes: Number($('#f-dr-min', m).value) || 15,
          players: $('#f-dr-players', m).value.trim(),
          equipment: $('#f-dr-equip', m).value.trim(),
        };
        if (existing) { store.drills.update(existing.id, data); toast('수정했습니다'); }
        else { store.drills.add(data); toast(`${name} 추가`); }
        closeModal(); render();
        afterModalClose(() => drillLibraryModal());
      }
    });
  });
}

function personalMemberRow(m) {
  const plan = store.personalPlans.current(m.id);
  const done = plan ? plan.tasks.filter((x) => x.done).length : 0;
  const total = plan ? plan.tasks.length : 0;
  return `<button type="button" class="mem-item" data-pp-open="${m.id}">
    <div class="avatar">${esc(initial(m.name))}</div>
    <div class="nm">
      <b>${esc(m.name)}</b>
      <div class="sub">${plan
    ? `<span class="chip">이번 주 ${done}/${total} 완료${total && done === total ? ' ✓' : ''}</span>${plan.coachCheck ? '<span class="chip coach">감독확인</span>' : ''}`
    : '<span class="dim">이번 주 과제 없음</span>'}</div>
    </div>
  </button>`;
}

function renderPersonalTrainList() {
  const list = store.members.active().slice().sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  let html = `<div class="section-title" style="margin-top:12px">개인 훈련 <span class="count">${list.length}</span></div>`;
  if (!list.length) {
    html += `<div class="empty">${ICON.member}<div class="big">회원이 없습니다</div><div>우리팀 탭에서 회원을 먼저 등록하세요.</div></div>`;
  } else {
    html += list.map(personalMemberRow).join('');
  }
  return html;
}

/** 과제 한 줄 — readonly 면 지난 주 이력 보기(완료 체크·삭제 버튼 없이 상태만 표시) */
function taskRowHTML(t, i, member, opts = {}) {
  const dr = t.drillId ? store.drills.byId(t.drillId) : null;
  const label = dr ? dr.name : (t.text || '(과제)');
  let diff = '';
  if (t.testKey && t.baseline != null) {
    const rec = member?.tests?.[t.testKey];
    if (rec && rec.sec != null && rec.sec !== t.baseline) {
      const delta = Math.round((rec.sec - t.baseline) * 10) / 10;
      diff = `<div class="tk-diff">${esc(formatTestValue(t.testKey, t.baseline))} → ${esc(formatTestValue(t.testKey, rec.sec))} (${delta > 0 ? '+' : ''}${delta})</div>`;
    } else {
      diff = `<div class="tk-meta">기준 기록 ${esc(formatTestValue(t.testKey, t.baseline))} · 재측정 전</div>`;
    }
  }
  const actions = opts.readonly
    ? `<span class="chip${t.done ? '' : ' warn'}">${t.done ? '완료' : '미완료'}</span>`
    : `<button type="button" class="btn sm ${t.done ? 'primary' : 'ghost'}" data-tk-done="${i}">${t.done ? '✓ 완료' : '완료 체크'}</button>
       <button type="button" class="btn sm danger" data-tk-del="${i}" aria-label="과제 삭제">×</button>`;
  return `<div class="task-row${t.done ? ' done' : ''}">
    <div class="tk-top"><span class="n">${esc(label)}</span>${actions}</div>
    ${dr?.desc ? `<div class="tk-meta">${esc(dr.desc)}</div>` : ''}
    ${t.target ? `<div class="tk-target">목표: ${esc(t.target)}</div>` : ''}
    ${diff}
  </div>`;
}

/** 개인 훈련 상세 — 매 조작마다 store 에 즉시 저장하고, draw() 는 항상 최신 store 상태를 읽어 다시 그린다 */
function personalPlanModal(memberId) {
  const draw = () => {
    const member = store.members.byId(memberId);
    if (!member) return '<h3>회원을 찾을 수 없습니다</h3><div class="foot"><button type="button" class="btn primary" data-act="close">닫기</button></div>';
    const plan = store.personalPlans.current(memberId);
    const weak = weakestAbilities(member, 2);
    const history = store.personalPlans.byMember(memberId).filter((p) => p.weekOf !== currentWeekMonday());
    return `
    <h3>${esc(member.name)} · 개인 훈련</h3>
    ${weak.length || member.gk || member.pos === 'GK' ? `<div class="weak-chips">
      ${weak.map((k) => `<span class="chip warn">${esc(ABILITIES.find((a) => a.key === k)?.label || k)} 약점</span>`).join('')}
      ${member.gk || member.pos === 'GK' ? '<span class="chip gk">GK</span>' : ''}
    </div>` : ''}

    <div class="weekband"><b>이번 주 · ${esc(weekLabel(currentWeekMonday()))}</b>
      ${plan ? `<button type="button" class="chip coach" data-act="coach" aria-pressed="${plan.coachCheck}">${plan.coachCheck ? '감독확인 ✓' : '감독 확인'}</button>` : ''}</div>

    ${!plan ? `
      <div class="dim" style="margin-bottom:10px">간단 체크 약점 2항목·측정 기록을 바탕으로 이번 주 과제를 규칙대로 추천합니다(AI 아님).</div>
      <button type="button" class="btn primary block" data-act="recommend">이번 주 과제 만들기</button>
    ` : `
      <div class="tasklist">${plan.tasks.length ? plan.tasks.map((t, i) => taskRowHTML(t, i, member)).join('') : '<div class="dim">과제가 없습니다</div>'}</div>
      <div class="row" style="margin:8px 0 4px">
        <input type="text" id="f-tk-text" placeholder="직접 입력 (예: 개인 러닝 30분)" style="flex:1" maxlength="120">
        <button type="button" class="btn sm primary" data-act="add-task">추가</button>
      </div>
    `}

    <div class="section-title" style="margin-top:16px">지난 과제 이력 <span class="count">${history.length}</span></div>
    ${history.length ? history.map((p) => {
      const done = p.tasks.filter((t) => t.done).length;
      return `<button type="button" class="pastweek-row" data-pp-history="${p.id}">
        <span>${esc(weekLabel(p.weekOf))}</span>
        <span class="dim">${done}/${p.tasks.length} 완료${p.coachCheck ? ' · 감독확인' : ''}</span>
      </button>`;
    }).join('') : '<div class="dim">지난 과제 기록이 없습니다</div>'}

    <div class="foot"><button type="button" class="btn primary" data-act="close">닫기</button></div>`;
  };

  openModal(draw(), (m) => {
    const repaint = () => { m.innerHTML = draw(); };
    m.addEventListener('click', (e) => {
      const hist = e.target.closest('[data-pp-history]');
      if (hist) { closeModal(); return afterModalClose(() => pastWeekModal(hist.dataset.ppHistory)); }
      const done = e.target.closest('[data-tk-done]');
      const del = e.target.closest('[data-tk-del]');
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!done && !del && !act) return;
      const plan = store.personalPlans.current(memberId);
      if (done && plan) {
        const idx = Number(done.dataset.tkDone);
        store.personalPlans.setTaskDone(plan.id, idx, !plan.tasks[idx].done);
        repaint(); renderTraining(); return;
      }
      if (del && plan) {
        store.personalPlans.update(plan.id, { tasks: plan.tasks.filter((_, i) => i !== Number(del.dataset.tkDel)) });
        repaint(); renderTraining(); return;
      }
      if (act === 'close') return closeModal();
      if (act === 'coach' && plan) {
        store.personalPlans.update(plan.id, { coachCheck: !plan.coachCheck });
        repaint(); renderTraining(); return;
      }
      if (act === 'recommend') {
        const tasks = store.personalPlans.recommend(memberId);
        if (!tasks.length) { toast('추천할 드릴이 없습니다. 드릴 라이브러리를 확인해 주세요', 'err'); return; }
        store.personalPlans.add({ memberId, tasks });
        toast('이번 주 과제를 만들었습니다');
        repaint(); renderTraining(); return;
      }
      if (act === 'add-task') {
        const input = $('#f-tk-text', m);
        const text = input?.value.trim();
        if (!text) { toast('내용을 입력해 주세요', 'err'); return; }
        const cur = plan || store.personalPlans.add({ memberId, tasks: [] });
        store.personalPlans.update(cur.id, { tasks: [...cur.tasks, { text }] });
        toast('과제를 추가했습니다');
        repaint(); renderTraining();
      }
    });
  });
}

/** 지난 주 과제 이력 — 읽기 전용 상세 (삭제만 가능) */
function pastWeekModal(planId) {
  const plan = store.personalPlans.byId(planId);
  if (!plan) return;
  const member = store.members.byId(plan.memberId);
  openModal(`
    <h3>${esc(weekLabel(plan.weekOf))}${member ? ` · ${esc(member.name)}` : ' · 탈퇴 선수'}</h3>
    ${plan.coachCheck ? '<div class="chip coach" style="margin-bottom:8px">감독확인 ✓</div>' : ''}
    <div class="tasklist">${plan.tasks.length ? plan.tasks.map((t, i) => taskRowHTML(t, i, member, { readonly: true })).join('') : '<div class="dim">과제가 없습니다</div>'}</div>
    <div class="foot">
      <button type="button" class="btn danger" data-act="del">이 기록 삭제</button>
      <button type="button" class="btn primary" data-act="close">닫기</button>
    </div>`, (m) => {
    m.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'close') return closeModal();
      if (act === 'del') {
        closeModal();
        if (await confirmDialog({ title: '이 주의 과제 기록을 삭제할까요?', ok: '삭제', danger: true })) {
          store.personalPlans.remove(plan.id);
          toast('삭제했습니다');
          if (member) afterModalClose(() => personalPlanModal(member.id));
        }
      }
    });
  });
}

function renderTraining() {
  const root = $('#view-training');
  if (!root) return;
  let html = `<div class="seg-wide" id="train-sub">
    <button type="button" data-sub="team" aria-pressed="${ui.trainSub !== 'personal'}">팀 훈련</button>
    <button type="button" data-sub="personal" aria-pressed="${ui.trainSub === 'personal'}">개인 훈련</button>
  </div>`;
  html += ui.trainSub === 'personal' ? renderPersonalTrainList() : renderTeamTrainList();
  root.innerHTML = html;
}

/* ================= 동작 ================= */
const TABS = {
  ourteam: { title: '우리팀', render: () => renderOurTeam() },
  opponent: { title: '상대팀', render: () => renderOpponent() },
  board: { title: '전술보드', render: () => renderBoard() },
  match: { title: '경기', render: () => renderMatch() },
  training: { title: '훈련', render: () => renderTraining() },
};

function switchTab(tab, { push = true } = {}) {
  if (!TABS[tab]) tab = 'ourteam';
  if (tab !== 'ourteam') ui.rosterDone = null;   // 안내 배너는 한 번만
  ui.tab = tab;
  TABS[tab].render();
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${tab}`));
  $$('.tabbar button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  $('#topbar-title').textContent = TABS[tab].title;
  if (push && location.hash !== `#${tab}`) location.hash = `#${tab}`;
  window.scrollTo({ top: 0 });
  document.dispatchEvent(new CustomEvent('app:tab', { detail: tab }));
}

function applyHash() {
  const t = (location.hash || '#ourteam').slice(1);
  switchTab(TABS[t] ? t : 'ourteam', { push: false });
}

function memberModal(existing) {
  const m0 = existing || { name: '', skill: 3, gk: false, pos: 'MF', birthYear: null, gender: null, active: true };
  openModal(`
    <h3>${existing ? '회원 수정' : '회원 추가'}</h3>
    <div class="field"><label>이름</label><input type="text" id="f-name" value="${esc(m0.name)}" placeholder="이름" autocomplete="off"></div>
    <div class="field"><label>출생년도 (선택)</label>
      <input type="text" id="f-birth" inputmode="numeric" pattern="[0-9]*" maxlength="4"
             value="${m0.birthYear || ''}" placeholder="예: 90 또는 1990" autocomplete="off">
      <div class="hint" id="birth-hint">${m0.birthYear ? esc(ageLabel(m0.birthYear)) : '2자리로 넣으면 자동으로 19xx/20xx 를 맞춥니다'}</div>
    </div>
    <div class="field"><label>종합 실력 <span class="labelhint">간단 체크 평균 · 자동</span></label>
      <div class="autoskill" id="f-skill-auto">
        <b>${esc(skillLabel(m0))}</b>
        <span>${isUnrated(m0) ? '간단 체크를 입력하면 자동으로 계산됩니다' : '아래 6항목 평균입니다'}</span>
      </div>
      ${existing && existing.abilUpdatedAt ? `<div class="hint">마지막 평가 ${esc(fmtWhen(existing.abilUpdatedAt))} · ${esc(whoLabel(existing.abilUpdatedBy))}</div>` : ''}
    </div>
    <div class="field"><label>선호 포지션</label>
      <div class="seg-wide" id="f-pos">${['FW', 'MF', 'DF', 'GK'].map((p) => `<button type="button" data-p="${p}" aria-pressed="${m0.pos === p}">${p}</button>`).join('')}</div>
    </div>
    <div class="field"><label>성별 (선택)</label>
      <div class="seg-wide" id="f-gender">
        ${GENDERS.map((g2) => `<button type="button" data-g="${g2}" aria-pressed="${m0.gender === g2}">${g2}</button>`).join('')}
        <button type="button" data-g="" aria-pressed="${!m0.gender}">미입력</button>
      </div>
    </div>
    <div class="abil-sec" id="f-abil-sec">
      <button type="button" class="abil-head" id="f-abil-toggle" aria-expanded="true">
        <b>간단 체크</b><span class="labelhint">${esc(rubricKeyOf(m0) === 'female' ? '여성 기준' : '남성 기준')}</span><span class="dim" id="f-abil-sum">${abilAvg(m0.abil) ? `평균 ${abilAvg(m0.abil)}` : '미입력'}</span><span class="caret">▾</span>
      </button>
      <div class="abil-body" id="f-abil-body">
        ${ABILITIES.map((a) => abilRow(a, m0.abil?.[a.key], m0, `data-abil="${a.key}"`, testRecOf(m0, a.key))).join('')}
      </div>
    </div>
    <div class="togglerow"><label for="f-gk">골키퍼 가능</label><button type="button" class="switch" id="f-gk" aria-pressed="${!!m0.gk}"></button></div>
    <div class="togglerow"><label for="f-active">활동 중</label><button type="button" class="switch" id="f-active" aria-pressed="${m0.active !== false}"></button></div>
    <div class="foot">
      ${existing ? '<button class="btn danger" data-act="del">삭제</button>' : ''}
      <button class="btn ghost" data-act="cancel">취소</button>
      <button class="btn primary" data-act="save">저장</button>
    </div>`, (m) => {
    let pos = m0.pos; let gender = m0.gender || null;
    // 새 회원 입력 중 새로고침돼도 이름이 날아가지 않게 (수정 폼은 이미 저장된 값이라 제외)
    const nameDraft = existing ? null : bindDraft(m, 'member-name', '#f-name');
    const abil = Object.fromEntries(ABILITIES.map((a) => [a.key, m0.abil?.[a.key] ?? null]));
    // v0.6.0: 측정 기록은 폼 안에서 들고 있다가 저장할 때 한 번에 반영한다
    const tests = Object.fromEntries(TESTS.map((t) => [t.key, m0.tests?.[t.key] ? { ...m0.tests[t.key] } : null]));
    const curGender = () => ($('#f-gender [data-g][aria-pressed="true"]', m)?.dataset.g || null);
    const applyTestLocal = (tk) => {
      const t = TESTS.find((x) => x.key === tk);
      const rec = tests[tk];
      if (!t || !rec || rec.manual === true) return;
      const sc = store.club.scoreForTest(tk, rec.sec, curGender());
      if (sc != null) abil[t.abil] = sc;
    };
    const paintAbil = () => {
      for (const a of ABILITIES) {
        const row = $(`[data-abil="${a.key}"]`, m);
        if (!row) continue;
        // 측정 항목은 잠금 여부에 따라 점/기록칸이 바뀌므로 줄을 통째로 다시 그린다
        const t = testForAbil(a.key);
        if (t) {
          const focused = document.activeElement?.dataset?.test === t.key;
          if (!focused) {
            row.outerHTML = abilRow(a, abil[a.key], { ...m0, gender: curGender() }, `data-abil="${a.key}"`, tests[t.key]);
            continue;
          }
          const au = $('[data-tauto]', row);
          if (au) { au.textContent = abil[a.key] ? `${abil[a.key]}점` : '–'; au.classList.toggle('none', !abil[a.key]); }
        }
        $$('.dot', row).forEach((b) => b.setAttribute('aria-pressed', String((abil[a.key] || 0) >= Number(b.dataset.v))));
        row.classList.toggle('empty', abil[a.key] == null);
      }
      const avg = abilAvg(abil);
      const sum = $('#f-abil-sum', m);
      if (sum) sum.textContent = avg ? `평균 ${avg}` : '미입력';
      const auto = $('#f-skill-auto', m);
      if (auto) {
        auto.querySelector('b').textContent = avg != null ? String(avg) : '미평가';
        auto.querySelector('span').textContent = avg != null ? '아래 6항목 평균입니다' : '간단 체크를 입력하면 자동으로 계산됩니다';
      }
    };
    m.addEventListener('change', (e) => {
      const tin = e.target.closest('.abil-row .tin');
      if (!tin) return;
      const tk = tin.dataset.test;
      const raw = tin.value.trim();
      if (!raw) { tests[tk] = null; paintAbil(); return; }
      const sec = parseTestInput(tk, raw);
      if (sec == null) { toast('기록 형식을 확인해 주세요 (예: 9.4 또는 7:20)', 'err'); return; }
      tests[tk] = { sec, at: new Date().toISOString(), manual: false };
      applyTestLocal(tk);
      paintAbil();
      toast(`${formatTestValue(tk, sec)} → ${abil[TESTS.find((x) => x.key === tk).abil]}점`);
    });
    m.addEventListener('click', async (e) => {
      // 항목 이름 → 5단계 기준 시트
      const rb = e.target.closest('.abil-row [data-rubric]');
      if (rb) {
        const key = rb.dataset.rubric;
        const t = testForAbil(key);
        const lockedHere = !!(t && tests[t.key] && tests[t.key].manual !== true);
        const who = { ...m0, gender: curGender() };
        return rubricSheet(key, who, abil[key], lockedHere ? null : (lv) => { abil[key] = lv; paintAbil(); });
      }
      // 기록 잠금/해제
      const lk = e.target.closest('.abil-row [data-tlock]');
      if (lk) {
        const tk = lk.dataset.tlock;
        if (!tests[tk]) return;
        tests[tk].manual = lk.getAttribute('aria-pressed') === 'true';
        applyTestLocal(tk);
        paintAbil();
        toast(tests[tk].manual ? '이 항목을 손으로 매길 수 있습니다' : '기록 기준으로 되돌렸습니다');
        return;
      }
      const ab = e.target.closest('.abil-row .dot, .abil-row .clr');
      if (ab) {
        const key = ab.closest('.abil-row').dataset.abil;
        const v = Number(ab.dataset.v);
        abil[key] = v === 0 || abil[key] === v ? null : v; // 같은 점 다시 누르면 지움
        paintAbil();
        return;
      }
      if (e.target.closest('#f-abil-toggle')) {
        const sec = $('#f-abil-sec', m);
        const open = sec.classList.toggle('closed');
        $('#f-abil-toggle', m).setAttribute('aria-expanded', String(!open));
        return;
      }
      const gb = e.target.closest('#f-gender [data-g]');
      if (gb) {
        gender = gb.dataset.g || null;
        $$('#f-gender [data-g]', m).forEach((b) => b.setAttribute('aria-pressed', String(b === gb)));
        return;
      }
      const pb = e.target.closest('#f-pos [data-p]');
      if (pb) {
        pos = pb.dataset.p;
        $$('#f-pos [data-p]', m).forEach((b) => b.setAttribute('aria-pressed', String(b === pb)));
        if (pos === 'GK') $('#f-gk', m).setAttribute('aria-pressed', 'true');
        return;
      }
      const sw = e.target.closest('.switch');
      if (sw) { sw.setAttribute('aria-pressed', String(sw.getAttribute('aria-pressed') !== 'true')); return; }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'cancel') return closeModal();
      if (act === 'del') {
        closeModal();
        if (await confirmDialog({ title: `${existing.name} 님을 삭제할까요?`, body: '출석 기록에서도 제거됩니다.', ok: '삭제', danger: true })) {
          store.members.remove(existing.id);
          toast('삭제했습니다'); render();
        }
        return;
      }
      let name = $('#f-name', m).value.trim();
      if (!name) { toast('이름을 입력해 주세요', 'err'); return; }
      // 이름 칸에 "한가람 95 여 포워드" 처럼 통째로 넣은 경우도 갈라서 채운다
      const an = analyzeMemberName(name);
      if (an.changed && an.name) {
        name = an.name;
        if (an.pos) pos = an.pos;
        // v0.6.1: 이름 칸에 "골키퍼" 를 넣으면 pos 만 GK 가 되고 GK 스위치는 꺼진 채 저장됐다
        if (an.gk || an.pos === 'GK') $('#f-gk', m).setAttribute('aria-pressed', 'true');
        if (an.gender && !gender) gender = an.gender;
        if (an.birthYear) $('#f-birth', m).value = String(an.birthYear);
      }
      const birthRaw = $('#f-birth', m).value.trim();
      const birthYear = parseBirthYear(birthRaw);
      if (birthRaw && !birthYear) { toast('출생년도를 확인해 주세요 (예: 90 또는 1990)', 'err'); return; }
      const data = { name, pos, birthYear, abil, tests, gender, gk: $('#f-gk', m).getAttribute('aria-pressed') === 'true', active: $('#f-active', m).getAttribute('aria-pressed') === 'true' };
      if (existing) {
        const now = new Date().toISOString();
        if (JSON.stringify(existing.abil) !== JSON.stringify(data.abil)) {
          data.abilUpdatedAt = now; data.abilUpdatedBy = 'owner';
          data.skillUpdatedAt = now; data.skillUpdatedBy = 'owner';   // 종합은 평균이라 함께 갱신
        }
        store.members.update(existing.id, data);
        toast('수정했습니다');
      }
      else { store.members.add(data); nameDraft?.clear(); toast(`${name} 님 추가`); }
      store.members.recomputeTestScores();   // 성별이 바뀜었을 수 있으니 기록 기준 점수를 다시 맞춘다
      closeModal(); render();
    });
  });
}

function bulkModal() {
  let draft = null;
  openModal(`
    <h3>회원 일괄 추가</h3>
    <div style="font-size:13px;color:var(--text-2);margin-bottom:10px;line-height:1.6">
      한 줄에 한 명씩 붙여넣으세요. <b>출생년도·성별·포지션</b>은 순서 상관없이 알아서 읽습니다.<br>
      예: <code>한가람 95 여 포워드</code>, <code>오태경 85 남 센터백</code>, <code>김단비 GK</code><br>
      실력은 기본 3 — 등록 뒤에 능력치를 넣으면 종합 실력이 자동으로 잡힙니다.
    </div>
    <textarea id="f-bulk" rows="7" placeholder="한가람 95 여 포워드&#10;오태경 85 남 센터백&#10;김철수"></textarea>
    <div id="bulk-preview" class="bulkpv"></div>
    <div class="foot">
      <button class="btn ghost" data-act="cancel">취소</button>
      <button class="btn primary" data-act="save">추가</button>
    </div>`, (m) => {
    const drawPreview = () => {
      const box = $('#bulk-preview', m);
      if (!box) return;
      const lines = $('#f-bulk', m).value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      if (!lines.length) { box.innerHTML = ''; return; }
      const exist = new Set(store.members.all().map((x) => x.name));
      const seen = new Set();
      box.innerHTML = `<div class="pv-head">이렇게 읽었습니다 · ${lines.length}줄</div>` + lines.slice(0, 30).map((ln) => {
        const r = parseMemberLine(ln);
        if (!r || !r.name) return `<div class="pv-row bad"><b>${esc(ln)}</b><span>이름을 못 찾았습니다</span></div>`;
        const dup = exist.has(r.name) || seen.has(r.name);
        seen.add(r.name);
        const bits = [
          r.birthYear ? `${String(r.birthYear).slice(-2)}년생` : '',
          r.gender || '',
          r.pos || '',
          r.gk ? 'GK' : '',
        ].filter(Boolean).join(' · ');
        return `<div class="pv-row${dup ? ' dup' : ''}">
          <b>${esc(r.name)}</b><span>${bits || '추가 정보 없음'}</span>
          ${dup ? '<em>이미 있음</em>' : ''}
          ${r.unknownLead ? `<em>앞 글자 "${esc(r.unknownLead)}" 는 뺐습니다</em>` : ''}
          ${r.extraPos?.length ? `<em class="warn2">${esc(r.extraPos.join('/'))} 무시</em>` : ''}
        </div>`;
      }).join('') + (lines.length > 30 ? `<div class="pv-more">외 ${lines.length - 30}줄</div>` : '');
    };
    draft = bindDraft(m, 'bulk', '#f-bulk', { onRestore: () => drawPreview() });
    $('#f-bulk', m).addEventListener('input', drawPreview);
    drawPreview();
    m.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'cancel') return closeModal();
      // 줄바꿈으로만 나눈다 (콤마는 "이름,출생년도" 구분자일 수 있어 store 에서 판단)
      const names = $('#f-bulk', m).value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      if (!names.length) { toast('이름이 없습니다', 'err'); return; }
      const before = store.members.all().length;
      const added = store.members.bulkAdd(names);
      const skipped = names.length - added.length;
      draft?.clear();
      closeModal();
      if (added.length) { ui.memberFilter = 'all'; ui.memberQuery = ''; }   // 결과가 바로 보이게
      render();
      switchTab('ourteam');
      toast(added.length
        ? `${added.length}명 추가됨 (총 ${before + added.length}명)${skipped ? ` · 중복 ${skipped}명 제외` : ''}`
        : `추가된 사람이 없습니다 (중복 ${skipped}명)`, added.length ? '' : 'err');
    });
  });
}

/* ---------- 명단 붙여넣기 (카톡 투표/댓글 → 출석 자동 체크) ---------- */
function rosterModal() {
  const g = todaySession({ create: true });   // 오늘 자리에 그대로 찍는다
  let parsed = null;   // { in:[], out:[], maybe:[] }
  let rows = [];       // 매칭 결과
  let outRows = [];
  let restMode = 'out'; // 명단에 없는 회원 처리: out | maybe | keep

  openModal(`
    <h3>카톡 명단 붙여넣기</h3>
    <div style="font-size:12.5px;color:var(--text-2);line-height:1.6;margin-bottom:8px">
      카톡 투표 결과나 댓글을 그대로 붙여넣으세요. 번호·이모지·"참석/불참" 구분·쉼표 나열을 알아서 정리합니다.
    </div>
    <textarea id="f-roster" rows="7" placeholder="✅ 참석 (5)&#10;홍길동&#10;김철수&#10;&#10;❌ 불참&#10;박민수"></textarea>
    <div class="row" style="margin-top:8px">
      <button class="btn primary grow" data-act="parse">명단 분석</button>
      ${window.__fc_hasAIKey && window.__fc_hasAIKey() ? '<button class="btn grow ai" data-act="ai">AI로 정리</button>' : ''}
    </div>
    <div id="roster-preview"></div>
    <div class="foot">
      <button class="btn ghost" data-act="close">닫기</button>
      <button class="btn primary" data-act="apply" disabled>적용</button>
    </div>`, (m) => {
    const rosterDraft = bindDraft(m, 'roster', '#f-roster');
    const preview = () => {
      const box = $('#roster-preview', m);
      if (!parsed) { box.innerHTML = ''; return; }
      const matched = rows.filter((r) => r.status === 'matched');
      const multi = rows.filter((r) => r.status === 'multi');
      const none = rows.filter((r) => r.status === 'none');
      const rest = store.members.active().filter((mm) => !rows.some((r) => r.memberId === mm.id));
      box.innerHTML = `
        <div class="rs-sum">
          <span class="ok">참석 ${matched.length + multi.filter((r) => r.pick).length}</span>
          ${multi.length ? `<span class="warn2">확인 필요 ${multi.length}</span>` : ''}
          ${none.length ? `<span class="new">미등록 ${none.length}</span>` : ''}
          ${outRows.length ? `<span>불참 ${outRows.length}</span>` : ''}
        </div>
        ${matched.length ? `<div class="rs-block"><b>참석 처리</b><div class="rs-names">${matched.map((r) => esc(store.members.byId(r.memberId)?.name || r.input)).join(', ')}</div></div>` : ''}
        ${multi.length ? `<div class="rs-block"><b>누구인지 골라 주세요</b>
          ${multi.map((r, i) => `<div class="rs-row"><span class="in">${esc(r.input)}</span>
            <select data-multi="${i}">
              <option value="">건너뛰기</option>
              ${r.candidates.map((c) => `<option value="${c.id}" ${r.pick === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
            </select></div>`).join('')}</div>` : ''}
        ${none.length ? `<div class="rs-block"><b>회원 명단에 없음</b>
          ${none.map((r, i) => `<div class="rs-row"><span class="in">${esc(r.input)}</span>
            <label class="rs-add"><input type="checkbox" data-new="${i}" ${r.add ? 'checked' : ''}> 새 회원으로 추가</label></div>`).join('')}</div>` : ''}
        ${outRows.length ? `<div class="rs-block"><b>불참 처리</b><div class="rs-names">${outRows.map((r) => esc(store.members.byId(r.memberId)?.name || r.input)).join(', ')}</div></div>` : ''}
        <div class="rs-block"><b>명단에 없는 회원 ${rest.length}명</b>
          <div class="seg-wide" id="rs-rest">
            <button type="button" data-rest="out" aria-pressed="${restMode === 'out'}">불참</button>
            <button type="button" data-rest="maybe" aria-pressed="${restMode === 'maybe'}">미정</button>
            <button type="button" data-rest="keep" aria-pressed="${restMode === 'keep'}">그대로</button>
          </div>
        </div>`;
      $('[data-act="apply"]', m).disabled = !(matched.length || multi.some((r) => r.pick) || none.some((r) => r.add) || outRows.length);
    };

    const runParse = (text) => {
      parsed = parseRoster(text, { parseLine: (ln) => parseMemberLine(ln) });
      const members = store.members.all();
      rows = matchNames(parsed.in, members).map((r) => ({ ...r, pick: r.status === 'multi' && r.candidates.length === 1 ? r.candidates[0].id : null, add: false }));
      outRows = matchNames(parsed.out, members).filter((r) => r.status === 'matched');
      preview();
      if (!parsed.in.length && !parsed.out.length) toast('이름을 찾지 못했습니다. 형식을 확인해 주세요', 'err');
    };

    m.addEventListener('change', (e) => {
      const ms = e.target.closest('[data-multi]');
      if (ms) {
        const idx = Number(ms.dataset.multi);
        const target = rows.filter((r) => r.status === 'multi')[idx];
        if (target) target.pick = ms.value || null;
        preview();
      }
      const nw = e.target.closest('[data-new]');
      if (nw) {
        const idx = Number(nw.dataset.new);
        const target = rows.filter((r) => r.status === 'none')[idx];
        if (target) target.add = nw.checked;
        preview();
      }
    });

    m.addEventListener('click', async (e) => {
      const rb = e.target.closest('#rs-rest [data-rest]');
      if (rb) {
        restMode = rb.dataset.rest;
        $$('#rs-rest [data-rest]', m).forEach((b) => b.setAttribute('aria-pressed', String(b === rb)));
        return;
      }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'close') return closeModal();
      if (act === 'parse') return runParse($('#f-roster', m).value);
      if (act === 'ai') {
        const text = $('#f-roster', m).value.trim();
        if (!text) { toast('먼저 명단을 붙여넣어 주세요', 'err'); return; }
        const r = await aiRun('#roster-preview', 'AI가 명단을 정리하는 중', {
          system: `당신은 한국 축구 동호회 총무입니다. 붙여넣은 카톡 텍스트에서 사람 이름만 뽑아 아래 JSON 하나만 출력하세요.
{"in":["참석 이름"],"out":["불참 이름"],"maybe":["미정 이름"]}
- 텍스트에 없는 이름을 만들지 마세요. 별명·중복은 그대로 한 번만.
- 참석/불참 구분이 없으면 모두 in 에 넣으세요.`,
          messages: [{ role: 'user', content: text }],
          maxTokens: 1200,
        }, (res) => {
          const j = res.json || {};
          parsed = { in: j.in || [], out: j.out || [], maybe: j.maybe || [] };
          const members = store.members.all();
          rows = matchNames(parsed.in, members).map((x) => ({ ...x, pick: null, add: false }));
          outRows = matchNames(parsed.out, members).filter((x) => x.status === 'matched');
          return '<div class="ai-card ok"><div class="t">AI 정리 완료</div><div class="s">아래에서 확인 후 적용하세요.</div></div>';
        }, { json: true });
        if (r) setTimeout(preview, 50);
        return;
      }
      if (act === 'apply') {
        const map = Object.assign({}, store.matches.byId(g.id).attendance);
        if (restMode !== 'keep') {
          for (const mm of store.members.active()) map[mm.id] = restMode;
        }
        let inCount = 0; let added = 0;
        for (const r of rows) {
          let id = r.memberId || r.pick;
          if (!id && r.status === 'none' && r.add) {
            // v0.6.1: 명단 줄에서 읽은 포지션·성별·나이를 함께 넣는다
            const inf = parsed.info?.[r.input] || {};
            id = store.members.add({
              name: r.input,
              pos: inf.pos || 'MF', gk: !!inf.gk || inf.pos === 'GK',
              gender: inf.gender || null, birthYear: inf.birthYear || null,
            }).id;
            added += 1;
          }
          if (id) { map[id] = 'in'; inCount += 1; }
        }
        for (const r of outRows) if (r.memberId) map[r.memberId] = 'out';
        store.matches.setAttendanceBulk(g.id, map);
        rosterDraft?.clear();
        const outCount = Object.values(map).filter((v) => v === 'out').length;
        ui.rosterDone = { inCount, outCount, added };
        closeModal();
        render();
        toast(`참석 ${inCount}${added ? ` (신규 ${added})` : ''} · 불참 ${outCount}`);
      }
    });
  });
}

export async function shareOrDownload(file, blob) {
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: file.name });
      toast('공유했습니다');
      return;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return; // 사용자가 공유를 취소함
    /* 그 밖의 실패는 파일 저장으로 대체 */
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('이미지를 저장했습니다');
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------- 백업 ---------- */
function exportJSON() {
  const blob = new Blob([store.exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `woosulsan-fc_${todayStr()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  markBackup();
  toast('JSON을 내보냈습니다');
}

async function importJSONFile(file) {
  let text = '';
  try { text = await file.text(); }
  catch (e) { return importErrorSheet(`파일을 읽지 못했습니다 (${file?.name || '이름 없음'})`); }
  return importText(text, file?.name);
}
/** 가져오기 실패 이유를 오래 보이게 (토스트는 금방 사라진다) */
function importErrorSheet(msg, fileName) {
  openModal(`<h3>가져오지 못했습니다</h3>
    ${fileName ? `<div class="hint" style="margin-bottom:6px">파일: ${esc(fileName)}</div>` : ''}
    <div class="importerr">${esc(msg)}</div>
    <div class="hint" style="margin-top:10px">다른 기기의 <b>회원 탭 → 다른 곳으로 옮기기 → 클립보드 복사</b> 로 다시 복사하거나,
      명단만 옮길 거라면 <b>설정 → 명단 텍스트로 가져오기</b> 를 써 보세요.</div>
    <div class="foot"><button class="btn primary" data-act="close">확인</button></div>`, (m) => {
    m.addEventListener('click', (e) => { if (e.target.closest('[data-act="close"]')) closeModal(); });
  });
}

async function importText(text, fileName) {
  let pv;
  try { pv = store.previewImport(text); }
  catch (e) { return importErrorSheet(e.message || '가져오기 실패', fileName); }
  return importChoice(text, pv);
}
/**
 * 가져오기 방식 고르기 (v0.6.3)
 * 예전 창은 [취소]/[합치기] 두 버튼이었는데 "취소"가 실제로는 **덮어쓰기**로 동작했다.
 * → 합치기가 기본. 전체 교체는 따로 누르고 한 번 더 확인해야 한다. 그냥 닫으면 아무 일도 없다.
 */
function importChoice(text, pv) {
  openModal(`<h3>가져오기</h3>
    <div class="impsum">
      <div><b>${pv.total}명</b><span>가져올 명단</span></div>
      <div><b>${pv.fresh}명</b><span>새로 추가</span></div>
      <div><b>${pv.existing}명</b><span>이미 있음 · 빈 칸만 채움</span></div>
    </div>
    <div class="hint" style="margin:8px 0 12px">지금 이 기기의 회원 ${pv.current}명·팀 이름·기준표는 그대로 둡니다.
      같은 이름은 새로 만들지 않고 비어 있는 출생년도·성별·팀·포지션만 채워요.${pv.fixed?.length ? `<br>자동으로 고친 것: ${esc(pv.fixed.join(', '))}` : ''}</div>
    <button class="btn primary block" data-act="merge">합치기 (권장)</button>
    <button class="btn ghost block" data-act="replace" style="margin-top:8px;color:var(--danger)">전체 교체…</button>
    <div class="foot"><button class="btn ghost" data-act="close">취소</button></div>`, (m) => {
    m.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'close') return closeModal();
      if (act === 'merge') { closeModal(); return runImport(text, true); }
      if (act === 'replace') {
        closeModal();
        const n = store.members.all().length;
        const okGo = await confirmDialog({
          title: `지금 회원 ${n}명이 전부 지워집니다`,
          body: `이 기기의 회원·경기·전술·설정을 모두 지우고 가져온 내용(회원 ${pv.total}명)으로 바꿉니다. 되돌릴 수 없어요.<br>
            직접 입력해 둔 회원이 있다면 <b>합치기</b>를 쓰세요.`,
          ok: '전부 지우고 교체', danger: true,
        });
        if (okGo) runImport(text, false);
      }
    });
  });
}
async function runImport(text, merge) {
  try {
    const r = await store.importJSON(text, { merge });
    toast(importResultLine(r));
    render();
  } catch (e) {
    importErrorSheet(e.message || '가져오기 실패');
  }
}
/** "신규 3 · 보강 2 · 건너뜀 14" */
function importResultLine(r) {
  return `신규 ${r.added} · 보강 ${r.filled} · 건너뜀 ${r.skipped}`;
}

/** v1.0 으로 올릴 때 남긴 v0.7 자동 백업을 파일로 (내부 팀 배정까지 그대로 들어 있다) */
function exportLegacyJSON() {
  const json = store.legacyBackupJSON?.();
  if (!json) { toast('자동 백업이 없습니다'); return; }
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `woosulsan-fc_v0.7_backup_${todayStr()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('v0.7 백업을 내려받았습니다');
}

/** 설정 → 명단 텍스트로 가져오기 (v0.6.3) — 일괄 추가와 같은 줄 형식, 팀별 이동 없이 한 번에 */
function textImportSheet() {
  openModal(`<h3>명단 텍스트로 가져오기</h3>
    <div class="hint" style="margin-bottom:8px">한 줄에 한 명. 출생년도·성별·포지션은 순서 상관없이 읽습니다.<br>
      예: <code>홍길동 03 남 왼쪽풀백</code> · <code>한가람 95 여 포워드</code><br>
      이미 있는 이름은 새로 만들지 않고 빈 칸만 채웁니다.</div>
    <textarea id="f-timport" rows="9" placeholder="홍길동 03 남 왼쪽풀백&#10;김철수 01 남 골키퍼"></textarea>
    <div class="pastemeta" id="f-timport-meta">아직 비어 있습니다</div>
    <div class="foot">
      <button class="btn ghost" data-act="close">취소</button>
      <button class="btn primary" data-act="go">가져오기</button>
    </div>`, (m) => {
    const draft = bindDraft(m, 'text-import', '#f-timport');
    const lines = () => $('#f-timport', m).value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    const meta = () => {
      const ls = lines();
      const box = $('#f-timport-meta', m);
      if (!ls.length) { box.textContent = '아직 비어 있습니다'; box.className = 'pastemeta'; return; }
      const names = new Set(store.members.all().map((x) => x.name.trim()));
      let fresh = 0; let dup = 0; let bad = 0;
      for (const l of ls) { const r = parseMemberLine(l); if (!r?.name) bad += 1; else if (names.has(r.name)) dup += 1; else fresh += 1; }
      box.innerHTML = `${ls.length}줄 · 새로 <b>${fresh}</b> · 이미 있음 ${dup}${bad ? ` · <b>이름 없음 ${bad}</b>` : ''}`;
      box.className = 'pastemeta ok';
    };
    $('#f-timport', m).addEventListener('input', meta);
    meta();
    m.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'close') return closeModal();
      if (act === 'go') {
        const ls = lines();
        if (!ls.length) { toast('명단을 붙여넣어 주세요', 'err'); return; }
        const r = store.importLines(ls);
        draft?.clear();
        closeModal();
        toast(importResultLine(r) + (r.bad ? ` · 이름 없는 줄 ${r.bad}` : ''));
        render();
      }
    });
  });
}

/* ================= 이벤트 ================= */
function bindEvents() {
  $('.tabbar').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) switchTab(b.dataset.tab);
  });

  // 경기 모드(S4) 화면 꺼짐 방지 — 탭이 백그라운드로 가면 브라우저가 Wake Lock 을 스스로 놓는다.
  // 다시 보이면(눈 돌렸다 돌아오기 포함) 여전히 경기 모드면 다시 요청한다.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && bd.viewMode === 'live') requestWakeLock();
  });

  document.addEventListener('click', async (e) => {
    const t = e.target;

    const go = t.closest('[data-go]');
    if (go) { switchTab(go.dataset.go); return; }
    if (t.closest('#btn-settings')) {
      switchTab('ourteam');
      setTimeout(() => $('#settings-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      return;
    }

    /* ----- 오늘 출석 ----- */
    const segb = t.closest('.seg [data-v]');
    if (segb) {
      const seg = segb.closest('.seg');
      const memberId = seg.dataset.member;
      const g = todaySession({ create: true });
      const cur = g.attendance[memberId];
      const v = segb.dataset.v;
      const next = cur === v ? null : v;
      store.matches.setAttendance(g.id, memberId, next);
      $$('[data-v]', seg).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === next)));
      updateAttendCounts();
      return;
    }
    if (t.closest('#btn-roster')) return rosterModal();
    const all = t.closest('[data-att-all]');
    if (all) {
      if (all.dataset.attAll === 'in') {
        const g = todaySession({ create: true });
        const map = {};
        for (const m of store.members.active()) map[m.id] = 'in';
        store.matches.setAttendanceBulk(g.id, map);
        toast('전원 참석으로 표시했습니다');
      } else {
        const g = todaySession();
        if (!g) { toast('오늘 출석 표시가 아직 없습니다'); return; }
        if (!await confirmDialog({ title: '오늘 출석을 초기화할까요?', body: '오늘의 참석/불참 표시가 모두 지워집니다. 지난 기록은 그대로입니다.', ok: '초기화', danger: true })) return;
        store.matches.setAttendanceBulk(g.id, {});
        toast('초기화했습니다');
      }
      ui.rosterDone = null;
      renderOurTeam();
      return;
    }

    /* ----- AI ----- */
    if (t.closest('#btn-ai-ask, #btn-ai-ask-2')) return aiAskModal();
    if (t.closest('#btn-ai-key-save')) {
      const v = $('#f-ai-key')?.value.trim();
      if (!v) { toast('키를 입력해 주세요', 'err'); return; }
      if (!/^sk-ant-/.test(v)) { toast('sk-ant- 로 시작하는 키여야 합니다', 'err'); return; }
      AI.saveSettings({ key: v });
      toast('API 키를 저장했습니다 (이 기기에만)');
      renderOurTeam();
      return;
    }
    if (t.closest('#btn-ai-key-del')) {
      if (!await confirmDialog({ title: 'API 키를 삭제할까요?', body: 'AI 기능이 꺼집니다. 언제든 다시 입력할 수 있습니다.', ok: '삭제', danger: true })) return;
      AI.clearKey();
      toast('키를 삭제했습니다');
      renderOurTeam();
      return;
    }
    const aiM = t.closest('#f-ai-model [data-model]');
    if (aiM) {
      AI.saveSettings({ model: aiM.dataset.model });
      $$('#f-ai-model [data-model]').forEach((b) => b.setAttribute('aria-pressed', String(b === aiM)));
      toast('모델을 바꿌습니다');
      return;
    }
    if (t.closest('#btn-ai-test')) {
      const box = $('#ai-test-box');
      box.innerHTML = aiSkeleton('연결 테스트 중');
      const r = await AI.testConnection();
      box.innerHTML = r.ok
        ? `<div class="ai-card ok"><div class="t">✅ ${esc(r.message)}</div><div class="s">AI 기능을 바로 쓸 수 있습니다.</div></div>`
        : `<div class="ai-card err"><div class="t">연결 실패${r.status ? ` (${r.status})` : ''}</div><div class="s">${esc(r.message)}</div></div>`;
      return;
    }
    const cp = t.closest('[data-copy]');
    if (cp) {
      const el = document.getElementById(cp.dataset.copy);
      const text = el ? el.innerText : '';
      try { await navigator.clipboard.writeText(text); toast('복사했습니다'); }
      catch (err) { toast('복사할 수 없는 브라우저입니다', 'err'); }
      return;
    }
    const sh = t.closest('[data-share]');
    if (sh) {
      const el = document.getElementById(sh.dataset.share);
      const text = el ? el.innerText : '';
      try {
        if (navigator.share) { await navigator.share({ text }); }
        else { await navigator.clipboard.writeText(text); toast('복사했습니다'); }
      } catch (err) { if (err?.name !== 'AbortError') toast('공유할 수 없습니다', 'err'); }
      return;
    }

    /* ----- 회원 ----- */
    if (t.closest('#btn-add-member')) return memberModal(null);
    if (t.closest('#btn-bulk-member')) return bulkModal();
    if (t.closest('#btn-toggle-inactive')) { ui.showInactive = !ui.showInactive; return renderOurTeam(); }
    if (t.closest('#btn-fix-names, #btn-fix-names-2')) return nameFixSheet();
    if (t.closest('#btn-rubric')) return rubricModal();
    if (t.closest('#btn-sort')) { ui.memberSort = ui.memberSort === 'age' ? 'name' : 'age'; return renderOurTeam(); }
    const mf = t.closest('.filterchips [data-mf]');
    if (mf) { ui.memberFilter = mf.dataset.mf; return renderOurTeam(); }
    const me = t.closest('[data-member-edit]');
    if (me) return memberModal(store.members.byId(me.dataset.memberEdit));

    /* ----- 상대팀 (S2) ----- */
    if (t.closest('#btn-add-opponent')) return opponentModal(null);
    const oo = t.closest('[data-opp-open]');
    if (oo) return opponentDetailModal(oo.dataset.oppOpen);

    /* ----- 경기 (S2) ----- */
    if (t.closest('#btn-add-match')) return matchInfoModal(null);
    const mo = t.closest('[data-match-open]');
    if (mo) return matchDetailModal(mo.dataset.matchOpen);

    /* ----- 훈련 (S5) ----- */
    const tsub = t.closest('#train-sub [data-sub]');
    if (tsub) { ui.trainSub = tsub.dataset.sub; return renderTraining(); }
    if (t.closest('#btn-add-session')) return trainingSessionModal(null);
    const so = t.closest('[data-session-open]');
    if (so) return trainingSessionModal(store.trainingSessions.byId(so.dataset.sessionOpen));
    if (t.closest('#btn-drill-lib')) return drillLibraryModal();
    const ppo = t.closest('[data-pp-open]');
    if (ppo) return personalPlanModal(ppo.dataset.ppOpen);

    /* ----- 전술보드 (S3/S4) ----- */
    const vm = t.closest('#bd-view-mode [data-vm]');
    if (vm) {
      if (vm.dataset.vm === 'live') return enterLiveMode();
      if (vm.dataset.vm === 'prep') return exitLiveMode();
      return;
    }
    if (t.closest('#bd-exit-live')) return exitLiveMode();
    if (t.closest('#bd-live-sub')) { if (bd.locked) return; bd.mode = 'sub'; return renderBoard(); }
    if (t.closest('#bd-live-arrow')) { if (bd.locked) return; bd.mode = 'arrow'; return renderBoard(); }
    if (t.closest('#bd-live-clear')) {
      if (bd.locked || !bd.arrows.length) return;
      bd.arrows = []; bd.dirty = true; autosaveBoard();
      return renderBoard();
    }
    const presetBtn = t.closest('[data-preset]');
    if (presetBtn) return applyQuickPreset(presetBtn.dataset.preset);
    if (t.closest('#bd-m-move')) { bd.mode = 'move'; return renderBoard(); }
    if (t.closest('#bd-m-arrow')) { bd.mode = 'arrow'; return renderBoard(); }
    const astyle = t.closest('[data-astyle]');
    if (astyle) { if (bd.locked) return; bd.arrowStyle = astyle.dataset.astyle; return renderBoard(); }
    if (t.closest('#bd-undo')) { bd.arrows.pop(); bd.dirty = true; return renderBoard(); }
    if (t.closest('#bd-clear')) {
      if (!bd.arrows.length) return;
      if (await confirmDialog({ title: '그린 화살표를 모두 지울까요?', ok: '지우기', danger: true })) { bd.arrows = []; bd.dirty = true; renderBoard(); }
      return;
    }
    const sp = t.closest('[data-setpiece]');
    if (sp) {
      const tpl = SET_PIECE_TEMPLATES[sp.dataset.setpiece];
      if (tpl) { bd.ball = { ...tpl.ball }; bd.setPiece = sp.dataset.setpiece; bd.dirty = true; toast(tpl.hint); renderBoard(); }
      return;
    }
    if (t.closest('#bd-ball-clear')) { bd.ball = null; bd.setPiece = null; bd.dirty = true; return renderBoard(); }
    if (t.closest('#bd-reset')) {
      resetBoardLayout();
      toast('포메이션 기본 배치로 되돌렸습니다');
      return renderBoard();
    }
    if (t.closest('#bd-save')) return saveBoardSnapshot();
    if (t.closest('#bd-png')) return exportBoardPNG();
    if (t.closest('#bd-panel-toggle')) { bd.panelOpen = !bd.panelOpen; return renderBoard(); }
    const cand = t.closest('.cand-chip');
    if (cand) {
      // 드래그가 안 되는 환경(마우스 클릭만) 대비 — 탭 두 번(선수 선택 → 자리 선택)으로도 배치할 수 있게
      if (bd.pendingCand === cand.dataset.cand) { bd.pendingCand = null; return renderBoard(); }
      bd.pendingCand = cand.dataset.cand;
      toast('보드에서 넣을 자리를 눌러 주세요');
      return renderBoard();
    }
    const slotPin = t.closest('#bd-pins .pin.us');
    if (slotPin && bd.pendingCand) {
      const picked = bd.pendingCand;
      bd.pendingCand = null;   // 배치 렌더 전에 먼저 비워야 "고르는 중" 표시가 같이 지워진다
      assignCandidateToSlot(picked, Number(slotPin.dataset.idx));
      return;
    }

    /* ----- v1.0 업데이트 안내 (자동 백업) ----- */
    if (t.closest('#btn-legacy-hide')) { ui.legacyHidden = true; return renderOurTeam(); }
    if (t.closest('#btn-legacy-download')) return exportLegacyJSON();
    if (t.closest('#btn-legacy-restore')) {
      if (!await confirmDialog({
        title: 'v0.7 백업으로 되돌릴까요?',
        body: '지금 이 기기의 내용을 모두 지우고 <b>v1.0 으로 올리기 직전</b> 데이터로 바꿉니다.<br>내부 팀 배정은 v1.0 구조에 없으므로 다시 붙지 않습니다(회원·출석·능력치는 그대로 돌아옵니다).',
        ok: '되돌리기', danger: true,
      })) return;
      try {
        const r = await store.restoreLegacy();
        toast(`되돌렸습니다 · 회원 ${r.members}명`);
        render();
      } catch (err) { toast(err.message || '되돌리지 못했습니다', 'err'); }
      return;
    }

    /* ----- 설정 ----- */
    if (t.closest('#btn-update-now')) return applyUpdateNow();
    if (t.closest('#btn-export') || t.closest('#btn-backup-now')) return exportJSON();
    if (t.closest('#btn-move-data')) return moveDataSheet();
    if (t.closest('#btn-paste-import')) return pasteImportSheet();
    if (t.closest('[data-envclose]') || t.closest('[data-backup-later]')) {
      writeMeta({ bannerHiddenUntil: Date.now() + 24 * 60 * 60 * 1000 });
      if (t.closest('[data-backup-later]')) writeMeta({ lastBackupAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString() });
      renderOurTeam();
      return;
    }
    const envh = t.closest('[data-envhelp]');
    if (envh) return envHelpSheet(envh.dataset.envhelp);
    if (t.closest('#btn-import')) return $('#file-import').click();
    if (t.closest('#btn-text-import')) return textImportSheet();
    if (t.closest('#btn-reset')) {
      if (!await confirmDialog({ title: '전체 데이터를 지울까요?', body: '회원·출석·경기 기록이 모두 삭제됩니다. 되돌릴 수 없습니다.', ok: '다음', danger: true })) return;
      if (!await confirmDialog({ title: '정말 삭제합니다', body: '먼저 JSON 내보내기로 백업했는지 확인하세요.', ok: '삭제', danger: true })) return;
      await store.resetAll();
      ui.rosterDone = null; ui.memberFilter = 'all'; ui.memberQuery = '';
      toast('초기화했습니다');
      render();
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'file-import' && e.target.files[0]) { const fl = e.target.files[0]; e.target.value = ''; importJSONFile(fl); }
    if (e.target.id === 'bd-match') { loadBoardFor(e.target.value); renderBoard(); }
    if (e.target.id === 'bd-opponent') {
      bd.opponentId = e.target.value;
      const opp = bd.opponentId ? store.opponents.byId(bd.opponentId) : null;
      if (opp?.formation && FORMATION_PRESETS.includes(opp.formation)) reflowOppFormation(opp.formation);
      bd.dirty = true;
      renderBoard();
    }
    if (e.target.id === 'bd-formation') { reflowOurFormation(e.target.value); bd.dirty = true; renderBoard(); }
    if (e.target.id === 'bd-opp-formation') { reflowOppFormation(e.target.value); bd.dirty = true; renderBoard(); }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'f-birth') {
      const hint = document.getElementById('birth-hint');
      if (hint) {
        const y = parseBirthYear(e.target.value);
        hint.textContent = e.target.value.trim()
          ? (y ? ageLabel(y) : '숫자 2자리 또는 4자리로 넣어 주세요')
          : '2자리로 넣으면 자동으로 19xx/20xx 를 맞춥니다';
        hint.classList.toggle('bad', !!e.target.value.trim() && !y);
      }
      return;
    }
    if (e.target.id === 'member-q') {
      ui.memberQuery = e.target.value;
      const pos = e.target.selectionStart;
      renderOurTeam();
      const n = $('#member-q');
      if (n) { n.focus(); n.setSelectionRange(pos, pos); }
    }
  });

  // 키보드가 입력창을 가리지 않게
  document.addEventListener('focusin', (e) => {
    if (e.target.matches('input, textarea, select') && modalStack.length) {
      setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 260);
    }
  });
}

/* ================= 서비스워커 ================= */
/* ---------- 새 버전 적용 가드 (v0.5.3) ----------
 * 2026-09-22 사고: 새 버전이 준비되면 즉시 location.reload() 를 해서, 일괄 추가 시트에
 * 명단을 입력하던 중이면 저장 전에 입력이 날아갈 수 있었다.
 * → 입력 중(시트 열림/입력 포커스/초안 있음)에는 새로고침하지 않고 하단 바로 알리고,
 *   조작이 30초 없을 때만 조용히 적용한다.
 */
const updater = {
  waiting: null,       // 대기 중인 새 서비스워커
  barShown: false,
  lastInput: Date.now(),
  reloading: false,
};
const IDLE_MS = 30000;

function isBusyForUpdate() {
  if (modalStack.length) return true;                       // 시트/모달 열림
  const el = document.activeElement;
  if (el && el.matches?.('input, textarea, select')) return true; // 입력 중
  if (hasAnyDraft()) return true;                            // 저장 안 된 초안 있음
  return false;
}

function markInteraction() { updater.lastInput = Date.now(); }

function showUpdateBar() {
  if (updater.barShown) return;
  updater.barShown = true;
  const bar = document.createElement('div');
  bar.className = 'updatebar';
  bar.id = 'update-bar';
  bar.innerHTML = `<span>새 버전이 준비됐습니다</span>
    <button class="btn sm primary" id="btn-update-now">지금 새로고침</button>`;
  document.body.appendChild(bar);
}

function applyUpdateNow() {
  if (updater.reloading) return;
  updater.reloading = true;
  if (updater.waiting) updater.waiting.postMessage({ type: 'SKIP_WAITING' });
  else location.reload();
  setTimeout(() => { if (!document.hidden) location.reload(); }, 1200); // controllerchange 가 안 오면 직접
}

function maybeAutoUpdate() {
  if (!updater.waiting || updater.reloading) return;
  if (isBusyForUpdate()) return;
  if (Date.now() - updater.lastInput < IDLE_MS) return;
  applyUpdateNow();
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  ['pointerdown', 'keydown', 'input', 'focusin'].forEach((ev) =>
    document.addEventListener(ev, markInteraction, { passive: true, capture: true }));
  setInterval(maybeAutoUpdate, 5000);

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updater.reloading) { location.reload(); return; }
    // 사용자가 입력 중이면 새로고침하지 않는다 (다음 유휴 시점 또는 사용자가 바를 누를 때)
    if (isBusyForUpdate()) { showUpdateBar(); return; }
    updater.reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state !== 'installed' || !navigator.serviceWorker.controller) return;
        updater.waiting = nw;                 // 바로 적용하지 않고 대기시킨다
        showUpdateBar();
        maybeAutoUpdate();
      });
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);

    // 버전 불일치(옛 화면 고착) 감지: 서비스워커 버전 ≠ 앱 버전이면 즉시 갱신
    navigator.serviceWorker.addEventListener('message', (ev) => {
      if (ev.data?.type !== 'VERSION' || ev.data.version === APP_VERSION) return;
      console.warn('[sw] 버전 불일치', ev.data.version, '≠', APP_VERSION);
      const once = 'fc-ver-reload';
      reg.update().catch(() => {});
      if (sessionStorage.getItem(once) === APP_VERSION) return; // 한 번만
      if (isBusyForUpdate()) { showUpdateBar(); return; }        // 입력 중이면 나중에
      sessionStorage.setItem(once, APP_VERSION);
      // 같은 도메인의 다른 앱 캐시는 건드리지 않는다 (github.io 는 origin 공유)
      caches.keys()
        .then((ks) => Promise.all(ks.filter((k) => k.startsWith('woosulsan-fc-')).map((k) => caches.delete(k))))
        .then(() => location.reload());
    });
    const ping = () => navigator.serviceWorker.controller?.postMessage({ type: 'VERSION' });
    ping();
    navigator.serviceWorker.ready.then(ping);
  }).catch((e) => console.warn('[sw] 등록 실패', e));
}

/* ---------- 모듈 버전 검사 (v0.5.5, v0.5.8 보강) ----------
 * 2026-09-22 라이브 사고: 새 app.js 와 캐시에 남은 옛 store.js 가 섞여
 * "store 의 함수가 없다" 는 오류로 명단 화면이 통째로 비었다.
 * 파일이 여러 개인 ES 모듈 앱이라 "일부만 새 버전" 이 실제로 생긴다 → 부팅 때 직접 확인한다.
 *
 * v0.5.8 보강 — 같은 날 v0.5.7 배포 직후 재발했고, 원인이 하나 더 있었다.
 *   GitHub Pages 는 파일마다 따로 퍼져서, 배포 직후 수 분간
 *   "app.js 는 새것 · store.js 는 옛것" 인 구간이 실제로 존재한다.
 *   v0.5.5 가드는 재시도가 1회뿐이라 그 구간에서 새로고침하면 1회를 다 쓰고,
 *   두 번째 부팅에서는 토스트만 띄운 채 옛 모듈로 계속 돌았다.
 * → ① 캐시 삭제에 더해 어긋난 파일을 cache:'reload' 로 다시 받아 HTTP 캐시까지 갱신
 *    ② 재시도 3회 + 점점 길어지는 대기(0.6s → 1.8s → 3.6s)로 배포 구간을 넘긴다
 *    ③ 그래도 안 되면 그때 사람이 읽을 안내를 띄운다
 */
function checkModuleVersions() {
  const mods = { 'store.js': STORE_VERSION, 'env.js': ENV_VERSION };
  const bad = Object.entries(mods).filter(([, v]) => v !== APP_VERSION);
  if (!bad.length) {
    try { sessionStorage.removeItem(`fc-mod-reload:${APP_VERSION}`); sessionStorage.removeItem('fc-mod-reload'); } catch (e) { /* 무시 */ }
    return true;
  }
  console.warn('[app] 모듈 버전 불일치', bad, '기대값', APP_VERSION);

  const key = `fc-mod-reload:${APP_VERSION}`;
  let tries = NaN;   // 저장소가 막혔으면 NaN → moduleFixPlan 이 giveup 으로 받아 무한 새로고침을 막는다
  try { tries = Number(sessionStorage.getItem(key)) || 0; } catch (e) { tries = NaN; }
  // env.js 자체가 옛 파일이면 moduleFixPlan 이 undefined 일 수 있다 → 최소한의 대비책
  const fix = moduleFixPlan || ((n, t) => (Number(t) >= 3
    ? { action: 'giveup' }
    : { action: 'retry', attempt: (Number(t) || 0) + 1, wait: 1000 }));
  const plan = fix(bad.length, tries);
  if (plan.action !== 'retry') {
    showModuleMismatch(bad);   // 빈 화면으로 끝나지 않게 사람이 읽을 안내를 남긴다
    return false;
  }
  try { sessionStorage.setItem(key, String(plan.attempt)); }
  catch (e) { toast('앱 파일이 섞여 있습니다. 새로고침해 주세요', 'err'); return false; }   // 기록을 못 하면 재시도가 무한루프가 된다
  const wait = plan.wait;
  Promise.resolve()
    .then(() => caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith('woosulsan-fc-')).map((k) => caches.delete(k)))))
    .catch(() => {})
    // HTTP 캐시(브라우저·CDN)에 남은 옛 파일까지 강제로 다시 받는다
    .then(() => Promise.all(bad.map(([f]) => fetch(f, { cache: 'reload' }).catch(() => null))))
    .catch(() => {})
    .then(() => new Promise((r) => setTimeout(r, wait)))
    .then(() => location.reload());
  return false;
}

/** 재시도까지 실패한 경우 — 흰 화면 대신 무슨 일인지와 다음 행동을 보여 준다 (v0.5.9) */
function showModuleMismatch(bad) {
  const host = document.getElementById('view-home') || document.body;
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  host.classList.add('active');
  host.innerHTML = `
    <div class="card" style="margin-top:20px;padding:18px">
      <div style="font-weight:800;font-size:17px;margin-bottom:8px">앱 파일이 섞여 있습니다</div>
      <div style="font-size:13.5px;color:var(--text-2);line-height:1.75">
        새 버전을 받는 중에 일부 파일만 바뀜었습니다.
        <b>명단은 그대로 있으니</b> 잠시 뒤에 아래 버튼을 눌러 주세요.
        계속 같으면 앱을 완전히 닫았다 다시 열면 해결됩니다.
      </div>
      <div style="font-size:12px;color:var(--text-2);margin-top:10px">
        앱 ${esc(APP_VERSION)} · ${esc(bad.map(([f, v]) => `${f} ${v || '버전없음'}`).join(' · '))}
      </div>
      <button class="btn primary block" id="btn-mod-retry" style="margin-top:14px">다시 받기</button>
    </div>`;
  const btn = document.getElementById('btn-mod-retry');
  if (btn) {
    btn.addEventListener('click', () => {
      btn.disabled = true;
      btn.textContent = '받는 중…';
      try { sessionStorage.removeItem(`fc-mod-reload:${APP_VERSION}`); } catch (e) { /* 무시 */ }
      caches.keys()
        .then((ks) => Promise.all(ks.filter((k) => k.startsWith('woosulsan-fc-')).map((k) => caches.delete(k))))
        .catch(() => {})
        .then(() => location.reload());
    });
  }
}

/* ================= 시작 ================= */
async function main() {
  if (!checkModuleVersions()) return;   // 캐시가 섞였으면 복구 후 다시 시작한다
  $('#brand-logo').innerHTML = LOGO;
  $('#topbar-sub').textContent = APP_VERSION;   // 화면 빌드 표식
  $$('.tabbar button').forEach((b) => { $('.ico', b).innerHTML = ICON[b.dataset.icon]; });
  await store.init();
  bindEvents();
  render();
  applyHash();
  registerSW();
  window.addEventListener('beforeunload', () => store.flush());
}

window.__fc_hasAIKey = () => AI.hasKey();
window.__fc = { store, ui, render, switchTab, renderOurTeam, todaySession, availableToday,
  currentEnv, bannerFor, readMeta, writeMeta, needsBackup, importText, moveDataSheet, pasteImportSheet,
  saveDraft, readDraft, clearDraft, hasAnyDraft, isBusyForUpdate, showUpdateBar, applyUpdateNow, updater,
  parseMemberLine, splitNamePosition, analyzeMemberName, nameCandidates, nameFixSheet,
  effectiveSkill, isUnrated, rosterModal, parseRoster, matchNames,
  APP_VERSION, APP_NAME, AI, aiAskModal, aiState };
main();
