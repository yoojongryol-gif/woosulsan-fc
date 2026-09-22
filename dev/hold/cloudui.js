/* 웃을산 FC — 클라우드 모드 UI + 스토어 브리지
 *  - makeCloudStore(cloud): 화면 코드가 쓰던 store.js 와 "같은 모양" 의 객체를 클라우드 상태로 제공
 *  - initCloudUI(ctx): 로그인 화면, 역할 표시, 초대 링크, 승인함, 이관 마법사
 * 화면(app.js)은 로컬/클라우드를 구분하지 않고 같은 API 를 쓴다.
 */
import { TEAM_KEYS, roleOf, canEditMember } from './cloud.js';

const ROLE_LABEL = { owner: '운영자', coach: '팀 책임자', member: '회원', pending: '승인 대기', guest: '손님' };

/* ================= 스토어 브리지 ================= */
export function makeCloudStore(cloud, { onError } = {}) {
  const listeners = new Set();
  let mirror = blank();

  function blank() {
    return {
      schema: 2,
      club: { name: '웃을산 FC', teamNames: { A: 'A팀', B: 'B팀', C: 'C팀', D: 'D팀' }, mixedTeams: [], lockWomen: true, coaches: { A: null, B: null, C: null, D: null } },
      members: [], matches: [], tactics: [], updatedAt: new Date().toISOString(),
    };
  }

  /** 클라우드 문서 모양 → 앱이 쓰던 로컬 모양 */
  function project(s) {
    const teams = s.club?.teams || {};
    const memberByUid = (uid) => s.members.find((m) => m.memberUid === uid);
    return {
      schema: 2,
      club: {
        name: s.club?.name || '웃을산 FC',
        teamNames: Object.fromEntries(TEAM_KEYS.map((k) => [k, teams[k]?.name || `${k}팀`])),
        mixedTeams: TEAM_KEYS.filter((k) => teams[k]?.mixed),
        lockWomen: s.club?.lockWomen !== false,
        // 화면의 "감독" 표시는 coachUid → 연결된 회원 id 로 환산 (없으면 이름 메모로 추정)
        coaches: Object.fromEntries(TEAM_KEYS.map((k) => {
          const uid = teams[k]?.coachUid;
          const m = uid ? memberByUid(uid) : null;
          const byName = !m && s.club?.coachNames?.[k]
            ? s.members.find((x) => x.name === s.club.coachNames[k]) : null;
          return [k, m?.id || byName?.id || null];
        })),
      },
      members: s.members.map((m) => ({
        id: m.id, name: m.name, skill: m.skill ?? 3, gk: !!m.gk, pos: m.pos || 'MF',
        team: m.team || null, birthYear: m.birthYear || null, gender: m.gender || null,
        abil: m.abil || { speed: null, stamina: null, basic: null, shoot: null, defense: null, physical: null },
        active: m.active !== false,
        skillUpdatedAt: m.skillUpdatedAt || null, skillUpdatedBy: m.skillUpdatedBy || null,
        abilUpdatedAt: m.abilUpdatedAt || null, abilUpdatedBy: m.abilUpdatedBy || null,
        memberUid: m.memberUid || null, pendingUid: m.pendingUid || null,
        createdAt: m.createdAt || null,
      })),
      matches: s.matches.map((g) => ({
        id: g.id, date: g.date, time: g.time || '20:00', place: g.place || '',
        status: g.status || '예정', teamCount: g.teamCount || 2,
        teams: g.teams || [], teamPlan: g.teamPlan || null,
        attendance: s.attendance[g.id] || {},
        createdAt: g.createdAt || null,
      })).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)),
      tactics: s.tactics || [],
      updatedAt: new Date().toISOString(),
    };
  }

  cloud.subscribe((s) => {
    mirror = project(s);
    for (const fn of listeners) { try { fn(mirror); } catch (e) { console.error(e); } }
  });
  mirror = project(cloud.state());

  const fail = (e) => { onError?.(e); throw e; };
  const run = (p) => p.catch((e) => { onError?.(e); });

  const api = {
    cloud: true,
    async init() { return mirror; },
    get() { return mirror; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async flush() { return true; },

    members: {
      all() { return mirror.members; },
      active() { return mirror.members.filter((m) => m.active); },
      byId(id) { return mirror.members.find((m) => m.id === id) || null; },
      byTeam(k) { return mirror.members.filter((m) => m.active && m.team === k); },
      unassigned() { return mirror.members.filter((m) => m.active && !m.team); },
      add(data) {
        const tmp = { id: 'tmp_' + Math.random().toString(36).slice(2, 8), ...data };
        run(cloud.addMember(data));
        return tmp;
      },
      bulkAdd(names, defaults = {}) {
        const { parseMemberLine } = api._helpers;
        const added = [];
        const seen = new Set(mirror.members.map((m) => m.name));
        for (const raw of names) {
          const p = parseMemberLine(raw);
          if (!p?.name || seen.has(p.name)) continue;
          seen.add(p.name);
          const data = { ...defaults, name: p.name, birthYear: p.birthYear ?? null, gender: p.gender ?? null };
          run(cloud.addMember(data));
          added.push({ id: 'tmp_' + added.length, ...data });
        }
        return added;
      },
      update(id, patch) { run(cloud.updateMember(id, patch)); return api.members.byId(id); },
      remove(id) { run(cloud.removeMember(id)); },
      setSkill(id, skill, by) {
        run(cloud.updateMember(id, { skill, skillUpdatedAt: new Date().toISOString(), skillUpdatedBy: by || cloud.role().role }));
        return api.members.byId(id);
      },
      setAbil(id, abil, by) {
        const cur = api.members.byId(id)?.abil || {};
        run(cloud.updateMember(id, { abil: { ...cur, ...abil }, abilUpdatedAt: new Date().toISOString(), abilUpdatedBy: by || cloud.role().role }));
        return api.members.byId(id);
      },
    },

    matches: {
      all() { return mirror.matches; },
      byId(id) { return mirror.matches.find((g) => g.id === id) || null; },
      sorted() { return mirror.matches; },
      upcoming() {
        const today = new Date().toISOString().slice(0, 10);
        return mirror.matches.filter((g) => g.date >= today && g.status !== '종료')
          .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      },
      add(data) { run(cloud.addMatch(data)); return { id: 'tmp_g', ...data, attendance: {} }; },
      update(id, patch) { run(cloud.updateMatch(id, patch)); return api.matches.byId(id); },
      remove(id) { run(cloud.updateMatch(id, { deleted: true })); },
      setAttendance(matchId, memberId, status) {
        run(cloud.setAttendance(matchId, memberId, status));
        return api.matches.byId(matchId);
      },
      setAttendanceBulk(matchId, map) {
        const cur = api.matches.byId(matchId)?.attendance || {};
        const ids = new Set([...Object.keys(cur), ...Object.keys(map)]);
        for (const id of ids) {
          if (cur[id] !== map[id]) run(cloud.setAttendance(matchId, id, map[id] ?? null));
        }
        return api.matches.byId(matchId);
      },
      attendees(matchId) {
        const g = api.matches.byId(matchId);
        if (!g) return [];
        return mirror.members.filter((m) => g.attendance[m.id] === 'in');
      },
      setTeams(matchId, teams, teamCount, teamPlan) {
        run(cloud.updateMatch(matchId, { teams, teamCount, teamPlan: teamPlan || null }));
        return api.matches.byId(matchId);
      },
      teamAttendance(matchId) {
        const g = api.matches.byId(matchId);
        const out = Object.fromEntries(TEAM_KEYS.map((k) => [k, []]));
        out.none = [];
        if (!g) return out;
        for (const m of mirror.members) {
          if (!m.active || g.attendance[m.id] !== 'in') continue;
          (out[m.team] || out.none).push(m);
        }
        return out;
      },
    },

    stats: {
      attendance(memberId) {
        let total = 0; let present = 0;
        for (const g of mirror.matches) {
          const v = g.attendance[memberId];
          if (v === 'in' || v === 'out') { total += 1; if (v === 'in') present += 1; }
        }
        return { total, present, rate: total ? Math.round((present / total) * 100) : null };
      },
    },

    club: {
      get() { return mirror.club; },
      teamName(k) { return mirror.club.teamNames[k] || `${k}팀`; },
      setTeamName(k, name) { run(cloud.setTeamMeta(k, { name: String(name).trim() || `${k}팀` })); },
      isMixed(k) { return mirror.club.mixedTeams.includes(k); },
      mixedTeams() { return [...mirror.club.mixedTeams]; },
      setMixed(k, on) { run(cloud.setTeamMeta(k, { mixed: !!on })); },
      lockWomen() { return mirror.club.lockWomen; },
      setLockWomen(on) { run(cloud.updateClub?.({ lockWomen: !!on }) ?? cloud.setTeamMeta('A', {})); },
      coach(k) { return mirror.club.coaches[k] || null; },
      coaches() { return { ...mirror.club.coaches }; },
      setCoach() { onError?.(new Error('클라우드 모드에서는 초대 링크로 책임자를 연결합니다.')); },
      coachTeamOf(memberId) { return TEAM_KEYS.find((k) => mirror.club.coaches[k] === memberId) || null; },
      coachMismatches() {
        return TEAM_KEYS.map((k) => {
          const id = mirror.club.coaches[k];
          if (!id) return null;
          const m = api.members.byId(id);
          if (!m) return { key: k, member: null, reason: 'missing' };
          if (!m.active) return { key: k, member: m, reason: 'inactive' };
          if (m.team !== k) return { key: k, member: m, reason: 'moved' };
          return null;
        }).filter(Boolean);
      },
    },

    tactics: {
      byMatch(matchId) { return mirror.tactics.filter((t) => t.matchId === matchId); },
      byId(id) { return mirror.tactics.find((t) => t.id === id) || null; },
      save(data) { run(cloud.saveTactic(data)); return { id: data.id || 'tmp_t', ...data }; },
      remove(id) { run(cloud.saveTactic({ id, deleted: true })); },
    },

    exportJSON() { return JSON.stringify({ app: '웃을산 FC', exportedAt: new Date().toISOString(), data: mirror }, null, 2); },
    async importJSON() { return fail(new Error('클라우드 모드에서는 가져오기 대신 운영자 화면의 "이 기기 데이터 올리기" 를 쓰세요.')); },
    async resetAll() { return fail(new Error('클라우드 모드에서는 전체 초기화를 지원하지 않습니다.')); },
    _helpers: {},
  };
  return api;
}

/* ================= 클라우드 UI ================= */
export function initCloudUI(ctx) {
  const { cloud, $, $$, esc, toast, openModal, closeModal, confirmDialog, render, localStore } = ctx;

  function roleInfo() {
    const s = cloud.state();
    return roleOf(s.club, s.user?.uid, s.members);
  }

  /* ---------- 로그인 화면 ---------- */
  function loginScreen({ invite = null } = {}) {
    const inviteLine = invite
      ? `<div class="ai-card ok" style="margin-top:0"><div class="t">${esc(invite.clubName)} 초대</div>
          <div class="s">${invite.role === 'coach' ? `${esc(invite.team)}팀 책임자로 초대받았습니다.` : '회원으로 초대받았습니다.'}</div></div>`
      : '';
    return `<div class="login-wrap">
      <div class="login-card">
        ${inviteLine}
        <div class="lg-title">웃을산 FC</div>
        <div class="lg-sub">${invite ? '아래 방법으로 참여하세요.' : '클럽을 함께 쓰려면 로그인하세요.'}</div>
        <button class="btn primary block" id="btn-google">구글로 시작하기</button>
        ${invite?.role === 'member' ? '<button class="btn block" id="btn-anon" style="margin-top:8px">이름만 연결하기 (로그인 없이)</button>' : ''}
        <button class="btn ghost block" id="btn-solo" style="margin-top:8px">혼자 쓰기 (이 기기에만 저장)</button>
        <div class="lg-note">운영자는 구글 로그인, 팀 책임자는 초대 링크 + 구글 로그인,
          회원은 초대 링크로 본인 이름만 연결합니다.</div>
      </div>
    </div>`;
  }

  /* ---------- 설정: 계정·역할·초대·승인 ---------- */
  function accountCard() {
    const s = cloud.state();
    if (!s.user) {
      return `<div class="section-title">클럽 계정</div>
        <div class="card">
          <div style="font-size:13.5px;color:var(--text-2);line-height:1.6;margin-bottom:10px">
            지금은 <b>이 기기에만</b> 저장되는 혼자 쓰기 모드입니다. 팀 책임자들과 함께 쓰려면 로그인하세요.
          </div>
          <button class="btn primary block" id="btn-cloud-login">클럽으로 로그인</button>
        </div>`;
    }
    const r = roleInfo();
    const pending = cloud.pendingRequests();
    return `<div class="section-title">클럽 계정</div>
      <div class="card">
        <div class="acct">
          <div class="who"><b>${esc(s.user.displayName || (s.user.isAnonymous ? '이름 연결 사용자' : '사용자'))}</b>
            <span class="chip role">${ROLE_LABEL[r.role] || r.role}${r.team ? ` · ${esc(ctx.teamName(r.team))}` : ''}</span></div>
          <button class="btn sm ghost" id="btn-cloud-logout">로그아웃</button>
        </div>
        ${s.club ? `<div class="s" style="font-size:12.5px;color:var(--text-3);margin-top:6px">클럽: ${esc(s.club.name)}</div>` : ''}
        ${r.role === 'owner' ? `
          <div class="row" style="margin-top:10px">
            <button class="btn grow" id="btn-invite-coach">책임자 초대</button>
            <button class="btn grow" id="btn-invite-member">회원 초대</button>
          </div>` : ''}
        ${pending.length ? `<button class="btn block primary" style="margin-top:8px" id="btn-approvals">
          연결 승인 ${pending.length}건</button>` : ''}
      </div>`;
  }

  /* ---------- 초대 링크 시트 ---------- */
  async function inviteSheet(role) {
    if (role === 'coach') {
      openModal(`
        <h3>책임자 초대 링크</h3>
        <div style="font-size:13px;color:var(--text-2);margin-bottom:10px">팀을 고르면 그 팀 책임자용 링크가 만들어집니다. 7일 뒤 만료되고 한 번 수락하면 사라집니다.</div>
        <div class="seg-wide" id="inv-team">${TEAM_KEYS.map((k, i) => `<button type="button" data-k="${k}" aria-pressed="${i === 0}">${esc(ctx.teamName(k))}</button>`).join('')}</div>
        <div id="inv-out" style="margin-top:12px"></div>
        <div class="foot">
          <button class="btn ghost" data-act="close">닫기</button>
          <button class="btn primary" data-act="make">링크 만들기</button>
        </div>`, (m) => {
        let team = 'A';
        m.addEventListener('click', async (e) => {
          const tb = e.target.closest('#inv-team [data-k]');
          if (tb) { team = tb.dataset.k; $$('#inv-team [data-k]', m).forEach((b) => b.setAttribute('aria-pressed', String(b === tb))); return; }
          const act = e.target.closest('[data-act]')?.dataset.act;
          if (act === 'close') return closeModal();
          if (act === 'make') {
            try {
              const inv = await cloud.createInvite({ role: 'coach', team });
              $('#inv-out', m).innerHTML = linkBox(inv.url, `${ctx.teamName(team)} 책임자용`);
            } catch (err) { toast(err.message, 'err'); }
          }
        });
      });
      return;
    }
    try {
      const inv = await cloud.createInvite({ role: 'member' });
      openModal(`
        <h3>회원 초대 링크</h3>
        <div style="font-size:13px;color:var(--text-2);margin-bottom:10px">단톡방에 공유하세요. 회원이 링크를 열면 명단에서 본인 이름을 골라 연결을 요청하고, 운영자나 해당 팀 책임자가 승인하면 끝입니다.</div>
        ${linkBox(inv.url, '회원용 (7일)')}
        <div class="foot"><button class="btn primary" data-act="close">닫기</button></div>`, (m) => {
        m.addEventListener('click', (e) => { if (e.target.closest('[data-act="close"]')) closeModal(); });
      });
    } catch (err) { toast(err.message, 'err'); }
  }

  function linkBox(url, label) {
    const id = 'lnk' + Math.random().toString(36).slice(2, 6);
    return `<div class="linkbox">
      <div class="lb-label">${esc(label)}</div>
      <div class="lb-url" id="${id}">${esc(url)}</div>
      <div class="row" style="margin-top:8px">
        <button class="btn sm grow" data-copy="${id}">복사</button>
        <button class="btn sm grow primary" data-share="${id}">카톡으로 공유</button>
      </div>
    </div>`;
  }

  /* ---------- 승인함 ---------- */
  function approvalsSheet() {
    const draw = () => {
      const list = cloud.pendingRequests();
      return `<h3>연결 승인</h3>
        <div style="font-size:13px;color:var(--text-2);margin-bottom:10px">회원이 명단에서 본인 이름을 고르면 여기로 옵니다. 맞는 사람인지 확인하고 수락하세요.</div>
        ${list.length ? list.map((m) => `<div class="rs-row">
          <span class="in">${esc(m.name)}</span>
          <span class="chip">${esc(m.team ? ctx.teamName(m.team) : '미배정')}</span>
          <button class="btn sm primary" data-appr="${m.id}">수락</button>
          <button class="btn sm danger" data-rej="${m.id}">거절</button>
        </div>`).join('') : '<div class="empty" style="padding:22px"><div class="big">대기 중인 요청이 없습니다</div></div>'}
        <div class="foot"><button class="btn ghost" data-act="close">닫기</button></div>`;
    };
    openModal(draw(), (m) => {
      m.addEventListener('click', async (e) => {
        if (e.target.closest('[data-act="close"]')) return closeModal();
        const ap = e.target.closest('[data-appr]');
        const rj = e.target.closest('[data-rej]');
        if (!ap && !rj) return;
        try {
          await cloud.approveMember((ap || rj).dataset.appr || (ap || rj).dataset.rej, !!ap);
          toast(ap ? '연결했습니다' : '거절했습니다');
          m.innerHTML = draw();
          render();
        } catch (err) { toast(err.message, 'err'); }
      });
    });
  }

  /* ---------- 초대 링크로 들어왔을 때 ---------- */
  async function handleInviteToken(token) {
    let inv;
    try { inv = await cloud.readInvite(token); }
    catch (e) { toast(e.message, 'err'); return; }

    if (inv.role === 'coach') {
      openModal(`
        <h3>${esc(inv.clubName)} 책임자 초대</h3>
        <div style="font-size:13.5px;color:var(--text-2);line-height:1.6;margin-bottom:12px">
          <b>${esc(ctx.teamName(inv.team))}</b> 책임자로 초대받았습니다.<br>
          수락하면 그 팀 선수들의 실력·간단 체크를 입력하고 출석을 대신 체크할 수 있습니다.
        </div>
        <button class="btn primary block" data-act="accept">구글로 로그인하고 수락</button>
        <div class="foot"><button class="btn ghost" data-act="close">나중에</button></div>`, (m) => {
        m.addEventListener('click', async (e) => {
          const act = e.target.closest('[data-act]')?.dataset.act;
          if (act === 'close') return closeModal();
          if (act !== 'accept') return;
          try {
            if (!cloud.state().user || cloud.state().user.isAnonymous) await cloud.signInGoogle();
            await cloud.acceptCoachInvite(token);
            closeModal();
            toast(`${ctx.teamName(inv.team)} 책임자로 연결되었습니다`);
            ctx.onModeChange?.();
          } catch (err) { toast(err.message, 'err'); }
        });
      });
      return;
    }

    // 회원 초대: 이름 고르기
    const pickNames = () => {
      const list = cloud.state().members.filter((m) => m.active !== false);
      return list.length
        ? list.map((m) => `<button class="btn block" data-pick="${m.id}" style="margin-bottom:6px;justify-content:flex-start">
            ${esc(m.name)}${m.memberUid ? ' <span class="chip">연결됨</span>' : ''}</button>`).join('')
        : '<div class="empty" style="padding:20px"><div class="big">명단을 불러오는 중…</div></div>';
    };
    openModal(`
      <h3>${esc(inv.clubName)} 회원 연결</h3>
      <div style="font-size:13px;color:var(--text-2);margin-bottom:10px">명단에서 <b>본인 이름</b>을 골라 주세요. 운영자나 팀 책임자가 확인하면 연결됩니다.</div>
      <div id="pick-list">${pickNames()}</div>
      <div class="foot"><button class="btn ghost" data-act="close">닫기</button></div>`, (m) => {
      // 명단이 늦게 오면 다시 그린다
      const un = cloud.subscribe(() => { const box = $('#pick-list', m); if (box) box.innerHTML = pickNames(); });
      m.addEventListener('click', async (e) => {
        if (e.target.closest('[data-act="close"]')) { un(); return closeModal(); }
        const pick = e.target.closest('[data-pick]');
        if (!pick) return;
        try {
          if (!cloud.state().user) await cloud.signInAnonymous();
          await cloud.requestMemberLink(token, pick.dataset.pick);
          un(); closeModal();
          toast('연결을 요청했습니다. 승인되면 바로 쓸 수 있습니다.');
          ctx.onModeChange?.();
        } catch (err) { toast(err.message, 'err'); }
      });
    });
  }

  /* ---------- 이관 마법사 ---------- */
  function migrationWizard() {
    const local = localStore.get();
    const n = local.members.length;
    const g = local.matches.length;
    openModal(`
      <h3>이 기기 데이터를 클럽으로 올리기</h3>
      <div style="font-size:13.5px;color:var(--text-2);line-height:1.7;margin-bottom:12px">
        지금 이 기기에 <b>회원 ${n}명 · 경기 ${g}건</b>이 있습니다.<br>
        클럽을 만들면서 그대로 올릴 수 있습니다. 올린 뒤에도 이 기기 데이터는 지워지지 않습니다.
      </div>
      <button class="btn block" id="btn-backup-first" style="margin-bottom:8px">먼저 JSON 파일로 백업받기</button>
      <div class="foot">
        <button class="btn ghost" data-act="empty">빈 클럽으로 시작</button>
        <button class="btn primary" data-act="upload">올리면서 시작</button>
      </div>`, (m) => {
      m.addEventListener('click', async (e) => {
        if (e.target.closest('#btn-backup-first')) return ctx.exportJSON();
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (!act) return;
        try {
          const clubId = await cloud.createClub({
            name: local.club?.name || '웃을산 FC',
            teamNames: local.club?.teamNames || {},
            localData: act === 'upload' ? local : null,
          });
          closeModal();
          toast(act === 'upload' ? `클럽을 만들고 ${n}명을 올렸습니다` : '빈 클럽을 만들었습니다');
          ctx.onModeChange?.(clubId);
        } catch (err) { toast(err.message, 'err'); }
      });
    });
  }

  return { loginScreen, accountCard, inviteSheet, approvalsSheet, handleInviteToken, migrationWizard, roleInfo, ROLE_LABEL };
}
