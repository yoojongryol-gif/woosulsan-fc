/* 웃을산 FC — 앱 본체 */
import { createStore, LocalStorageAdapter, uid } from './store.js';
import { balanceTeams, suggestTeamCount, statsOf, spreadOf } from './balance.js';

export const APP_VERSION = 'v0.1.0';
const TEAM_NAMES = ['A팀', 'B팀', 'C팀'];
const TEAM_COLORS = ['#1f7a4d', '#2f5fa8', '#b4552a'];

const store = createStore(new LocalStorageAdapter());
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ui = {
  tab: 'home',
  attendMatchId: null,
  teamMatchId: null,
  teamDraft: null,      // [[memberId,...], ...]
  teamSel: null,        // {t, i} 스왑 선택
  memberQuery: '',
  showInactive: false,
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
  ball: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="m12 7 4 2.8-1.5 4.7h-5L8 9.8 12 7z" fill="currentColor" stroke="none" opacity=".3"/><path d="M12 3v4M3.6 9.6 8 9.8M20.4 9.6 16 9.8M6.5 19.6 9.5 14.5M17.5 19.6 14.5 14.5"/></svg>',
};

const LOGO = `<svg class="mark" viewBox="0 0 48 48" aria-hidden="true">
  <rect width="48" height="48" rx="13" fill="url(#lg)"/>
  <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a9a63"/><stop offset="1" stop-color="#14573a"/></linearGradient></defs>
  <circle cx="24" cy="24" r="11" fill="none" stroke="#fff" stroke-width="2" opacity=".55"/>
  <path d="M24 15.5 31 20.6l-2.7 8.2h-8.6L17 20.6 24 15.5Z" fill="#fff"/>
</svg>`;

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
        <span class="pill">${next.teamCount}팀</span>
        <span class="pill">${esc(next.status)}</span>
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

  root.innerHTML = `
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
      <div class="sub">${stars(m.skill)} ${m.gk ? '<span class="chip gk">GK</span>' : ''} ${st.rate != null ? `출석률 ${st.rate}%` : ''}</div>
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
function renderTeam() {
  const root = $('#view-team');
  const matches = store.matches.sorted();
  if (!matches.length) { root.innerHTML = emptyMatches('팀을 나누려면 경기가 필요합니다.'); return; }
  if (!ui.teamMatchId || !store.matches.byId(ui.teamMatchId)) {
    ui.teamMatchId = (store.matches.upcoming()[0] || matches[0]).id;
  }
  const g = store.matches.byId(ui.teamMatchId);
  const attendees = store.matches.attendees(g.id);
  const sug = suggestTeamCount(attendees.length);

  let html = `
    <div class="selectrow"><select id="team-match">${matchOptions(matches, g.id)}</select></div>
    <div class="card flat" style="padding:12px">
      <div class="row" style="align-items:center;margin-bottom:10px">
        <div style="font-weight:800">참석 ${attendees.length}명</div>
        <div class="spacer" style="flex:1"></div>
        <div style="font-size:12px;color:var(--text-3);font-weight:700">권장 ${sug}팀</div>
      </div>
      <div class="seg-wide" id="team-count">
        <button data-tc="2" aria-pressed="${g.teamCount === 2}">2팀</button>
        <button data-tc="3" aria-pressed="${g.teamCount === 3}">3팀</button>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn primary grow" id="btn-balance">${ICON.shuffle} 자동 팀 나누기</button>
      </div>
    </div>`;

  if (attendees.length < 2) {
    html += `<div class="empty"><div class="big">참석자가 부족합니다</div>
      <div>출석 탭에서 참석자를 먼저 체크해 주세요.</div>
      <button class="btn" style="margin-top:14px" data-go="attend" data-match="${g.id}">출석 탭으로</button></div>`;
    root.innerHTML = html;
    return;
  }

  const draft = ui.teamDraft && ui.teamDraft.matchId === g.id ? ui.teamDraft.teams
    : (g.teams && g.teams.length ? g.teams : null);

  if (!draft) {
    html += `<div class="empty"><div class="big">아직 팀을 나누지 않았습니다</div>
      <div>위 버튼을 누르면 실력·GK·인원을 맞춰 자동으로 나눕니다.</div></div>`;
  } else {
    const teams = draft.map((ids) => ids.map((id) => store.members.byId(id)).filter(Boolean));
    const st = statsOf(teams);
    const sp = spreadOf(teams);
    html += `<div class="section-title">팀 구성 <span class="right">전력 차 ${sp}</span></div>`;
    html += teams.map((t, i) => `
      <div class="team-card" data-t="${i}">
        <div class="hd">
          <span class="t">${TEAM_NAMES[i]}</span>
          <span class="r">${t.length}명 · 전력 ${st[i].total} · 평균 ${st[i].avg}${st[i].gk ? ' · GK ' + st[i].gk : ''}</span>
        </div>
        <div class="bd">
          ${t.map((p, j) => `<button class="pcard${ui.teamSel && ui.teamSel.t === i && ui.teamSel.i === j ? ' sel' : ''}" data-swap="${i}:${j}">
            ${p.gk ? '<span class="gkb">GK</span>' : ''}
            <span class="n">${esc(p.name)}</span><span class="sk">${p.skill}</span>
          </button>`).join('')}
        </div>
      </div>`).join('');
    if (st.some((s) => s.gk === 0)) {
      html += `<div class="card flat" style="padding:10px 12px"><span class="chip warn">GK 없는 팀 있음</span>
        <span style="font-size:12.5px;color:var(--text-2);margin-left:6px">회원 탭에서 GK를 지정하면 팀당 1명씩 나눠 배치됩니다.</span></div>`;
    }
    html += `<div class="row wrap" style="margin-top:4px">
      <button class="btn grow" id="btn-reshuffle">${ICON.shuffle} 다시 섞기</button>
      <button class="btn grow primary" id="btn-save-teams">팀 확정 저장</button>
    </div>
    <div class="row" style="margin-top:8px">
      <button class="btn block grow" id="btn-team-png">${ICON.image} 공유용 이미지 저장</button>
    </div>
    <div class="swap-hint">${ui.teamSel ? '바꿀 상대 선수를 탭하세요' : '선수 카드를 탭 → 다른 선수 탭 = 자리 교체'}</div>`;
  }
  root.innerHTML = html;
}

/* ---------- 회원 ---------- */
function renderMembers() {
  const root = $('#view-members');
  const all = store.members.all();
  const q = ui.memberQuery.trim();
  const list = all
    .filter((m) => (ui.showInactive ? true : m.active))
    .filter((m) => !q || m.name.includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  let html = `
    <div class="row" style="margin-bottom:10px">
      <button class="btn primary grow" id="btn-add-member">${ICON.plus} 회원 추가</button>
      <button class="btn grow" id="btn-bulk-member">일괄 추가</button>
    </div>
    <div class="search-wrap">${ICON.search}<input id="member-q" type="search" placeholder="이름 검색" value="${esc(q)}"></div>
    <div class="section-title">회원 <span class="count">${list.length}${all.length !== list.length ? ` / ${all.length}` : ''}</span>
      <button class="btn sm ghost right" id="btn-toggle-inactive">${ui.showInactive ? '활동 회원만' : '비활동 포함'}</button>
    </div>`;

  if (!list.length) {
    html += `<div class="empty">${ICON.member}<div class="big">${all.length ? '검색 결과가 없습니다' : '회원이 없습니다'}</div>
      <div>${all.length ? '다른 이름으로 검색해 보세요.' : '"일괄 추가"로 이름을 줄바꿈으로 붙여넣으면 한 번에 등록됩니다.'}</div></div>`;
  } else {
    html += list.map((m) => {
      const st = store.stats.attendance(m.id);
      return `<button class="mem-item${m.active ? '' : ' off'}" data-member-edit="${m.id}">
        <div class="avatar">${esc(initial(m.name))}</div>
        <div class="nm"><b>${esc(m.name)}${m.active ? '' : ' <span class="chip">비활동</span>'}</b>
          <div class="sub">${stars(m.skill)} <span class="chip pos">${esc(m.pos)}</span>${m.gk ? '<span class="chip gk">GK</span>' : ''}</div>
        </div>
        <div class="rate">${st.rate != null ? st.rate + '%' : '–'}<small>${st.present}/${st.total}회</small></div>
      </button>`;
    }).join('');
  }

  html += `
    <div class="section-title">설정 · 백업</div>
    <div class="card">
      <div class="row" style="margin-bottom:8px">
        <button class="btn grow" id="btn-export">JSON 내보내기</button>
        <button class="btn grow" id="btn-import">JSON 가져오기</button>
      </div>
      <input type="file" id="file-import" accept="application/json,.json" class="hidden">
      <div style="font-size:12.5px;color:var(--text-2);line-height:1.6">
        데이터는 이 기기(브라우저)에만 저장됩니다. 기기를 바꾸거나 백업하려면 JSON으로 내보내 두세요.
      </div>
      <button class="btn danger block" id="btn-reset" style="margin-top:12px">전체 데이터 초기화</button>
    </div>
    <div class="footer-note">웃을산 FC · ${APP_VERSION} · <span id="sw-state">로컬 저장</span></div>`;

  root.innerHTML = html;
}

/* ================= 동작 ================= */
function switchTab(tab, { push = true } = {}) {
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
  const m0 = existing || { name: '', skill: 3, gk: false, pos: 'MF', active: true };
  openModal(`
    <h3>${existing ? '회원 수정' : '회원 추가'}</h3>
    <div class="field"><label>이름</label><input type="text" id="f-name" value="${esc(m0.name)}" placeholder="이름" autocomplete="off"></div>
    <div class="field"><label>실력 (1~5)</label>
      <div class="skillpick" id="f-skill">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-s="${n}" aria-pressed="${m0.skill === n}">${n}</button>`).join('')}</div>
    </div>
    <div class="field"><label>선호 포지션</label>
      <div class="seg-wide" id="f-pos">${['FW', 'MF', 'DF', 'GK'].map((p) => `<button type="button" data-p="${p}" aria-pressed="${m0.pos === p}">${p}</button>`).join('')}</div>
    </div>
    <div class="togglerow"><label for="f-gk">골키퍼 가능</label><button type="button" class="switch" id="f-gk" aria-pressed="${!!m0.gk}"></button></div>
    <div class="togglerow"><label for="f-active">활동 중</label><button type="button" class="switch" id="f-active" aria-pressed="${m0.active !== false}"></button></div>
    <div class="foot">
      ${existing ? '<button class="btn danger" data-act="del">삭제</button>' : ''}
      <button class="btn ghost" data-act="cancel">취소</button>
      <button class="btn primary" data-act="save">저장</button>
    </div>`, (m) => {
    let skill = m0.skill; let pos = m0.pos;
    m.addEventListener('click', async (e) => {
      const sb = e.target.closest('#f-skill [data-s]');
      if (sb) { skill = Number(sb.dataset.s); $$('#f-skill [data-s]', m).forEach((b) => b.setAttribute('aria-pressed', String(b === sb))); return; }
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
      const data = { name, skill, pos, gk: $('#f-gk', m).getAttribute('aria-pressed') === 'true', active: $('#f-active', m).getAttribute('aria-pressed') === 'true' };
      if (existing) { store.members.update(existing.id, data); toast('수정했습니다'); }
      else { store.members.add(data); toast(`${name} 님 추가`); }
      closeModal(); render();
    });
  });
}

function bulkModal() {
  openModal(`
    <h3>회원 일괄 추가</h3>
    <div style="font-size:13px;color:var(--text-2);margin-bottom:10px;line-height:1.6">
      이름을 한 줄에 하나씩 붙여넣으세요. 이미 있는 이름은 건너뜁니다.<br>실력은 기본 3, GK는 나중에 회원 수정에서 지정합니다.
    </div>
    <textarea id="f-bulk" rows="9" placeholder="홍길동&#10;김철수&#10;이영희"></textarea>
    <div class="foot">
      <button class="btn ghost" data-act="cancel">취소</button>
      <button class="btn primary" data-act="save">추가</button>
    </div>`, (m) => {
    m.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'cancel') return closeModal();
      const names = $('#f-bulk', m).value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
      if (!names.length) { toast('이름이 없습니다', 'err'); return; }
      const added = store.members.bulkAdd(names);
      closeModal();
      toast(`${added.length}명 추가 (중복 ${names.length - added.length}명 제외)`);
      render();
    });
  });
}

/* ---------- 팀 배분 ---------- */
function doBalance(reshuffle = false) {
  const g = store.matches.byId(ui.teamMatchId);
  if (!g) return;
  const attendees = store.matches.attendees(g.id);
  if (attendees.length < 2) { toast('참석자가 2명 이상이어야 합니다', 'err'); return; }
  const res = balanceTeams(attendees, g.teamCount, {});
  ui.teamDraft = { matchId: g.id, teams: res.teams.map((t) => t.map((p) => p.id)) };
  ui.teamSel = null;
  renderTeam();
  toast(reshuffle ? `다시 섞었습니다 (전력 차 ${res.spread})` : `${g.teamCount}팀 배분 완료 (전력 차 ${res.spread})`);
}

function handleSwap(t, i) {
  if (!ui.teamDraft) return;
  const teams = ui.teamDraft.teams;
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
  const draft = ui.teamDraft?.matchId === g.id ? ui.teamDraft.teams : g.teams;
  if (!draft?.length) { toast('먼저 팀을 나눠 주세요', 'err'); return; }
  const teams = draft.map((ids) => ids.map((id) => store.members.byId(id)).filter(Boolean));
  const st = statsOf(teams);
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
    x.fillStyle = TEAM_COLORS[i];
    roundRect(x, 40, y, W - 80, 66, 22); x.fill();
    x.fillStyle = '#fff';
    x.font = '900 32px -apple-system, Malgun Gothic, sans-serif';
    x.fillText(TEAM_NAMES[i], 76, y + 44);
    x.font = '800 24px -apple-system, Malgun Gothic, sans-serif';
    const meta = `${t.length}명 · 전력 ${st[i].total} · 평균 ${st[i].avg}`;
    x.fillText(meta, W - 76 - x.measureText(meta).width, y + 43);
    t.forEach((p, j) => {
      const ry = y + 66 + 48 + j * rowH;
      x.fillStyle = '#241f1a';
      x.font = '700 30px -apple-system, Malgun Gothic, sans-serif';
      x.fillText(`${j + 1}. ${p.name}`, 80, ry);
      if (p.gk) {
        x.fillStyle = TEAM_COLORS[i];
        const w = x.measureText(`${j + 1}. ${p.name}`).width;
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
      return;
    }
  } catch (e) { /* 공유 취소 → 다운로드로 */ }
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
    ui.teamDraft = null;
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
      ui.teamDraft = null;
      // 전체 다시 그리면 스크롤이 튀므로 해당 줄 + 상단 카운트만 갱신
      $$('[data-v]', seg).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === next)));
      updateAttendCounts();
      return;
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
      ui.teamDraft = null;
      renderAttend(); renderTeam(); renderHome();
      return;
    }

    // 팀
    const tc = t.closest('#team-count [data-tc]');
    if (tc) {
      store.matches.update(ui.teamMatchId, { teamCount: Number(tc.dataset.tc) });
      ui.teamDraft = null;
      renderTeam();
      return;
    }
    if (t.closest('#btn-balance')) return doBalance(false);
    if (t.closest('#btn-reshuffle')) return doBalance(true);
    const sw = t.closest('[data-swap]');
    if (sw) {
      const [a, b] = sw.dataset.swap.split(':').map(Number);
      return handleSwap(a, b);
    }
    if (t.closest('#btn-save-teams')) {
      const g = store.matches.byId(ui.teamMatchId);
      store.matches.setTeams(g.id, ui.teamDraft?.teams || g.teams, g.teamCount);
      store.matches.update(g.id, { status: g.status === '예정' ? '확정' : g.status });
      toast('팀을 확정 저장했습니다');
      render();
      return;
    }
    if (t.closest('#btn-team-png')) return exportTeamsPNG();

    // 회원
    if (t.closest('#btn-add-member')) return memberModal(null);
    if (t.closest('#btn-bulk-member')) return bulkModal();
    if (t.closest('#btn-toggle-inactive')) { ui.showInactive = !ui.showInactive; return renderMembers(); }
    const me = t.closest('[data-member-edit]');
    if (me) return memberModal(store.members.byId(me.dataset.memberEdit));

    // 설정
    if (t.closest('#btn-export')) return exportJSON();
    if (t.closest('#btn-import')) return $('#file-import').click();
    if (t.closest('#btn-reset')) {
      if (!await confirmDialog({ title: '전체 데이터를 지울까요?', body: '회원·경기·출석·전술이 모두 삭제됩니다. 되돌릴 수 없습니다.', ok: '다음', danger: true })) return;
      if (!await confirmDialog({ title: '정말 삭제합니다', body: '먼저 JSON 내보내기로 백업했는지 확인하세요.', ok: '삭제', danger: true })) return;
      await store.resetAll();
      ui.teamDraft = null; ui.attendMatchId = null; ui.teamMatchId = null;
      toast('초기화했습니다');
      render();
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'att-match') { ui.attendMatchId = e.target.value; renderAttend(); }
    if (e.target.id === 'team-match') { ui.teamMatchId = e.target.value; ui.teamDraft = null; ui.teamSel = null; renderTeam(); }
    if (e.target.id === 'file-import' && e.target.files[0]) { importJSONFile(e.target.files[0]); e.target.value = ''; }
  });

  document.addEventListener('input', (e) => {
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
    .then((mod) => mod.initTactics({ store, ui, switchTab, toast, esc, openModal, closeModal, confirmDialog, shareOrDownload, fmtDate, TEAM_NAMES, TEAM_COLORS, APP_VERSION }))
    .catch((e) => {
      console.warn('[tactics] 준비 중', e);
      const v = $('#view-tactics');
      if (v) v.innerHTML = '<div class="empty"><div class="big">전술판 준비 중</div><div>다음 업데이트에서 열립니다.</div></div>';
    });
}

window.__fc = { store, ui, render, balanceTeams, switchTab, APP_VERSION };
main();
