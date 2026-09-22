/* 웃을산 FC — 앱 본체 */
import { createStore, LocalStorageAdapter, TEAM_KEYS, ageOf, ageLabel, parseBirthYear,
  ABILITIES, abilAvg, GENDERS, parseGender } from './store.js';
import { parseRoster, matchNames } from './roster.js';
import { balanceTeams, groupStat, suggestMerges, suggestGroupCount, teamShortage } from './balance.js';
import * as AI from './ai.js';

export const APP_VERSION = 'v0.5.1';
/** 고정 소속 팀 A~D 색 */
const TEAM_COLORS = ['#1f7a4d', '#2f5fa8', '#b4552a', '#6b4ea8'];
export { TEAM_KEYS };

const store = createStore(new LocalStorageAdapter());
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ui = {
  tab: 'home',
  attendMatchId: null,
  teamMatchId: null,
  teamPlan: null,       // {matchId, mode:'merge'|'shuffle', groups:[['A','B'],...], teams:[[id,...],...]}
  groupCount: null,     // 사용자가 고른 오늘 팀 수
  teamSel: null,        // {t, i} 스왑 선택
  memberQuery: '',
  memberTeam: 'all',    // 회원 탭 팀 필터
  memberSort: 'name',   // 'name' | 'age'
  rosterDone: null,     // 명단 적용 결과 배너
  coachMode: false,     // 회원 탭 '감독 평가 화면'
  coachTeam: 'A',       // 감독 평가 대상 팀
  coachOpen: null,      // 펼친 회원 id
  showInactive: false,
  _suggestions: [],
};

/* ================= 유틸 ================= */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function fmtDate(d) {
  const [y, m, day] = String(d).split('-').map(Number);
  if (!y) return d;
  const dt = new Date(y, m - 1, day);
  const w = ['일', '월', '화', '수', '목', '금', '토'][dt.getDay()];
  return `${m}월 ${day}일 (${w})`;
}
function nextWeekday(target = 4) { // 기본 목요일
  const d = new Date();
  const diff = (target - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}
function stars(n) {
  let out = '';
  for (let i = 1; i <= 5; i += 1) out += i <= n ? '★' : '<span class="off">★</span>';
  return `<span class="stars">${out}</span>`;
}
function initial(name) { return String(name || '?').trim().slice(-2); }
/** 감독 뱃지 (팀 감독이면 표시) */
function coachBadge(memberId) {
  const k = store.club.coachTeamOf(memberId);
  if (!k) return '';
  const mism = store.members.byId(memberId)?.team !== k;
  return `<span class="chip coach${mism ? ' warn' : ''}" title="${esc(teamName(k))} 감독">🎽 감독</span>`;
}
function teamDot(key) {
  const i = TEAM_KEYS.indexOf(key);
  if (i < 0) return '<span class="tbadge none">미배정</span>';
  return `<span class="tbadge" style="--c:${TEAM_COLORS[i]}">${esc(store.club.teamName(key))}</span>`;
}

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
function closeModal({ fromPop = false } = {}) {
  const back = modalStack.pop();
  if (!back) return;
  back.remove();
  if (!modalStack.length) document.body.style.overflow = '';
  if (!fromPop && history.state?.modal) history.back();
}
window.addEventListener('popstate', () => {
  if (modalStack.length) closeModal({ fromPop: true });
  else applyHash();
});

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

/* ---------- 1) AI 팀 코치 ---------- */
async function aiTeamCoach() {
  const g = store.matches.byId(ui.teamMatchId);
  if (!g) return;
  const att = store.matches.teamAttendance(g.id);
  const total = TEAM_KEYS.reduce((n, k) => n + att[k].length, 0) + att.none.length;
  if (total < 4) { toast('참석자가 더 필요합니다', 'err'); return; }
  const byTeam = {};
  for (const k of TEAM_KEYS) if (att[k].length) byTeam[k] = att[k];
  if (att.none.length) byTeam.none = att.none;
  const plan = currentPlan(g);
  const groupCount = ui.groupCount || plan?.teams.length || suggestGroupCount(total, Object.keys(byTeam).length);
  const candidates = suggestMerges(byTeam, Math.min(groupCount, Object.keys(byTeam).length)).slice(0, 4);

  const r = await aiRun('#ai-coach-box', 'AI 팀 코치가 보는 중', AI.teamCoachPrompt({ store, matchId: g.id, candidates, groupCount }),
    (res) => {
      const j = res.json;
      const teams = Array.isArray(j.teams) ? j.teams : [];
      const byName = new Map(store.matches.attendees(g.id).map((m) => [m.name, m]));
      const mapped = teams.map((t) => ({
        name: String(t.name || ''),
        ids: (t.members || []).map((n) => byName.get(String(n).trim())?.id).filter(Boolean),
      }));
      const used = new Set(mapped.flatMap((t) => t.ids));
      const missing = [...byName.values()].filter((m) => !used.has(m.id));
      ui._aiPlan = mapped.every((t) => t.ids.length) ? mapped : null;
      return `<div class="ai-card">
        <div class="ai-head"><b>AI 추천 구성</b></div>
        <div class="ai-body">
          ${mapped.map((t, i) => `<div class="ai-team"><span class="dot" style="background:${TEAM_COLORS[i % 4]}"></span>
            <b>${esc(t.name || (i + 1) + '조')}</b> <span class="dim">${t.ids.length}명</span>
            <div class="s">${esc((teams[i].members || []).join(', '))}</div></div>`).join('')}
          ${missing.length ? `<div class="warnline"><span class="chip warn">빠진 사람 ${missing.length}명</span> ${esc(missing.map((m) => m.name).join(', '))}</div>` : ''}
          <div class="ai-sub">이유</div>${AI.renderMini((j.reasons || []).map((x) => '- ' + x).join('\n'), esc)}
          <div class="ai-sub">주의점</div>${AI.renderMini((j.cautions || []).map((x) => '- ' + x).join('\n'), esc)}
        </div>
        <div class="row" style="padding:0 12px 12px">
          <button class="btn primary grow" id="btn-ai-apply" ${ui._aiPlan && !missing.length ? '' : 'disabled'}>이 구성 적용</button>
        </div>
        ${aiCostLine(res)}
      </div>`;
    }, { json: true });
  return r;
}

function applyAIPlan() {
  const g = store.matches.byId(ui.teamMatchId);
  let mapped = ui._aiPlan;
  if (!g || !mapped) return;
  // 여성 회원 혼성팀 고정: AI 가 흩어 놨으면 한 묶음으로 되돌린다
  if (store.club.lockWomen()) {
    const women = store.matches.attendees(g.id).filter((m) => m.gender === '여').map((m) => m.id);
    if (women.length) {
      const target = mapped.reduce((best, t, i) => {
        const c = t.ids.filter((id) => women.includes(id)).length;
        return c > best.c ? { i, c } : best;
      }, { i: 0, c: -1 }).i;
      let moved = 0;
      mapped = mapped.map((t, i) => ({
        ...t,
        ids: i === target
          ? [...new Set([...t.ids, ...women])]
          : t.ids.filter((id) => { const w = women.includes(id); if (w) moved += 1; return !w; }),
      }));
      if (moved) toast(`여성 회원 ${moved}명을 혼성팀으로 옮겼습니다`);
    }
  }
  applyPlan({
    matchId: g.id, mode: 'shuffle', groups: [],
    labels: mapped.map((t, i) => t.name || `${i + 1}조`),
    teams: mapped.map((t) => [...t.ids]),
  });
  toast('AI 구성을 적용했습니다 (저장하려면 팀 확정 저장)');
}

/* ---------- 3) 공지문 / 총평 ---------- */
function aiNoticeModal(matchId) {
  const g = store.matches.byId(matchId);
  if (!g) return;
  const mode = g.status === '종료' ? 'review' : 'notice';
  openModal(`
    <h3>${mode === 'review' ? 'AI 경기 총평' : 'AI 단톡 공지문'}</h3>
    <div style="font-size:13px;color:var(--text-2);margin-bottom:10px">${esc(fmtDate(g.date))} ${esc(g.time || '')}${g.place ? ' · ' + esc(g.place) : ''}</div>
    <div class="field"><label>말투</label>
      <div class="seg-wide" id="f-tone">
        ${['짧게', '유쾌하게', '정중하게'].map((t, i) => `<button type="button" data-tone="${t}" aria-pressed="${i === 0}">${t}</button>`).join('')}
      </div>
    </div>
    <div id="ai-notice-box"></div>
    <div class="foot">
      <button class="btn ghost" data-act="close">닫기</button>
      <button class="btn primary" data-act="gen">${mode === 'review' ? '총평 쓰기' : '공지문 쓰기'}</button>
    </div>`, (m) => {
    let tone = '짧게';
    m.addEventListener('click', async (e) => {
      const tb = e.target.closest('#f-tone [data-tone]');
      if (tb) {
        tone = tb.dataset.tone;
        $$('#f-tone [data-tone]', m).forEach((b) => b.setAttribute('aria-pressed', String(b === tb)));
        return;
      }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'close') return closeModal();
      if (act === 'gen') {
        await aiRun('#ai-notice-box', mode === 'review' ? '총평 쓰는 중' : '공지문 쓰는 중',
          AI.noticePrompt({ store, matchId, mode, tone }),
          (res) => aiTextCard(mode === 'review' ? '총평' : '공지문', res.text, res));
      }
    });
  });
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
  renderHome();
  renderAttend();
  renderTeam();
  renderMembers();
  document.dispatchEvent(new CustomEvent('app:render'));
}

/* ---------- 홈 ---------- */
function renderHome() {
  const root = $('#view-home');
  const up = store.matches.upcoming();
  const next = up[0];
  const members = store.members.active();
  let html = '';

  if (next) {
    const att = Object.values(next.attendance).filter((v) => v === 'in').length;
    html += `
    <div class="hero">
      <svg class="lines" viewBox="0 0 300 160" preserveAspectRatio="none" aria-hidden="true">
        <rect x="8" y="8" width="284" height="144" fill="none" stroke="#fff" stroke-width="1.5"/>
        <circle cx="150" cy="80" r="30" fill="none" stroke="#fff" stroke-width="1.5"/>
        <path d="M150 8v144" stroke="#fff" stroke-width="1.5"/>
        <rect x="8" y="45" width="42" height="70" fill="none" stroke="#fff" stroke-width="1.5"/>
        <rect x="250" y="45" width="42" height="70" fill="none" stroke="#fff" stroke-width="1.5"/>
      </svg>
      <div class="label">다음 경기</div>
      <div class="date">${esc(fmtDate(next.date))} ${esc(next.time || '')}</div>
      <div class="place">${next.place ? esc(next.place) : '장소 미정'}</div>
      <div class="meta">
        <span class="pill">참석 ${att} / 전체 ${members.length}</span>
        <span class="pill">${esc(next.status)}</span>
      </div>
      <div class="teamline">
        ${TEAM_KEYS.map((k) => {
          const n = store.matches.teamAttendance(next.id)[k].length;
          return `<span class="tcell"><b>${esc(store.club.teamName(k))}</b><i>${n}</i></span>`;
        }).join('')}
      </div>
      <div class="actions">
        <button class="btn solid" data-go="attend" data-match="${next.id}">출석 체크</button>
        <button class="btn" data-go="team" data-match="${next.id}">팀 나누기</button>
      </div>
    </div>`;
  } else {
    html += `<div class="empty">
      ${ICON.ball}
      <div class="big">예정된 경기가 없습니다</div>
      <div>아래 버튼으로 이번 주 경기를 만들어 주세요.</div>
    </div>`;
  }

  html += `<button class="btn primary block" id="btn-new-match" style="margin-top:12px">${ICON.plus} 경기 만들기</button>`;
  if (next) {
    html += `<div class="row" style="margin-top:8px">
      <button class="btn grow ai" id="btn-ai-notice" data-match="${next.id}">${ICON.ai} 단톡 공지문 쓰기</button>
      <button class="btn grow ai" id="btn-ai-ask">${ICON.ai} AI에게 물어보기</button>
    </div>
    <div id="ai-home-box"></div>`;
  } else if (store.matches.all().length) {
    html += `<div class="row" style="margin-top:8px">
      <button class="btn block grow ai" id="btn-ai-ask">${ICON.ai} AI에게 물어보기</button>
    </div>
    <div id="ai-home-box"></div>`;
  }

  if (!members.length) {
    html += `<div class="section-title">시작하기</div>
      <div class="card">
        <div style="font-weight:800;margin-bottom:6px">회원부터 등록해 주세요</div>
        <div style="color:var(--text-2);font-size:13.5px;margin-bottom:12px">
          회원 탭에서 이름을 줄바꿈으로 붙여넣으면 한 번에 등록됩니다. 실력(1~5)·GK는 나중에 수정해도 됩니다.
        </div>
        <button class="btn block" data-go="members">회원 탭으로 이동</button>
      </div>`;
  }

  const recent = store.matches.sorted();
  if (recent.length) {
    html += `<div class="section-title">경기 목록 <span class="count">${recent.length}</span></div>`;
    html += recent.slice(0, 12).map(matchRow).join('');
  }

  root.innerHTML = html;
}

function matchRow(g) {
  const att = Object.values(g.attendance).filter((v) => v === 'in').length;
  const [, m, d] = g.date.split('-');
  return `<div class="match-row">
    <div class="d"><div class="m">${Number(m)}월</div><div class="n">${Number(d)}</div></div>
    <button class="info" data-open-match="${g.id}" style="background:none;border:none;padding:0">
      <div class="p">${g.place ? esc(g.place) : '장소 미정'}</div>
      <div class="s">${esc(g.time || '')} · 참석 ${att}명 · ${g.teamCount}팀</div>
    </button>
    <span class="st ${esc(g.status)}">${esc(g.status)}</span>
    <button class="btn sm ghost ai" data-ai-review="${g.id}" title="AI 글쓰기">AI</button>
    <button class="btn sm ghost" data-edit-match="${g.id}" aria-label="경기 수정">⋯</button>
  </div>`;
}

/* ---------- 출석 ---------- */
function renderAttend() {
  const root = $('#view-attend');
  const matches = store.matches.sorted();
  if (!matches.length) {
    root.innerHTML = emptyMatches('출석을 체크하려면 경기가 필요합니다.');
    return;
  }
  if (!ui.attendMatchId || !store.matches.byId(ui.attendMatchId)) {
    ui.attendMatchId = (store.matches.upcoming()[0] || matches[0]).id;
  }
  const g = store.matches.byId(ui.attendMatchId);
  const members = store.members.active();
  const counts = { in: 0, out: 0, maybe: 0, none: 0 };
  for (const m of members) {
    const v = g.attendance[m.id];
    if (v === 'in') counts.in += 1;
    else if (v === 'out') counts.out += 1;
    else if (v === 'maybe') counts.maybe += 1;
    else counts.none += 1;
  }

  const done = ui.rosterDone && ui.rosterDone.matchId === g.id ? ui.rosterDone : null;
  root.innerHTML = `
    ${done ? `<div class="gonext">
      <span>명단 적용 완료 · 참석 ${done.inCount}${done.added ? ` (신규 ${done.added})` : ''} · 불참 ${done.outCount}</span>
      <button class="btn sm primary" data-go="team" data-match="${g.id}">바로 팀 나누기 →</button>
    </div>` : ''}
    <div class="selectrow">
      <select id="att-match">${matchOptions(matches, g.id)}</select>
    </div>
    <div class="sticky-bar">
      <div class="count-strip">
        <div class="c in"><b>${counts.in}</b><span>참석</span></div>
        <div class="c out"><b>${counts.out}</b><span>불참</span></div>
        <div class="c"><b>${counts.maybe}</b><span>미정</span></div>
        <div class="c"><b>${counts.none}</b><span>미응답</span></div>
      </div>
      <div class="row" style="margin-top:8px">
        <button class="btn sm grow" data-att-all="in">전체 참석</button>
        <button class="btn sm grow" data-att-all="clear">초기화</button>
        <button class="btn sm grow primary" data-go="team" data-match="${g.id}">팀 나누기 →</button>
      </div>
      <div class="row" style="margin-top:6px">
        <button class="btn sm block grow paste" id="btn-roster">${ICON.paste} 카톡 명단 붙여넣기</button>
      </div>
    </div>
    ${members.length ? members.map((m) => attItem(m, g.attendance[m.id])).join('')
      : `<div class="empty"><div class="big">등록된 회원이 없습니다</div><div>회원 탭에서 먼저 추가해 주세요.</div></div>`}
  `;
}

function updateAttendCounts() {
  const g = store.matches.byId(ui.attendMatchId);
  if (!g) return;
  const counts = { in: 0, out: 0, maybe: 0, none: 0 };
  for (const m of store.members.active()) {
    const v = g.attendance[m.id];
    counts[v === 'in' || v === 'out' || v === 'maybe' ? v : 'none'] += 1;
  }
  const strip = $('#view-attend .count-strip');
  if (!strip) return;
  const cells = $$('.c b', strip);
  [counts.in, counts.out, counts.maybe, counts.none].forEach((n, i) => { if (cells[i]) cells[i].textContent = String(n); });
}

function attItem(m, v) {
  const st = store.stats.attendance(m.id);
  return `<div class="att-item">
    <div class="avatar">${esc(initial(m.name))}</div>
    <div class="nm">
      <b>${esc(m.name)}</b>
      <div class="sub">${teamDot(m.team)}${stars(m.skill)}${m.gk ? '<span class="chip gk">GK</span>' : ''}${st.rate != null ? `<span class="rate-mini">${st.rate}%</span>` : ''}</div>
    </div>
    <div class="seg" data-member="${m.id}">
      <button class="in" data-v="in" aria-pressed="${v === 'in'}">참석</button>
      <button class="out" data-v="out" aria-pressed="${v === 'out'}">불참</button>
      <button class="maybe" data-v="maybe" aria-pressed="${v === 'maybe'}">미정</button>
    </div>
  </div>`;
}

function matchOptions(matches, selId) {
  return matches.map((g) => `<option value="${g.id}" ${g.id === selId ? 'selected' : ''}>${esc(fmtDate(g.date))} ${esc(g.time || '')} ${g.place ? '· ' + esc(g.place) : ''}</option>`).join('');
}

function emptyMatches(msg) {
  return `<div class="empty">${ICON.ball}<div class="big">경기가 없습니다</div><div>${esc(msg)}</div>
    <button class="btn primary" style="margin-top:14px" id="btn-new-match-2">${ICON.plus} 경기 만들기</button></div>`;
}

/* ---------- 팀 ---------- */
function teamName(k) { return k === 'none' ? '미배정' : store.club.teamName(k); }
/** 팀 평균 능력치 한 줄 (입력된 사람이 없으면 표시 안 함) */
function abilLine(a, inline = false) {
  if (!a || !a.count) return '';
  const parts = [['speed', '스피드'], ['stamina', '지구력'], ['defense', '수비']]
    .filter(([k]) => a[k] != null).map(([k, label]) => `${label} ${a[k]}`);
  if (!parts.length) return '';
  const body = `${parts.join(' · ')}<span class="dimmer"> (${a.count}명)</span>`;
  return inline ? `<br><span class="abil-mini">${body}</span>` : `<div class="meta abil-mini">${body}</div>`;
}
function groupLabel(group, i, mode) {
  if (mode === 'shuffle' || !group || !group.length) return `${i + 1}조`;
  return group.map(teamName).join(' + ');
}
/** 구성(plan) 기준 팀 이름 — AI 가 지은 이름(labels)이 있으면 우선 */
function labelOf(plan, i) {
  if (plan?.labels?.[i]) return plan.labels[i];
  return groupLabel(plan?.groups?.[i], i, plan?.mode);
}
function groupColor(group, i, mode) {
  if (mode === 'shuffle' || !group || !group.length) return TEAM_COLORS[i % TEAM_COLORS.length];
  const idx = TEAM_KEYS.indexOf(group[0]);
  return idx >= 0 ? TEAM_COLORS[idx] : TEAM_COLORS[i % TEAM_COLORS.length];
}

/** 이번 경기의 오늘 팀 구성(초안). 없으면 저장된 구성, 그것도 없으면 null */
function currentPlan(g) {
  if (ui.teamPlan && ui.teamPlan.matchId === g.id) return ui.teamPlan;
  if (g.teams && g.teams.length) {
    return {
      matchId: g.id,
      mode: g.teamPlan?.mode || 'merge',
      groups: g.teamPlan?.groups || [],
      labels: g.teamPlan?.labels || [],
      teams: g.teams.map((ids) => [...ids]),
    };
  }
  return null;
}

function applyPlan(plan) {
  ui.teamPlan = plan;
  ui.teamSel = null;
  renderTeam();
}

function renderTeam() {
  const root = $('#view-team');
  const matches = store.matches.sorted();
  if (!matches.length) { root.innerHTML = emptyMatches('팀을 나누려면 경기가 필요합니다.'); return; }
  if (!ui.teamMatchId || !store.matches.byId(ui.teamMatchId)) {
    ui.teamMatchId = (store.matches.upcoming()[0] || matches[0]).id;
  }
  const g = store.matches.byId(ui.teamMatchId);
  const att = store.matches.teamAttendance(g.id);
  const total = TEAM_KEYS.reduce((n, k) => n + att[k].length, 0) + att.none.length;

  let html = `<div class="selectrow"><select id="team-match">${matchOptions(matches, g.id)}</select></div>`;

  /* 1) 팀별 참석 현황 */
  html += `<div class="section-title">팀별 참석 현황 <span class="count">참석 ${total}명</span>
    <button class="btn sm ghost right" id="btn-team-names">팀 이름</button></div>`;
  html += '<div class="team-grid">';
  html += TEAM_KEYS.map((k, i) => {
    const list = att[k];
    const s = groupStat(list);
    const short = list.length ? teamShortage(s) : ['참석 없음'];
    return `<div class="tstat" style="--c:${TEAM_COLORS[i]}">
      <div class="hd"><span class="dot"></span><b>${esc(teamName(k))}</b><span class="n">${list.length}명</span></div>
      ${store.club.coach(k) ? `<div class="meta coachline">🎽 감독 ${esc(store.members.byId(store.club.coach(k))?.name || '-')}</div>` : ''}
      <div class="meta">전력 ${s.total} · 평균 ${s.avg || 0}</div>
      <div class="meta">GK ${s.gk} · FW ${s.pos.FW} · MF ${s.pos.MF} · DF ${s.pos.DF}</div>
      ${s.ageAvg != null ? `<div class="meta">평균 나이 ${s.ageAvg}세<span class="dimmer">${s.ageCount < s.size ? ` (${s.ageCount}명 기준)` : ''}</span></div>` : ''}
      ${abilLine(s.abil)}
      ${s.male || s.female ? `<div class="meta">남 ${s.male} · 여 ${s.female}${store.club.isMixed(k) ? ' <span class="chip mixed">혼성</span>' : ''}</div>`
        : (store.club.isMixed(k) ? '<div class="meta"><span class="chip mixed">혼성</span></div>' : '')}
      ${short.length ? `<div class="warnline">${short.map((r) => `<span class="chip warn">${r}</span>`).join(' ')}</div>`
        : '<div class="okline">경기 가능</div>'}
    </div>`;
  }).join('');
  html += '</div>';
  if (att.none.length) {
    html += `<div class="card flat" style="padding:10px 12px;margin-top:8px">
      <span class="chip warn">미배정 ${att.none.length}명</span>
      <span style="font-size:12.5px;color:var(--text-2);margin-left:6px">${esc(att.none.slice(0, 6).map((m) => m.name).join(', '))}${att.none.length > 6 ? ' 외' : ''} — 회원 탭에서 소속 팀을 정해 주세요.</span>
    </div>`;
  }

  if (total < 2) {
    html += `<div class="empty" style="margin-top:12px"><div class="big">참석자가 부족합니다</div>
      <div>출석 탭에서 참석자를 먼저 체크해 주세요.</div>
      <button class="btn" style="margin-top:14px" data-go="attend" data-match="${g.id}">출석 탭으로</button></div>`;
    root.innerHTML = html;
    return;
  }

  /* 2) 오늘 팀 수 + 합치기 제안 */
  const byTeam = {};
  for (const k of TEAM_KEYS) if (att[k].length) byTeam[k] = att[k];
  if (att.none.length) byTeam.none = att.none;
  const availableTeams = Object.keys(byTeam).length;
  const plan = currentPlan(g);
  const recommended = suggestGroupCount(total, availableTeams);
  const wanted = ui.groupCount || (plan ? plan.teams.length : recommended);
  const options = [2, 3, 4].filter((n) => n <= Math.max(2, availableTeams));

  html += `<div class="section-title">오늘 팀 수 <span class="count">권장 ${recommended}팀</span></div>
    <div class="seg-wide" id="group-count">
      ${options.map((n) => `<button data-gc="${n}" aria-pressed="${wanted === n}">${n}팀</button>`).join('')}
    </div>`;

  const suggestions = availableTeams >= 2 ? suggestMerges(byTeam, Math.min(wanted, availableTeams)).slice(0, 3) : [];
  ui._suggestions = suggestions;
  if (suggestions.length) {
    html += `<div class="section-title">합치기 제안 <span class="count">${suggestions.length}개</span></div>`;
    html += suggestions.map((sg, i) => {
      const labels = sg.groups.map((grp) => grp.map(teamName).join('+')).join(' / ');
      return `<div class="sugg${i === 0 ? ' best' : ''}">
        <div class="l">
          <div class="t">${esc(labels)}${i === 0 ? '<span class="chip gk" style="margin-left:6px">추천</span>' : ''}</div>
          <div class="s">전력 ${sg.stats.map((x) => x.total).join('/')} · 인원 ${sg.stats.map((x) => x.size).join('/')} · GK ${sg.stats.map((x) => x.gk).join('/')}</div>
        </div>
        <button class="btn sm primary" data-adopt="${i}">채택</button>
      </div>`;
    }).join('');
  } else {
    html += `<div class="card flat" style="padding:12px"><div style="font-size:13px;color:var(--text-2)">
      참석한 소속 팀이 하나뿐입니다. 아래 "완전 새로 섞기"로 나누세요.</div></div>`;
  }
  const anyWoman = store.members.active().some((m) => m.gender === '여');
  if (anyWoman) {
    html += `<div class="togglerow" style="margin-top:10px">
      <label>여성 회원 혼성팀 고정${store.club.mixedTeams().length ? '' : ' <span class="dimmer">(혼성팀 미지정)</span>'}</label>
      <button type="button" class="switch" id="btn-lock-women" aria-pressed="${store.club.lockWomen()}"></button>
    </div>`;
  }
  html += `<div class="row" style="margin-top:8px">
    <button class="btn block grow" id="btn-shuffle-all">${ICON.shuffle} 소속 무시하고 완전 새로 섞기</button>
  </div>
  <div class="row" style="margin-top:8px">
    <button class="btn block grow ai" id="btn-ai-coach">${ICON.ai} AI 팀 코치에게 물어보기</button>
  </div>
  <div id="ai-coach-box"></div>`;

  /* 3) 오늘의 최종 구성 */
  if (!plan) {
    html += `<div class="empty" style="margin-top:14px"><div class="big">오늘 팀이 아직 없습니다</div>
      <div>위 제안을 "채택"하거나 "완전 새로 섞기"를 누르세요.</div></div>`;
    root.innerHTML = html;
    return;
  }

  const teams = plan.teams.map((ids) => ids.map((id) => store.members.byId(id)).filter(Boolean));
  const st = teams.map(groupStat);
  const totals = st.map((x) => x.total);
  const sp = Math.max(...totals) - Math.min(...totals);
  html += `<div class="section-title">오늘의 팀 <span class="right">전력 차 ${sp}</span></div>`;
  html += teams.map((t, i) => {
    const color = groupColor(plan.groups[i], i, plan.mode);
    return `<div class="team-card">
      <div class="hd" style="background:${color}">
        <span class="t">${esc(labelOf(plan, i))}</span>
        <span class="r">${t.length}명 · 전력 ${st[i].total} · GK ${st[i].gk}${st[i].female ? ` · 여 ${st[i].female}` : ''}</span>
      </div>
      <div class="bd">
        ${t.map((p, j) => `<button class="pcard${ui.teamSel && ui.teamSel.t === i && ui.teamSel.i === j ? ' sel' : ''}" data-swap="${i}:${j}">
          ${p.gk ? '<span class="gkb">GK</span>' : ''}${store.club.coachTeamOf(p.id) ? '<span class="cb">🎽</span>' : ''}
          <span class="n">${esc(p.name)}</span><span class="sk">${p.skill}</span>
        </button>`).join('')}
      </div>
      <div class="bfoot">FW ${st[i].pos.FW} · MF ${st[i].pos.MF} · DF ${st[i].pos.DF}${st[i].ageAvg != null ? ` · 평균 ${st[i].ageAvg}세` : ''}${st[i].gk ? '' : ' · <b style="color:var(--warn)">GK 없음</b>'}${abilLine(st[i].abil, true)}</div>
    </div>`;
  }).join('');
  html += `<div class="row wrap" style="margin-top:4px">
      <button class="btn grow" id="btn-reshuffle">${ICON.shuffle} 다시 섞기</button>
      <button class="btn grow primary" id="btn-save-teams">팀 확정 저장</button>
    </div>
    <div class="row" style="margin-top:8px">
      <button class="btn block grow" id="btn-team-png">${ICON.image} 공유용 이미지 저장</button>
    </div>
    ${ui.teamSel
      ? '<div class="swap-hint">바꿀 상대 선수를 탭하세요</div>'
      : '<div class="footer-note">선수 카드를 탭 → 다른 선수 탭 = 자리 교체</div>'}`;

  root.innerHTML = html;
}

/** 제안 채택 → 오늘의 팀 구성 */
function adoptSuggestion(idx) {
  const g = store.matches.byId(ui.teamMatchId);
  const sg = ui._suggestions?.[idx];
  if (!g || !sg) return;
  applyPlan({
    matchId: g.id,
    mode: 'merge',
    groups: sg.groups.map((grp) => [...grp]),
    teams: sg.players.map((list) => list.map((p) => p.id)),
  });
  toast(`채택 · 전력 ${sg.stats.map((x) => x.total).join('/')} (차 ${sg.spread})`);
}

/** 팀 이름 편집 */
function teamNameModal() {
  openModal(`
    <h3>팀 이름</h3>
    <div style="font-size:13px;color:var(--text-2);margin-bottom:10px">고정 소속 팀 4개의 이름입니다. 회원은 이 중 한 팀에 속합니다.</div>
    ${TEAM_KEYS.map((k) => `<div class="field"><label>${k}</label>
      <input type="text" data-tn="${k}" value="${esc(teamName(k))}" maxlength="12">
      <div class="togglerow" style="margin-top:6px">
        <label>혼성팀 (여성 회원 소속)</label>
        <button type="button" class="switch" data-mixed="${k}" aria-pressed="${store.club.isMixed(k)}"></button>
      </div>
      <div class="field" style="margin:8px 0 0">
        <label>감독 (이 팀 회원 중 1명)</label>
        <select data-coach="${k}">
          <option value="">없음</option>
          ${store.members.byTeam(k).map((mm) => `<option value="${mm.id}" ${store.club.coach(k) === mm.id ? 'selected' : ''}>${esc(mm.name)}</option>`).join('')}
          ${(() => {
            const cur = store.club.coach(k);
            const m2 = cur ? store.members.byId(cur) : null;
            return m2 && m2.team !== k ? `<option value="${m2.id}" selected>${esc(m2.name)} (다른 팀)</option>` : '';
          })()}
        </select>
      </div></div>`).join('')}
    ${store.club.coachMismatches().length ? `<div class="card flat" style="padding:10px 12px">
      ${store.club.coachMismatches().map((x) => `<div style="font-size:12.5px"><span class="chip warn">확인</span>
        ${esc(teamName(x.key))} 감독 ${esc(x.member?.name || '(삭제된 회원)')} —
        ${x.reason === 'moved' ? `지금은 ${esc(x.member.team ? teamName(x.member.team) : '미배정')} 소속입니다` : x.reason === 'inactive' ? '비활동 회원입니다' : '회원 목록에 없습니다'}</div>`).join('')}
    </div>` : ''}
    <div class="foot">
      <button class="btn ghost" data-act="cancel">취소</button>
      <button class="btn primary" data-act="save">저장</button>
    </div>`, (m) => {
    m.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'cancel') return closeModal();
      $$('[data-tn]', m).forEach((inp) => store.club.setTeamName(inp.dataset.tn, inp.value));
      $$('[data-mixed]', m).forEach((b) => store.club.setMixed(b.dataset.mixed, b.getAttribute('aria-pressed') === 'true'));
      $$('[data-coach]', m).forEach((sel) => store.club.setCoach(sel.dataset.coach, sel.value || null));
      closeModal();
      toast('팀 이름을 저장했습니다');
      render();
    });
  });
}


/* ---------- 감독 평가 화면 (팀 감독이 종합 실력을 빠르게 입력) ---------- */
function renderCoachMode(root) {
  const key = TEAM_KEYS.includes(ui.coachTeam) ? ui.coachTeam : 'A';
  ui.coachTeam = key;
  const list = store.members.byTeam(key).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const coachId = store.club.coach(key);
  const coach = coachId ? store.members.byId(coachId) : null;

  root.innerHTML = `
    <div class="row" style="margin-bottom:10px">
      <button class="btn grow" id="btn-coach-exit">← 회원 목록</button>
      <button class="btn grow ghost" id="btn-team-names-3">팀·감독 설정</button>
    </div>
    <div class="coach-head">
      <div class="t">감독 평가 화면</div>
      <div class="s">팀을 고르고 각 선수의 종합 실력을 바로 눌러 주세요. 저장은 자동입니다.</div>
    </div>
    <div class="seg-wide" id="coach-team">
      ${TEAM_KEYS.map((k) => `<button data-ct="${k}" aria-pressed="${k === key}">${esc(teamName(k))}</button>`).join('')}
    </div>
    <div class="coach-sub">${coach ? `🎽 감독: ${esc(coach.name)}${coach.team !== key ? ' <span class="chip warn">다른 팀 소속</span>' : ''}` : '감독 미지정 — 팀·감독 설정에서 지정할 수 있습니다'}</div>
    ${list.length ? list.map((m) => coachRow(m, key)).join('')
      : `<div class="empty"><div class="big">이 팀에 회원이 없습니다</div><div>회원 탭에서 소속 팀을 지정해 주세요.</div></div>`}
    <div class="footer-note">종합 실력만 팀 밸런스에 쓰입니다. 간단 체크는 참고용입니다.</div>`;
}

function coachRow(m, key) {
  const open = ui.coachOpen === m.id;
  return `<div class="crow${open ? ' open' : ''}" data-crow="${m.id}">
    <div class="line">
      <div class="who">
        <b>${esc(m.name)}</b>${store.club.coachTeamOf(m.id) === key ? '<span class="chip coach">🎽</span>' : ''}
        <div class="meta">${m.birthYear ? `${ageOf(m.birthYear)}세 · ` : ''}${esc(m.pos)}${m.gk ? ' · GK' : ''}${m.skillUpdatedAt ? ` · ${esc(fmtWhen(m.skillUpdatedAt))} ${esc(whoLabel(m.skillUpdatedBy))}` : ' · 미평가'}</div>
      </div>
      <div class="dots" data-skill="${m.id}">
        ${[1, 2, 3, 4, 5].map((n) => `<button class="dot" data-v="${n}" aria-pressed="${m.skill >= n}" aria-label="${esc(m.name)} 실력 ${n}"></button>`).join('')}
      </div>
      <button class="more" data-copen="${m.id}" aria-expanded="${open}">${open ? '▴' : '▾'}</button>
    </div>
    ${open ? `<div class="detail">
      ${ABILITIES.map((a) => `<div class="abil-row" data-cabil="${m.id}:${a.key}">
        <span class="nm">${a.label}</span>
        <span class="dots">
          ${[1, 2, 3, 4, 5].map((n) => `<button class="dot" data-v="${n}" aria-pressed="${(m.abil?.[a.key] || 0) >= n}"></button>`).join('')}
          <button class="clr" data-v="0">×</button>
        </span>
      </div>`).join('')}
      <div class="hint">${m.abilUpdatedAt ? `간단 체크 ${esc(fmtWhen(m.abilUpdatedAt))} · ${esc(whoLabel(m.abilUpdatedBy))}` : '간단 체크 미입력'}
        ${abilAvg(m.abil) ? ` · 세부 평균 ${abilAvg(m.abil)}` : ''}</div>
    </div>` : ''}
  </div>`;
}

/* ---------- 회원 ---------- */
/** 여성 회원인데 소속 팀이 혼성팀이 아니면 안내 (오류 아님) */
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
  if (String(by).startsWith('coach')) {
    const k = String(by).split(':')[1];
    return k ? `${teamName(k)} 감독` : '감독';
  }
  return String(by);
}

function womanWarn(m) {
  if (m.gender !== '여' || !store.club.lockWomen()) return '';
  if (m.team && store.club.isMixed(m.team)) return '';
  return '<span class="chip warn">혼성팀 아님</span>';
}

/** 팀별 평균 능력치 요약표 (입력된 사람 기준) */
function teamAbilTable() {
  const rows = TEAM_KEYS.map((k) => ({ k, members: store.members.byTeam(k) }))
    .filter((r) => r.members.some((m) => abilAvg(m.abil) != null));
  if (!rows.length) return '';
  const cols = ABILITIES.map((a) => a.key);
  return `<div class="section-title">팀별 평균 능력치</div>
    <div class="card" style="padding:12px;overflow-x:auto">
      <table class="abil-table">
        <thead><tr><th>팀</th>${ABILITIES.map((a) => `<th>${esc(a.label.slice(0, 3))}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map((r) => `<tr>
            <td class="tm">${esc(store.club.teamName(r.k))}</td>
            ${cols.map((c) => {
              const vals = r.members.map((m) => m.abil?.[c]).filter((v) => typeof v === 'number');
              const v = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
              return `<td${v != null && v >= 4 ? ' class="hi"' : ''}>${v == null ? '–' : v}</td>`;
            }).join('')}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderMembers() {
  const root = $('#view-members');
  if (ui.coachMode) return renderCoachMode(root);
  const all = store.members.all();
  const q = ui.memberQuery.trim();
  const list = all
    .filter((m) => (ui.showInactive ? true : m.active))
    .filter((m) => !q || m.name.includes(q))
    .filter((m) => ui.memberTeam === 'all' || (ui.memberTeam === 'none' ? !m.team : m.team === ui.memberTeam))
    .sort((a, b) => (ui.memberSort === 'age'
      ? ((a.birthYear || 9999) - (b.birthYear || 9999)) || a.name.localeCompare(b.name, 'ko')
      : (a.team || 'Z').localeCompare(b.team || 'Z') || a.name.localeCompare(b.name, 'ko')));
  const counts = { none: all.filter((m) => m.active && !m.team).length };
  for (const k of TEAM_KEYS) counts[k] = all.filter((m) => m.active && m.team === k).length;

  let html = `
    <div class="row" style="margin-bottom:10px">
      <button class="btn primary grow" id="btn-add-member">${ICON.plus} 회원 추가</button>
      <button class="btn grow" id="btn-bulk-member">일괄 추가</button>
    </div>
    <div class="row" style="margin-bottom:10px">
      <button class="btn block grow" id="btn-coach-mode">🎽 감독 평가 화면</button>
    </div>
    <div class="search-wrap">${ICON.search}<input id="member-q" type="search" placeholder="이름 검색" value="${esc(q)}"></div>
    <div class="teamfilter">
      <button data-mt="all" aria-pressed="${ui.memberTeam === 'all'}">전체 ${all.filter((m) => m.active).length}</button>
      ${TEAM_KEYS.map((k, i) => `<button data-mt="${k}" aria-pressed="${ui.memberTeam === k}" style="--c:${TEAM_COLORS[i]}"><span class="dot"></span>${esc(store.club.teamName(k))} ${counts[k]}</button>`).join('')}
      <button data-mt="none" aria-pressed="${ui.memberTeam === 'none'}">미배정 ${counts.none}</button>
    </div>
    <div class="section-title">회원 <span class="count">${list.length}${all.length !== list.length ? ` / ${all.length}` : ''}</span>
      <button class="btn sm ghost right" id="btn-sort">${ui.memberSort === 'age' ? '나이순 ↑' : '이름순'}</button>
      <button class="btn sm ghost" id="btn-toggle-inactive">${ui.showInactive ? '활동 회원만' : '비활동 포함'}</button>
    </div>`;

  if (!list.length) {
    html += `<div class="empty">${ICON.member}<div class="big">${all.length ? '검색 결과가 없습니다' : '회원이 없습니다'}</div>
      <div>${all.length ? '다른 이름으로 검색해 보세요.' : '"일괄 추가"로 이름을 줄바꿈으로 붙여넣으면 한 번에 등록됩니다.'}</div></div>`;
  } else {
    html += list.map((m) => {
      const st = store.stats.attendance(m.id);
      return `<button class="mem-item${m.active ? '' : ' off'}" data-member-edit="${m.id}">
        <div class="avatar">${esc(initial(m.name))}</div>
        <div class="nm"><b>${esc(m.name)}${m.birthYear ? ` <span class="agebadge">${ageOf(m.birthYear)}세</span>` : ''}${m.active ? '' : ' <span class="chip">비활동</span>'}</b>
          <div class="sub">${teamDot(m.team)}${coachBadge(m.id)}${m.gender ? `<span class="chip g${m.gender === '여' ? 'f' : 'm'}">${m.gender}</span>` : ''}${stars(m.skill)} <span class="chip pos">${esc(m.pos)}</span>${m.gk ? '<span class="chip gk">GK</span>' : ''}${womanWarn(m)}</div>
        </div>
        <div class="rate">${st.rate != null ? st.rate + '%' : '–'}<small>${st.present}/${st.total}회</small></div>
      </button>`;
    }).join('');
  }

  html += `
    ${teamAbilTable()}
    <div class="section-title">설정 · 백업</div>
    <div class="card">
      <div class="row" style="margin-bottom:8px">
        <button class="btn grow" id="btn-export">JSON 내보내기</button>
        <button class="btn grow" id="btn-import">JSON 가져오기</button>
      </div>
      <button class="btn block" id="btn-team-names-2" style="margin-bottom:8px">팀 이름 바꾸기</button>
      <input type="file" id="file-import" accept="application/json,.json" class="hidden">
      <div style="font-size:12.5px;color:var(--text-2);line-height:1.6">
        데이터는 이 기기(브라우저)에만 저장됩니다. 기기를 바꾸거나 백업하려면 JSON으로 내보내 두세요.
      </div>
      <button class="btn danger block" id="btn-reset" style="margin-top:12px">전체 데이터 초기화</button>
    </div>
    ${aiSettingsCard()}
    <div class="footer-note">웃을산 FC · ${APP_VERSION} · <span id="sw-state">로컬 저장</span></div>`;

  root.innerHTML = html;
}

/* ================= 동작 ================= */
function switchTab(tab, { push = true } = {}) {
  if (tab !== 'attend') ui.rosterDone = null; // 안내 배너는 한 번만
  ui.tab = tab;
  // 다른 탭에서 바뀐 내용이 반영되도록 진입 시 해당 화면만 다시 그림
  if (tab === 'home') renderHome();
  else if (tab === 'attend') renderAttend();
  else if (tab === 'team') renderTeam();
  else if (tab === 'members') renderMembers();
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${tab}`));
  $$('.tabbar button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  $('#topbar-title').textContent = { home: '웃을산 FC', attend: '출석 체크', team: '팀 나누기', tactics: '전술판', members: '회원 관리' }[tab];
  if (push && location.hash !== `#${tab}`) location.hash = `#${tab}`;
  window.scrollTo({ top: 0 });
  document.dispatchEvent(new CustomEvent('app:tab', { detail: tab }));
}
function applyHash() {
  const t = (location.hash || '#home').slice(1);
  if (['home', 'attend', 'team', 'tactics', 'members'].includes(t)) switchTab(t, { push: false });
}

function matchModal(existing) {
  const g = existing || { date: nextWeekday(4), time: '20:00', place: '', teamCount: 2, status: '예정' };
  openModal(`
    <h3>${existing ? '경기 수정' : '경기 만들기'}</h3>
    <div class="field"><label>날짜</label><input type="date" id="f-date" value="${esc(g.date)}"></div>
    <div class="field"><label>시간</label><input type="time" id="f-time" value="${esc(g.time)}"></div>
    <div class="field"><label>장소</label><input type="text" id="f-place" placeholder="예: 시민운동장 A구장" value="${esc(g.place)}"></div>
    <div class="field"><label>팀 수</label>
      <div class="seg-wide" id="f-tc">
        <button type="button" data-tc="2" aria-pressed="${g.teamCount === 2}">2팀</button>
        <button type="button" data-tc="3" aria-pressed="${g.teamCount === 3}">3팀</button>
      </div>
    </div>
    ${existing ? `<div class="field"><label>상태</label>
      <div class="seg-wide" id="f-st">
        ${['예정', '확정', '종료'].map((s) => `<button type="button" data-st="${s}" aria-pressed="${g.status === s}">${s}</button>`).join('')}
      </div></div>` : ''}
    <div class="foot">
      ${existing ? '<button class="btn danger" data-act="del">삭제</button>' : ''}
      <button class="btn ghost" data-act="cancel">취소</button>
      <button class="btn primary" data-act="save">저장</button>
    </div>`, (m) => {
    let tc = g.teamCount; let st = g.status;
    m.addEventListener('click', async (e) => {
      const tcb = e.target.closest('#f-tc [data-tc]');
      if (tcb) { tc = Number(tcb.dataset.tc); $$('#f-tc [data-tc]', m).forEach((b) => b.setAttribute('aria-pressed', String(b === tcb))); return; }
      const stb = e.target.closest('#f-st [data-st]');
      if (stb) { st = stb.dataset.st; $$('#f-st [data-st]', m).forEach((b) => b.setAttribute('aria-pressed', String(b === stb))); return; }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'cancel') return closeModal();
      if (act === 'del') {
        closeModal();
        if (await confirmDialog({ title: '이 경기를 삭제할까요?', body: '출석·팀 구성·전술도 함께 삭제됩니다.', ok: '삭제', danger: true })) {
          store.matches.remove(existing.id);
          toast('경기를 삭제했습니다');
          render();
        }
        return;
      }
      const data = {
        date: $('#f-date', m).value || todayStr(),
        time: $('#f-time', m).value || '20:00',
        place: $('#f-place', m).value.trim(),
        teamCount: tc, status: st,
      };
      if (existing) { store.matches.update(existing.id, data); toast('경기를 수정했습니다'); }
      else {
        const created = store.matches.add(data);
        ui.attendMatchId = created.id; ui.teamMatchId = created.id;
        toast('경기를 만들었습니다');
      }
      closeModal();
      render();
    });
  });
}

function memberModal(existing) {
  const m0 = existing || { name: '', skill: 3, gk: false, pos: 'MF', team: null, birthYear: null, gender: null, active: true };
  openModal(`
    <h3>${existing ? '회원 수정' : '회원 추가'}</h3>
    <div class="field"><label>이름</label><input type="text" id="f-name" value="${esc(m0.name)}" placeholder="이름" autocomplete="off"></div>
    <div class="field"><label>출생년도 (선택)</label>
      <input type="text" id="f-birth" inputmode="numeric" pattern="[0-9]*" maxlength="4"
             value="${m0.birthYear || ''}" placeholder="예: 90 또는 1990" autocomplete="off">
      <div class="hint" id="birth-hint">${m0.birthYear ? esc(ageLabel(m0.birthYear)) : '2자리로 넣으면 자동으로 19xx/20xx 를 맞춥니다'}</div>
    </div>
    <div class="field"><label>실력 (1~5) <span class="labelhint">평가: 팀 감독</span></label>
      ${existing && existing.skillUpdatedAt ? `<div class="hint">마지막 평가 ${esc(fmtWhen(existing.skillUpdatedAt))} · ${esc(whoLabel(existing.skillUpdatedBy))}</div>` : ''}
      <div class="skillpick" id="f-skill">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-s="${n}" aria-pressed="${m0.skill === n}">${n}</button>`).join('')}</div>
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
    <div class="field"><label>소속 팀</label>
      <div class="seg-wide" id="f-team">
        ${TEAM_KEYS.map((k) => `<button type="button" data-tk="${k}" aria-pressed="${m0.team === k}">${esc(store.club.teamName(k))}</button>`).join('')}
        <button type="button" data-tk="" aria-pressed="${!m0.team}">미배정</button>
      </div>
    </div>
    <div class="abil-sec" id="f-abil-sec">
      <button type="button" class="abil-head" id="f-abil-toggle" aria-expanded="true">
        <b>간단 체크</b><span class="labelhint">평가: 팀 감독</span><span class="dim" id="f-abil-sum">${abilAvg(m0.abil) ? `평균 ${abilAvg(m0.abil)}` : '미입력'}</span><span class="caret">▾</span>
      </button>
      <div class="abil-body" id="f-abil-body">
        ${ABILITIES.map((a) => `<div class="abil-row" data-abil="${a.key}">
          <span class="nm">${a.label}${a.hint ? `<i>${a.hint}</i>` : ''}</span>
          <span class="dots">
            ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="dot" data-v="${n}"
              aria-pressed="${(m0.abil?.[a.key] || 0) >= n}" aria-label="${a.label} ${n}점"></button>`).join('')}
            <button type="button" class="clr" data-v="0" aria-label="${a.label} 지우기">×</button>
          </span>
        </div>`).join('')}
        <button type="button" class="btn sm block" id="f-abil-fill" style="margin-top:8px">세부 평균으로 종합 실력 채우기</button>
      </div>
    </div>
    <div class="togglerow"><label for="f-gk">골키퍼 가능</label><button type="button" class="switch" id="f-gk" aria-pressed="${!!m0.gk}"></button></div>
    <div class="togglerow"><label for="f-active">활동 중</label><button type="button" class="switch" id="f-active" aria-pressed="${m0.active !== false}"></button></div>
    <div class="foot">
      ${existing ? '<button class="btn danger" data-act="del">삭제</button>' : ''}
      <button class="btn ghost" data-act="cancel">취소</button>
      <button class="btn primary" data-act="save">저장</button>
    </div>`, (m) => {
    let skill = m0.skill; let pos = m0.pos; let team = m0.team || null; let gender = m0.gender || null;
    const abil = Object.fromEntries(ABILITIES.map((a) => [a.key, m0.abil?.[a.key] ?? null]));
    const paintAbil = () => {
      for (const a of ABILITIES) {
        const row = $(`[data-abil="${a.key}"]`, m);
        if (!row) continue;
        $$('.dot', row).forEach((b) => b.setAttribute('aria-pressed', String((abil[a.key] || 0) >= Number(b.dataset.v))));
        row.classList.toggle('empty', abil[a.key] == null);
      }
      const avg = abilAvg(abil);
      const sum = $('#f-abil-sum', m);
      if (sum) sum.textContent = avg ? `평균 ${avg}` : '미입력';
    };
    m.addEventListener('click', async (e) => {
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
      if (e.target.closest('#f-abil-fill')) {
        const avg = abilAvg(abil);
        if (!avg) { toast('먼저 세부 항목을 체크해 주세요', 'err'); return; }
        skill = Math.min(5, Math.max(1, Math.round(avg)));
        $$('#f-skill [data-s]', m).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.s) === skill)));
        toast(`종합 실력을 ${skill}로 채웠습니다 (세부 평균 ${avg})`);
        return;
      }
      const sb = e.target.closest('#f-skill [data-s]');
      if (sb) { skill = Number(sb.dataset.s); $$('#f-skill [data-s]', m).forEach((b) => b.setAttribute('aria-pressed', String(b === sb))); return; }
      const gb = e.target.closest('#f-gender [data-g]');
      if (gb) {
        gender = gb.dataset.g || null;
        $$('#f-gender [data-g]', m).forEach((b) => b.setAttribute('aria-pressed', String(b === gb)));
        return;
      }
      const tb = e.target.closest('#f-team [data-tk]');
      if (tb) {
        team = tb.dataset.tk || null;
        $$('#f-team [data-tk]', m).forEach((b) => b.setAttribute('aria-pressed', String(b === tb)));
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
        if (await confirmDialog({ title: `${existing.name} 님을 삭제할까요?`, body: '출석 기록과 팀 배정에서도 제거됩니다.', ok: '삭제', danger: true })) {
          store.members.remove(existing.id);
          toast('삭제했습니다'); render();
        }
        return;
      }
      const name = $('#f-name', m).value.trim();
      if (!name) { toast('이름을 입력해 주세요', 'err'); return; }
      const birthRaw = $('#f-birth', m).value.trim();
      const birthYear = parseBirthYear(birthRaw);
      if (birthRaw && !birthYear) { toast('출생년도를 확인해 주세요 (예: 90 또는 1990)', 'err'); return; }
      const data = { name, skill, pos, team, birthYear, abil, gender, gk: $('#f-gk', m).getAttribute('aria-pressed') === 'true', active: $('#f-active', m).getAttribute('aria-pressed') === 'true' };
      if (existing) {
        const now = new Date().toISOString();
        if (existing.skill !== data.skill) { data.skillUpdatedAt = now; data.skillUpdatedBy = 'owner'; }
        if (JSON.stringify(existing.abil) !== JSON.stringify(data.abil)) { data.abilUpdatedAt = now; data.abilUpdatedBy = 'owner'; }
        store.members.update(existing.id, data);
        toast('수정했습니다');
      }
      else { store.members.add(data); toast(`${name} 님 추가`); }
      closeModal(); render();
    });
  });
}

function bulkModal() {
  let bteam = null;
  openModal(`
    <h3>회원 일괄 추가</h3>
    <div style="font-size:13px;color:var(--text-2);margin-bottom:10px;line-height:1.6">
      이름을 한 줄에 하나씩 붙여넣으세요. 이미 있는 이름은 건너뜁니다.<br>
      <b>이름 뒤에 출생년도·성별</b>을 붙이면 함께 저장됩니다 — 예: <code>홍길동 90</code>, <code>김철수,1988</code>, <code>이영희 92 여</code><br>
      실력은 기본 3, GK는 나중에 회원 수정에서 지정합니다.
    </div>
    <textarea id="f-bulk" rows="8" placeholder="홍길동 90&#10;김철수,1988&#10;이영희"></textarea>
    <div class="field" style="margin-top:12px"><label>소속 팀 (모두 같은 팀으로)</label>
      <div class="seg-wide" id="f-bteam">
        ${TEAM_KEYS.map((k) => `<button type="button" data-tk="${k}">${esc(store.club.teamName(k))}</button>`).join('')}
        <button type="button" data-tk="" aria-pressed="true">미배정</button>
      </div>
    </div>
    <div class="foot">
      <button class="btn ghost" data-act="cancel">취소</button>
      <button class="btn primary" data-act="save">추가</button>
    </div>`, (m) => {
    m.addEventListener('click', (e) => {
      const tb = e.target.closest('#f-bteam [data-tk]');
      if (tb) {
        bteam = tb.dataset.tk || null;
        $$('#f-bteam [data-tk]', m).forEach((b) => b.setAttribute('aria-pressed', String(b === tb)));
        return;
      }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'cancel') return closeModal();
      // 줄바꿈으로만 나눈다 (콤마는 "이름,출생년도" 구분자일 수 있어 store 에서 판단)
      const names = $('#f-bulk', m).value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      if (!names.length) { toast('이름이 없습니다', 'err'); return; }
      const added = store.members.bulkAdd(names, { team: bteam });
      closeModal();
      toast(`${added.length}명 추가 (중복 ${names.length - added.length}명 제외)`);
      render();
    });
  });
}

/* ---------- 명단 붙여넣기 (카톡 투표/댓글 → 출석 자동 체크) ---------- */
function rosterModal() {
  const g = store.matches.byId(ui.attendMatchId);
  if (!g) { toast('먼저 경기를 선택해 주세요', 'err'); return; }
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
      parsed = parseRoster(text);
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
            id = store.members.add({ name: r.input }).id;
            added += 1;
          }
          if (id) { map[id] = 'in'; inCount += 1; }
        }
        for (const r of outRows) if (r.memberId) map[r.memberId] = 'out';
        store.matches.setAttendanceBulk(g.id, map);
        ui.teamPlan = null;
        const outCount = Object.values(map).filter((v) => v === 'out').length;
        ui.rosterDone = { matchId: g.id, inCount, outCount, added };
        closeModal();
        render();
        toast(`참석 ${inCount}${added ? ` (신규 ${added})` : ''} · 불참 ${outCount}`);
      }
    });
  });
}

/* ---------- 팀 배분 ---------- */
/** 혼성팀 고정이 켜져 있으면 여성 참석자를 한 묶음(혼성팀이 든 묶음)에 고정한다 */
function womenLock(attendees, groups = null) {
  if (!store.club.lockWomen()) return {};
  const women = attendees.filter((m) => m.gender === '여');
  if (!women.length) return {};
  const mixed = store.club.mixedTeams();
  let idx = 0;
  if (groups && groups.length) {
    const found = groups.findIndex((grp) => grp.some((k) => mixed.includes(k)));
    idx = found >= 0 ? found : 0;
  }
  const lock = {};
  for (const w of women) lock[w.id] = idx;
  return lock;
}

/** 소속을 무시하고 참석자 전체를 새로 섞는다 (mode: shuffle) */
function doShuffleAll(reshuffle = false) {
  const g = store.matches.byId(ui.teamMatchId);
  if (!g) return;
  const attendees = store.matches.attendees(g.id);
  if (attendees.length < 2) { toast('참석자가 2명 이상이어야 합니다', 'err'); return; }
  const plan = currentPlan(g);
  const n = ui.groupCount || plan?.teams.length || suggestGroupCount(attendees.length, 4);
  const res = balanceTeams(attendees, n, { lock: womenLock(attendees) });
  applyPlan({
    matchId: g.id, mode: 'shuffle', groups: [],
    teams: res.teams.map((t) => t.map((p) => p.id)),
  });
  toast(reshuffle ? `다시 섞었습니다 (전력 차 ${res.spread})` : `소속 무시 ${n}팀 (전력 차 ${res.spread})`);
}

/** 지금 구성을 유지한 채 다시 섞기: merge 면 같은 제안 재적용, shuffle 이면 재배분 */
function doReshuffle() {
  const g = store.matches.byId(ui.teamMatchId);
  const plan = currentPlan(g);
  if (!plan) return;
  if (plan.mode === 'shuffle') return doShuffleAll(true);
  const att = store.matches.teamAttendance(g.id);
  const pool = {};
  for (const k of [...TEAM_KEYS, 'none']) if (att[k].length) pool[k] = att[k];
  const teams = plan.groups.map((grp) => grp.flatMap((k) => (pool[k] || []).map((m) => m.id)));
  applyPlan({ ...plan, teams });
  toast('소속 기준으로 되돌렸습니다');
}

function handleSwap(t, i) {
  const g = store.matches.byId(ui.teamMatchId);
  const plan = currentPlan(g);
  if (!plan) return;
  ui.teamPlan = plan;
  const teams = plan.teams;
  if (!ui.teamSel) { ui.teamSel = { t, i }; renderTeam(); return; }
  const a = ui.teamSel;
  if (a.t === t && a.i === i) { ui.teamSel = null; renderTeam(); return; }
  const tmp = teams[a.t][a.i];
  teams[a.t][a.i] = teams[t][i];
  teams[t][i] = tmp;
  ui.teamSel = null;
  renderTeam();
  toast('선수를 교체했습니다');
}

/* ---------- 팀 이미지 ---------- */
async function exportTeamsPNG() {
  const g = store.matches.byId(ui.teamMatchId);
  const plan = currentPlan(g);
  if (!plan?.teams?.length) { toast('먼저 팀을 나눠 주세요', 'err'); return; }
  const teams = plan.teams.map((ids) => ids.map((id) => store.members.byId(id)).filter(Boolean));
  const st = teams.map(groupStat);
  const labels = teams.map((_, i) => labelOf(plan, i));
  const colors = teams.map((_, i) => groupColor(plan.groups[i], i, plan.mode));
  const maxRows = Math.max(...teams.map((t) => t.length));
  const W = 1080;
  const headH = 210;
  const rowH = 62;
  const cardH = 92 + maxRows * rowH;
  const H = headH + teams.length * (cardH + 24) + 70;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#f7f4ee'; x.fillRect(0, 0, W, H);
  // 헤더
  x.fillStyle = '#14573a';
  roundRect(x, 40, 40, W - 80, 130, 26); x.fill();
  x.fillStyle = '#fff';
  x.font = '900 44px -apple-system, Malgun Gothic, sans-serif';
  x.fillText('웃을산 FC', 76, 100);
  x.font = '700 28px -apple-system, Malgun Gothic, sans-serif';
  x.fillStyle = 'rgba(255,255,255,.88)';
  x.fillText(`${fmtDate(g.date)} ${g.time || ''}${g.place ? ' · ' + g.place : ''}`, 76, 142);

  let y = headH;
  teams.forEach((t, i) => {
    x.fillStyle = '#fffdf9';
    roundRect(x, 40, y, W - 80, cardH, 22); x.fill();
    x.fillStyle = colors[i];
    roundRect(x, 40, y, W - 80, 66, 22); x.fill();
    x.fillStyle = '#fff';
    x.font = '900 32px -apple-system, Malgun Gothic, sans-serif';
    x.fillText(labels[i], 76, y + 44);
    x.font = '800 24px -apple-system, Malgun Gothic, sans-serif';
    const meta = `${t.length}명 · 전력 ${st[i].total} · 평균 ${st[i].avg}`;
    x.fillText(meta, W - 76 - x.measureText(meta).width, y + 43);
    t.forEach((p, j) => {
      const ry = y + 66 + 48 + j * rowH;
      x.fillStyle = '#241f1a';
      x.font = '700 30px -apple-system, Malgun Gothic, sans-serif';
      const label = `${j + 1}. ${p.name}${store.club.coachTeamOf(p.id) ? ' (감독)' : ''}`;
      x.fillText(label, 80, ry);
      if (p.gk) {
        x.fillStyle = colors[i];
        const w = x.measureText(label).width;
        roundRect(x, 92 + w, ry - 24, 52, 30, 8); x.fill();
        x.fillStyle = '#fff'; x.font = '900 18px -apple-system, sans-serif';
        x.fillText('GK', 104 + w, ry - 3);
      }
      x.fillStyle = '#9a9183';
      x.font = '800 26px -apple-system, Malgun Gothic, sans-serif';
      x.fillText('★'.repeat(p.skill), W - 80 - x.measureText('★'.repeat(p.skill)).width, ry);
    });
    y += cardH + 24;
  });
  x.fillStyle = '#9a9183';
  x.font = '600 22px -apple-system, Malgun Gothic, sans-serif';
  x.fillText(`웃을산 FC 앱 ${APP_VERSION}`, 44, H - 26);

  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const file = new File([blob], `웃을산FC_${g.date}_팀.png`, { type: 'image/png' });
  await shareOrDownload(file, blob);
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
  toast('JSON을 내보냈습니다');
}

async function importJSONFile(file) {
  const text = await file.text();
  const merge = await confirmDialog({
    title: '가져오기 방식',
    body: '<b>합치기</b>는 지금 데이터에 없는 회원·경기만 추가합니다.<br><b>덮어쓰기</b>는 현재 데이터를 모두 지우고 파일 내용으로 교체합니다.',
    ok: '합치기',
  });
  try {
    const r = await store.importJSON(text, { merge });
    toast(`가져오기 완료 · 회원 ${r.members}명 / 경기 ${r.matches}건`);
    ui.teamPlan = null;
    render();
  } catch (e) {
    toast(e.message || '가져오기 실패', 'err');
  }
}

/* ================= 이벤트 ================= */
function bindEvents() {
  $('.tabbar').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) switchTab(b.dataset.tab);
  });

  document.addEventListener('click', async (e) => {
    const t = e.target;

    const go = t.closest('[data-go]');
    if (go) {
      const mid = go.dataset.match;
      if (mid) { ui.attendMatchId = mid; ui.teamMatchId = mid; renderAttend(); renderTeam(); }
      switchTab(go.dataset.go);
      return;
    }
    if (t.closest('#btn-new-match, #btn-new-match-2')) return matchModal(null);
    const em = t.closest('[data-edit-match]');
    if (em) return matchModal(store.matches.byId(em.dataset.editMatch));
    const om = t.closest('[data-open-match]');
    if (om) {
      ui.attendMatchId = om.dataset.openMatch; ui.teamMatchId = om.dataset.openMatch;
      renderAttend(); renderTeam(); switchTab('attend');
      return;
    }

    // 출석
    const segb = t.closest('.seg [data-v]');
    if (segb) {
      const seg = segb.closest('.seg');
      const memberId = seg.dataset.member;
      const cur = store.matches.byId(ui.attendMatchId)?.attendance[memberId];
      const v = segb.dataset.v;
      const next = cur === v ? null : v;
      store.matches.setAttendance(ui.attendMatchId, memberId, next);
      if (ui.teamPlan?.matchId === ui.attendMatchId) ui.teamPlan = null;
      // 전체 다시 그리면 스크롤이 튀므로 해당 줄 + 상단 카운트만 갱신
      $$('[data-v]', seg).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === next)));
      updateAttendCounts();
      return;
    }
    if (t.closest('#btn-roster')) return rosterModal();
    if (t.closest('#btn-lock-women')) {
      const on = store.club.lockWomen();
      store.club.setLockWomen(!on);
      ui.teamPlan = null;
      toast(!on ? '여성 회원을 혼성팀에 고정합니다' : '성별 고정을 껐습니다');
      return renderTeam();
    }
    const all = t.closest('[data-att-all]');
    if (all) {
      const g = store.matches.byId(ui.attendMatchId);
      if (all.dataset.attAll === 'in') {
        const map = {};
        for (const m of store.members.active()) map[m.id] = 'in';
        store.matches.setAttendanceBulk(g.id, map);
        toast('전원 참석으로 표시했습니다');
      } else {
        if (!await confirmDialog({ title: '출석을 초기화할까요?', body: '이 경기의 참석/불참 표시가 모두 지워집니다.', ok: '초기화', danger: true })) return;
        store.matches.setAttendanceBulk(g.id, {});
        toast('초기화했습니다');
      }
      ui.teamPlan = null;
      renderAttend(); renderTeam(); renderHome();
      return;
    }

    // 팀
    const gc = t.closest('#group-count [data-gc]');
    if (gc) {
      ui.groupCount = Number(gc.dataset.gc);
      ui.teamPlan = null;      // 팀 수가 바뀌면 구성은 다시 고른다
      renderTeam();
      return;
    }
    const ad = t.closest('[data-adopt]');
    if (ad) return adoptSuggestion(Number(ad.dataset.adopt));
    if (t.closest('#btn-shuffle-all')) return doShuffleAll(false);
    if (t.closest('#btn-reshuffle')) return doReshuffle();
    if (t.closest('#btn-team-names, #btn-team-names-2')) return teamNameModal();
    const sw = t.closest('[data-swap]');
    if (sw) {
      const [a, b] = sw.dataset.swap.split(':').map(Number);
      return handleSwap(a, b);
    }
    if (t.closest('#btn-save-teams')) {
      const g = store.matches.byId(ui.teamMatchId);
      const plan = currentPlan(g);
      if (!plan) { toast('먼저 팀을 만들어 주세요', 'err'); return; }
      store.matches.setTeams(g.id, plan.teams, plan.teams.length, { mode: plan.mode, groups: plan.groups, labels: plan.labels || [] });
      store.matches.update(g.id, { status: g.status === '예정' ? '확정' : g.status });
      ui.teamPlan = null;
      toast('팀을 확정 저장했습니다');
      render();
      return;
    }
    if (t.closest('#btn-team-png')) return exportTeamsPNG();

    // AI
    if (t.closest('#btn-ai-coach')) return aiTeamCoach();
    if (t.closest('#btn-ai-apply')) return applyAIPlan();
    if (t.closest('#btn-ai-ask, #btn-ai-ask-2')) return aiAskModal();
    const aiN = t.closest('#btn-ai-notice');
    if (aiN) return aiNoticeModal(aiN.dataset.match);
    const aiR = t.closest('[data-ai-review]');
    if (aiR) return aiNoticeModal(aiR.dataset.aiReview);
    if (t.closest('#btn-ai-key-save')) {
      const v = $('#f-ai-key')?.value.trim();
      if (!v) { toast('키를 입력해 주세요', 'err'); return; }
      if (!/^sk-ant-/.test(v)) { toast('sk-ant- 로 시작하는 키여야 합니다', 'err'); return; }
      AI.saveSettings({ key: v });
      toast('API 키를 저장했습니다 (이 기기에만)');
      renderMembers();
      return;
    }
    if (t.closest('#btn-ai-key-del')) {
      if (!await confirmDialog({ title: 'API 키를 삭제할까요?', body: 'AI 기능이 꺼집니다. 언제든 다시 입력할 수 있습니다.', ok: '삭제', danger: true })) return;
      AI.clearKey();
      toast('키를 삭제했습니다');
      renderMembers();
      return;
    }
    const aiM = t.closest('#f-ai-model [data-model]');
    if (aiM) {
      AI.saveSettings({ model: aiM.dataset.model });
      $$('#f-ai-model [data-model]').forEach((b) => b.setAttribute('aria-pressed', String(b === aiM)));
      toast('모델을 바꿨습니다');
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
      catch (e) { toast('복사할 수 없는 브라우저입니다', 'err'); }
      return;
    }
    const sh = t.closest('[data-share]');
    if (sh) {
      const el = document.getElementById(sh.dataset.share);
      const text = el ? el.innerText : '';
      try {
        if (navigator.share) { await navigator.share({ text }); }
        else { await navigator.clipboard.writeText(text); toast('복사했습니다'); }
      } catch (e) { if (e?.name !== 'AbortError') toast('공유할 수 없습니다', 'err'); }
      return;
    }

    // 회원
    if (t.closest('#btn-add-member')) return memberModal(null);
    if (t.closest('#btn-bulk-member')) return bulkModal();
    if (t.closest('#btn-toggle-inactive')) { ui.showInactive = !ui.showInactive; return renderMembers(); }
    if (t.closest('#btn-coach-mode')) { ui.coachMode = true; ui.coachOpen = null; return renderMembers(); }
    if (t.closest('#btn-coach-exit')) { ui.coachMode = false; return renderMembers(); }
    if (t.closest('#btn-team-names-3')) return teamNameModal();
    const ct = t.closest('#coach-team [data-ct]');
    if (ct) { ui.coachTeam = ct.dataset.ct; ui.coachOpen = null; return renderMembers(); }
    const copen = t.closest('[data-copen]');
    if (copen) { ui.coachOpen = ui.coachOpen === copen.dataset.copen ? null : copen.dataset.copen; return renderMembers(); }
    const sdot = t.closest('[data-skill] .dot');
    if (sdot) {
      const id = sdot.closest('[data-skill]').dataset.skill;
      const v = Number(sdot.dataset.v);
      store.members.setSkill(id, v, 'owner');
      const row = sdot.closest('.crow');
      $$('[data-skill] .dot', row).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.v) <= v)));
      const meta = $('.who .meta', row);
      if (meta) meta.innerHTML = meta.innerHTML.replace(/· (미평가|[^·]*(운영자|감독)[^·]*)$/, `· ${fmtWhen(new Date().toISOString())} 운영자`);
      ui.teamPlan = null;
      return;
    }
    const cab = t.closest('[data-cabil] .dot, [data-cabil] .clr');
    if (cab) {
      const [id, akey] = cab.closest('[data-cabil]').dataset.cabil.split(':');
      const v = Number(cab.dataset.v);
      const cur = store.members.byId(id)?.abil?.[akey] ?? null;
      const next = v === 0 || cur === v ? null : v;
      store.members.setAbil(id, { [akey]: next }, 'owner');
      const row = cab.closest('[data-cabil]');
      $$('.dot', row).forEach((b) => b.setAttribute('aria-pressed', String(next != null && Number(b.dataset.v) <= next)));
      return;
    }
    if (t.closest('#btn-sort')) { ui.memberSort = ui.memberSort === 'age' ? 'name' : 'age'; return renderMembers(); }
    const mt = t.closest('.teamfilter [data-mt]');
    if (mt) { ui.memberTeam = mt.dataset.mt; return renderMembers(); }
    const me = t.closest('[data-member-edit]');
    if (me) return memberModal(store.members.byId(me.dataset.memberEdit));

    // 설정
    if (t.closest('#btn-export')) return exportJSON();
    if (t.closest('#btn-import')) return $('#file-import').click();
    if (t.closest('#btn-reset')) {
      if (!await confirmDialog({ title: '전체 데이터를 지울까요?', body: '회원·경기·출석·전술이 모두 삭제됩니다. 되돌릴 수 없습니다.', ok: '다음', danger: true })) return;
      if (!await confirmDialog({ title: '정말 삭제합니다', body: '먼저 JSON 내보내기로 백업했는지 확인하세요.', ok: '삭제', danger: true })) return;
      await store.resetAll();
      ui.teamPlan = null; ui.attendMatchId = null; ui.teamMatchId = null;
      toast('초기화했습니다');
      render();
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'att-match') { ui.attendMatchId = e.target.value; renderAttend(); }
    if (e.target.id === 'team-match') { ui.teamMatchId = e.target.value; ui.teamPlan = null; ui.groupCount = null; ui.teamSel = null; renderTeam(); }
    if (e.target.id === 'file-import' && e.target.files[0]) { importJSONFile(e.target.files[0]); e.target.value = ''; }
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
      renderMembers();
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
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) nw.postMessage({ type: 'SKIP_WAITING' });
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

/* ================= 시작 ================= */
async function main() {
  $('#brand-logo').innerHTML = LOGO;
  $$('.tabbar button').forEach((b) => { $('.ico', b).innerHTML = ICON[b.dataset.icon]; });
  await store.init();
  bindEvents();
  render();
  applyHash();
  registerSW();
  window.addEventListener('beforeunload', () => store.flush());
  // 전술 모듈(2단계)
  import('./tactics.js')
    .then((mod) => mod.initTactics({ store, ui, switchTab, toast, esc, openModal, closeModal, confirmDialog,
      shareOrDownload, fmtDate, TEAM_KEYS, TEAM_COLORS, APP_VERSION, groupLabel, groupColor, currentPlan,
      labelOf, AI, aiRun, aiSkeleton, aiCostLine, aiKeyNotice }))
    .catch((e) => {
      console.warn('[tactics] 준비 중', e);
      const v = $('#view-tactics');
      if (v) v.innerHTML = '<div class="empty"><div class="big">전술판 준비 중</div><div>다음 업데이트에서 열립니다.</div></div>';
    });
}

window.__fc_hasAIKey = () => AI.hasKey();
window.__fc = { store, ui, render, balanceTeams, suggestMerges, switchTab, adoptSuggestion, doShuffleAll,
  rosterModal, parseRoster, matchNames, womenLock,
  APP_VERSION, TEAM_KEYS, AI, aiTeamCoach, applyAIPlan, aiNoticeModal, aiAskModal, aiState };
main();
