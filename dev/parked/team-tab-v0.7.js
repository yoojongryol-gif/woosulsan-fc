/* v0.7 팀 탭 · 감독 평가 · 팀 배분 · AI 팀 코치 · 경기 만들기 — v1.0(2026-09-29 S1)에서 내려온 화면 코드
 * 앱에 배선되지 않는다(import 없음). 되살릴 땐 store 의 팀 API 가 없어진 것부터 확인할 것.
 * 남겨 둔 이유: exportTeamsPNG(팀 카드 이미지)·능력치 요약표·선발/교체 이동 UI 는 S3~S4 후보.
 */

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
  const groupCount = ui.groupCount || plan?.teams.length || suggestGroupCount(total, Object.keys(byTeam).length, store.club.squadSize());
  const candidates = suggestMerges(wtMap(byTeam), Math.min(groupCount, Object.keys(byTeam).length)).slice(0, 4);

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
          ${mapped.map((t, i) => `<div class="ai-team"><span class="dot" style="background:${TEAM_COLORS[i % TEAM_COLORS.length]}"></span>
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



/* ---------- 팀 ---------- */
function teamName(k) { return k === 'none' ? '미배정' : store.club.teamName(k); }
/** 팀 약자 (옛 store 가 섞여 들어와도 화면이 죽지 않게 기본값으로 대체) */
function aliasOf(k) {
  try { return store.club.teamAlias?.(k) || DEFAULT_TEAM_ALIASES[k] || ''; }
  catch (e) { return DEFAULT_TEAM_ALIASES[k] || ''; }
}
function myRoleLabel() { return 'owner'; }
/**
 * 팀 전력 계산용으로 여성 회원 점수에 혼성 환산 계수를 적용한 복사본 (v0.6.0)
 * 계수 1.0 이면 원본을 그대로 돌려주므로 기존 동작과 완전히 같다.
 */
function wt(list) {
  const f = store.club.mixedFactor();
  if (f === 1 || !Array.isArray(list)) return list;
  return list.map((m) => (m?.gender === '여' ? { ...m, skill: weightedSkill(m, f) } : m));
}
function wtMap(byTeam) {
  const f = store.club.mixedFactor();
  if (f === 1) return byTeam;
  return Object.fromEntries(Object.entries(byTeam).map(([k, v]) => [k, wt(v)]));
}

function teamNameMap() { return Object.fromEntries(TEAM_KEYS.map((k) => [k, teamName(k)])); }
function aliasMap() {
  try { return store.club.teamAliases?.() || { ...DEFAULT_TEAM_ALIASES }; }
  catch (e) { return { ...DEFAULT_TEAM_ALIASES }; }
}
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
    const s = groupStat(wt(list));
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
  // v0.6.0: 팀 수는 참석 인원과 팀당 기본 인원으로 권한다
  const base = store.club.squadSize();
  const rec = recommendGroups(total, {
    base,
    availableTeams: Math.max(availableTeams, 2),
    teamSizes: TEAM_KEYS.map((k) => att[k].length),
  });
  const recommended = rec.count;
  const wanted = ui.groupCount || (plan ? plan.teams.length : recommended);
  // v0.7.0: 2 ~ (소속 팀 수, 최소 4) — 학생팀이 생겨 5팀까지 나눌 수 있다
  const options = Array.from({ length: Math.max(4, TEAM_KEYS.length) - 1 }, (_, i) => i + 2);

  // 출석이 바뀐 뒤 아직 다시 나누지 않았으면 알려 준다
  const planStamp = plan ? plan.teams.reduce((n, x) => n + x.length, 0) : null;
  const attChanged = plan && planStamp !== total;

  html += `<div class="section-title">오늘 팀 수 <span class="count">권장 ${recommended}팀</span></div>
    ${attChanged ? `<div class="fixbanner" style="margin-bottom:8px">
      <div><b>참석 인원이 바뀌었어요</b><div class="s">지금 ${total}명인데 나눠 둔 팀은 ${planStamp}명 기준입니다.</div></div>
      <button class="btn sm primary" id="btn-reco-again">다시 제안</button></div>` : ''}
    <div class="seg-wide" id="group-count">
      ${options.map((n) => `<button data-gc="${n}" aria-pressed="${wanted === n}">${n}팀</button>`).join('')}
    </div>
    <div class="recoline">${esc(rec.reason)}${rec.alts.length ? ` · 대안: <button class="linkbtn" data-gc-alt="${rec.alts[0].count}">${esc(rec.alts[0].label)}</button>` : ''}</div>`;

  const suggestions = availableTeams >= 2 ? suggestMerges(wtMap(byTeam), Math.min(wanted, availableTeams)).slice(0, 3) : [];
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
  const st = teams.map((list) => groupStat(wt(list)));
  const squad = store.club.squadSize();
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
        ${t.map((p, j) => `${j === squad && t.length > squad ? `<div class="benchsep">교체 ${t.length - squad}명</div>` : ''}
          <button class="pcard${ui.teamSel && ui.teamSel.t === i && ui.teamSel.i === j ? ' sel' : ''}${j >= squad ? ' bench' : ''}" data-swap="${i}:${j}">
          ${p.gk ? '<span class="gkb">GK</span>' : ''}${store.club.coachTeamOf(p.id) ? '<span class="cb">🎽</span>' : ''}
          <span class="n">${esc(p.name)}</span><span class="sk">${p.skill}</span>
          ${t.length > squad ? `<span class="mv" data-bench="${i}:${j}" role="button" aria-label="${j >= squad ? '선발로' : '교체로'}">${j >= squad ? '↑' : '↓'}</span>` : ''}
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
      : `<div class="footer-note">선수 카드를 탭 → 다른 선수 탭 = 자리 교체${teams.some((t) => t.length > squad) ? ' · ↓↑ = 선발/교체 이동' : ''}</div>`}`;

  root.innerHTML = html;
}

/** 선발 ↔ 교체 이동 (v0.6.0) — 배열 순서가 곧 선발 순서다 */
function moveBench(ti, pi) {
  const g = store.matches.byId(ui.teamMatchId);
  const plan = currentPlan(g);
  if (!plan?.teams?.[ti]) return;
  const squad = store.club.squadSize();
  const teams = plan.teams.map((x) => [...x]);
  const arr = teams[ti];
  if (pi < 0 || pi >= arr.length) return;
  const [id] = arr.splice(pi, 1);
  if (pi >= squad) arr.splice(Math.min(squad - 1, arr.length), 0, id);   // 교체 → 선발
  else arr.push(id);                                                     // 선발 → 교체
  ui.teamSel = null;
  applyPlan({ ...plan, teams });
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
    <h3>팀 설정</h3>
    <div class="field"><label>클럽 이름 <span class="labelhint">공유 이미지 위에 찍히는 우리 모임 이름 (앱 이름과는 별개)</span></label>
      <input type="text" id="f-clubname" value="${esc(store.club.name())}" maxlength="20" placeholder="웃을산 FC"></div>
    <div style="font-size:13px;color:var(--text-2);line-height:1.6;margin-bottom:10px">
      소속 팀 <b>${TEAM_KEYS.length}개</b> (${MIN_TEAMS}~${MAX_TEAMS}개). <b>약자</b>는 일괄 추가에서 줄 맨 앞에 쓰는 1~2글자예요 — 예: <code>학 홍길동 08 남 윙</code>.
    </div>
    ${TEAM_KEYS.map((k, i) => `<div class="field teamedit" style="--c:${TEAM_COLORS[i]}">
      <div class="tehead"><span class="dot"></span><label>${i + 1}번째 팀 <span class="labelhint">회원 ${store.club.teamMemberCount(k)}명</span></label>
        <span class="teops">
          <button type="button" class="btn sm ghost" data-tmove="${k}:-1" ${i === 0 ? 'disabled' : ''} aria-label="위로">↑</button>
          <button type="button" class="btn sm ghost" data-tmove="${k}:1" ${i === TEAM_KEYS.length - 1 ? 'disabled' : ''} aria-label="아래로">↓</button>
          <button type="button" class="btn sm ghost" data-tdel="${k}" ${TEAM_KEYS.length <= MIN_TEAMS ? 'disabled' : ''} style="color:var(--danger)">삭제</button>
        </span></div>
      <div class="row" style="gap:6px">
        <input type="text" data-tn="${k}" value="${esc(teamName(k))}" maxlength="12" placeholder="팀 이름" style="flex:2">
        <input type="text" data-ta="${k}" value="${esc(aliasOf(k))}" maxlength="2" placeholder="약자" style="flex:0 0 74px;text-align:center">
      </div>
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
    <button type="button" class="btn block" data-tadd ${TEAM_KEYS.length >= MAX_TEAMS ? 'disabled' : ''} style="margin:-2px 0 14px">
      ${TEAM_KEYS.length >= MAX_TEAMS ? `팀은 ${MAX_TEAMS}개까지` : '+ 팀 추가'}</button>
    <div class="field"><label>팀당 기본 인원 <span class="labelhint">축구는 11대11 · 풋살·미니게임이면 줄여서</span></label>
      <div class="seg-wide" id="f-squad">
        ${SQUAD_SIZES.map((n) => `<button type="button" data-sq="${n}" aria-pressed="${store.club.squadSize() === n}">${n}명</button>`).join('')}
      </div>
      <div class="hint">참석 인원을 이 숫자로 나눠 오늘 팀 수를 권합니다.</div></div>
    <div class="field"><label>혼성 환산 계수 <span class="labelhint">여성 기준 점수를 팀 전력에 어떻게 반영할지</span></label>
      <select id="f-mixf">
        ${[10, 9, 8, 7, 6, 5].map((x) => { const v = x / 10; return `<option value="${v}" ${store.club.mixedFactor() === v ? 'selected' : ''}>${v.toFixed(1)}${v === 1 ? ' (끄기 · 지금과 동일)' : ''}</option>`; }).join('')}
      </select>
      <div class="hint">여성 회원의 점수는 여성 기준으로 매겨집니다. 이 값은 <b>여성 기준 4점을 남성 기준으로 몇 점으로 볼지</b>를 정합니다
        (0.8이면 4점 → 3.2점). 팀 전력합·합치기 제안·완전 새로 섞기에만 쓰이고, 회원 화면의 점수는 그대로입니다.</div></div>
    ${store.club.coachMismatches().length ? `<div class="card flat" style="padding:10px 12px">
      ${store.club.coachMismatches().map((x) => `<div style="font-size:12.5px"><span class="chip warn">확인</span>
        ${esc(teamName(x.key))} 감독 ${esc(x.member?.name || '(삭제된 회원)')} —
        ${x.reason === 'moved' ? `지금은 ${esc(x.member.team ? teamName(x.member.team) : '미배정')} 소속입니다` : x.reason === 'inactive' ? '비활동 회원입니다' : '회원 목록에 없습니다'}</div>`).join('')}
    </div>` : ''}
    <div class="foot">
      <button class="btn ghost" data-act="cancel">취소</button>
      <button class="btn primary" data-act="save">저장</button>
    </div>`, (m) => {
    const saveInputs = () => {
      const cn = $('#f-clubname', m);
      if (cn) store.club.setName(cn.value);
      const sq = $('#f-squad [aria-pressed="true"]', m);
      if (sq) store.club.setSquadSize(Number(sq.dataset.sq));
      const mf = $('#f-mixf', m);
      if (mf) store.club.setMixedFactor(Number(mf.value));
      $$('[data-tn]', m).forEach((inp) => store.club.setTeamName(inp.dataset.tn, inp.value));
      $$('[data-mixed]', m).forEach((b) => store.club.setMixed(b.dataset.mixed, b.getAttribute('aria-pressed') === 'true'));
      $$('[data-coach]', m).forEach((sel) => store.club.setCoach(sel.dataset.coach, sel.value || null));
      $$('[data-ta]', m).forEach((inp) => store.club.setTeamAlias?.(inp.dataset.ta, inp.value));
    };
    m.addEventListener('click', (e) => {
      const sqb = e.target.closest('#f-squad [data-sq]');
      if (sqb) { $$('#f-squad [data-sq]', m).forEach((b) => b.setAttribute('aria-pressed', String(b === sqb))); return; }
      // v0.7.0: 팀 추가 / 삭제 / 순서 — 지금까지 입력한 것은 먼저 저장하고 창을 다시 연다
      const mv = e.target.closest('[data-tmove]');
      if (mv && !mv.disabled) {
        saveInputs();
        const [k, d] = mv.dataset.tmove.split(':');
        store.club.moveTeam(k, Number(d));
        return afterModalClose(() => { render(); teamNameModal(); });
      }
      if (e.target.closest('[data-tadd]') && !e.target.closest('[data-tadd]').disabled) {
        saveInputs();
        const key = store.club.addTeam();
        return afterModalClose(() => {
          render(); teamNameModal();
          if (key) toast(`${teamName(key)} 팀을 추가했습니다 — 이름·약자를 정해 주세요`);
        });
      }
      const del = e.target.closest('[data-tdel]');
      if (del && !del.disabled) {
        saveInputs();
        const k = del.dataset.tdel;
        const n = store.club.teamMemberCount(k);
        const nm = teamName(k);
        return afterModalClose(async () => {
          const okDel = n === 0 || await confirmDialog({
            title: `${nm} 팀을 삭제할까요?`,
            body: `이 팀 소속 회원 <b>${n}명</b>은 <b>미배정</b>으로 옮겨집니다(회원은 지워지지 않아요). 나중에 다른 팀으로 다시 넣을 수 있습니다.`,
            ok: '미배정으로 옮기고 삭제', danger: true,
          });
          if (okDel) {
            const r = store.club.removeTeam(k);
            if (!r.ok) toast(r.reason || '삭제하지 못했습니다', 'err');
            else toast(`${nm} 팀을 삭제했습니다${r.moved ? ` · ${r.moved}명 미배정` : ''}`);
            ui.teamPlan = null;
            if (ui.memberTeam === k) ui.memberTeam = 'all';
            if (ui.coachTeam === k) ui.coachTeam = TEAM_KEYS[0];
          }
          render(); teamNameModal();
        });
      }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'cancel') return closeModal();
      saveInputs();
      closeModal();
      toast('팀 설정을 저장했습니다');
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
      <div class="s">감독에게 폰을 건네 직접 입력받거나, 감독 말을 들으며 채우는 화면입니다.
        6항목을 누르면 바로 저장되고, <b>종합 실력은 평균으로 자동</b> 계산됩니다.
        <b>기준은 회원 성별에 맞춰</b> 자동으로 바뀝니다 — 항목 이름을 누르면 5단계 기준이 보입니다.
        스피드·지구력은 측정 기록을 넣으면 점수가 자동으로 매겨집니다.</div>
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
  // v0.5.6: 종합 실력은 6항목 평균 자동 → 6항목을 기본으로 펼쳐 두고, 종합은 옆에 표시만 한다
  // v0.6.0: 성별 기준표 배지 + 스피드·지구력은 측정 기록 칸
  return `<div class="crow open" data-crow="${m.id}">
    <div class="line">
      <div class="who">
        <b>${esc(m.name)}</b>${store.club.coachTeamOf(m.id) === key ? '<span class="chip coach">🎽</span>' : ''}
        <div class="meta">${m.birthYear ? `${ageOf(m.birthYear)}세 · ` : ''}${esc(m.pos)}${m.gk ? ' · GK' : ''}${m.abilUpdatedAt ? ` · ${esc(fmtWhen(m.abilUpdatedAt))} ${esc(whoLabel(m.abilUpdatedBy))}` : ''}</div>
        <div class="meta">${rubricBadge(m)}</div>
      </div>
      <div class="autoskill mini" data-auto="${m.id}">
        <b>${esc(skillLabel(m))}</b><span>종합</span>
      </div>
    </div>
    <div class="detail">
      ${ABILITIES.map((a) => abilRow(a, m.abil?.[a.key], m, `data-cabil="${m.id}:${a.key}"`, testRecOf(m, a.key))).join('')}
    </div>
  </div>`;
}
/** 회원의 그 항목 측정 기록 (없으면 null) */
function testRecOf(member, abilKey) {
  const t = testForAbil(abilKey);
  return t ? (member?.tests?.[t.key] || null) : null;
}



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



function matchModal(existing) {
  // v0.6.0: 팀 수는 여기서 정하지 않는다 (참석 인원을 보고 팀 탭에서 정함)
  const g = existing || { date: nextWeekday(4), time: '20:00', place: '', teamCount: null, status: '예정' };
  openModal(`
    <h3>${existing ? '경기 수정' : '경기 만들기'}</h3>
    <div class="field"><label>날짜</label><input type="date" id="f-date" value="${esc(g.date)}"></div>
    <div class="field"><label>시간</label><input type="time" id="f-time" value="${esc(g.time)}"></div>
    <div class="field"><label>장소</label><input type="text" id="f-place" placeholder="예: 시민운동장 A구장" value="${esc(g.place)}"></div>
    <div class="hint" style="margin:-2px 0 10px">팀 수는 미리 정하지 않습니다. 출석을 체크한 뒤 <b>팀 탭</b>에서 참석 인원에 맞춰 정해요.</div>
    ${existing ? `<div class="field"><label>상태</label>
      <div class="seg-wide" id="f-st">
        ${['예정', '확정', '종료'].map((s) => `<button type="button" data-st="${s}" aria-pressed="${g.status === s}">${s}</button>`).join('')}
      </div></div>` : ''}
    <div class="foot">
      ${existing ? '<button class="btn danger" data-act="del">삭제</button>' : ''}
      <button class="btn ghost" data-act="cancel">취소</button>
      <button class="btn primary" data-act="save">저장</button>
    </div>`, (m) => {
    let st = g.status;
    const placeDraft = existing ? null : bindDraft(m, 'match-place', '#f-place');
    m.addEventListener('click', async (e) => {
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
        status: st,   // teamCount 는 팀 탭에서 확정될 때 저장된다
      };
      if (existing) { store.matches.update(existing.id, data); toast('경기를 수정했습니다'); }
      else {
        const created = store.matches.add(data);
        ui.attendMatchId = created.id; ui.teamMatchId = created.id;
        placeDraft?.clear();
        toast('경기를 만들었습니다');
      }
      closeModal();
      render();
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
  const n = ui.groupCount || plan?.teams.length || suggestGroupCount(attendees.length, Math.max(4, TEAM_KEYS.length), store.club.squadSize());
  const res = balanceTeams(wt(attendees), n, { lock: womenLock(attendees) });
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
  const st = teams.map((list) => groupStat(wt(list)));
  const squad = store.club.squadSize();
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
  x.fillText(store.club.name(), 76, 100);   // 머리글 = 클럽 이름 (꼬리말이 앱 이름)
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
    const over = t.length > squad ? ` (선발 ${squad}+교체 ${t.length - squad})` : '';
    const meta = `${t.length}명${over} · 전력 ${st[i].total} · 평균 ${st[i].avg}`;
    x.fillText(meta, W - 76 - x.measureText(meta).width, y + 43);
    t.forEach((p, j) => {
      const ry = y + 66 + 48 + j * rowH;
      x.fillStyle = '#241f1a';
      x.font = '700 30px -apple-system, Malgun Gothic, sans-serif';
      const isBench = j >= squad && t.length > squad;
      const label = `${j + 1}. ${p.name}${store.club.coachTeamOf(p.id) ? ' (감독)' : ''}${isBench ? ' · 교체' : ''}`;
      x.fillStyle = isBench ? '#8a8272' : '#241f1a';
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
  x.fillText(`${APP_NAME} 앱 ${APP_VERSION}`, 44, H - 26);

  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const file = new File([blob], `축구joy_${g.date}_팀.png`, { type: 'image/png' });
  await shareOrDownload(file, blob);
}

