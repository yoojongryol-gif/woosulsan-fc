/* 웃을산 FC — 전술판: 포메이션 프리셋 · 핀 드래그 · 그림판 · 저장 · PNG */

export const PRESETS = [
  { name: '4-3-3', size: 11, rows: [4, 3, 3] },
  { name: '4-4-2', size: 11, rows: [4, 4, 2] },
  { name: '3-5-2', size: 11, rows: [3, 5, 2] },
  { name: '2-3-1', size: 7, rows: [2, 3, 1] },
  { name: '3-2-1', size: 7, rows: [3, 2, 1] },
  { name: '2-2-1', size: 6, rows: [2, 2, 1] },
  { name: '1-2-1', size: 5, rows: [1, 2, 1] },
];
const COLORS = ['#ffd83d', '#ff5a4d', '#ffffff'];

/** 인원수에 맞는 프리셋만 (딱 맞는 게 있으면 그것들, 없으면 인원 이하 중 가장 큰 쪽) */
export function presetsFor(n) {
  const exact = PRESETS.filter((p) => p.size === n);
  if (exact.length) return exact;
  const under = PRESETS.filter((p) => p.size <= n);
  if (under.length) {
    const max = Math.max(...under.map((p) => p.size));
    return under.filter((p) => p.size === max);
  }
  return [PRESETS[PRESETS.length - 1]];
}

/** 프리셋 → 핀 좌표(%) 배치. 남는 선수는 아래쪽 대기줄. */
export function layout(preset, players) {
  const pins = [];
  const list = [...players];
  const gkIdx = list.findIndex((p) => p.gk);
  const gk = gkIdx >= 0 ? list.splice(gkIdx, 1)[0] : list.shift();
  if (gk) pins.push({ memberId: gk.id, name: gk.name, x: 50, y: 91, gk: true });

  const rows = preset.rows;
  const need = rows.reduce((a, b) => a + b, 0);
  const onField = list.slice(0, need);
  const extra = list.slice(need);
  let idx = 0;
  rows.forEach((k, i) => {
    const y = rows.length > 1 ? 74 - i * (50 / (rows.length - 1)) : 50;
    for (let j = 0; j < k; j += 1) {
      const p = onField[idx]; idx += 1;
      if (!p) return;
      pins.push({ memberId: p.id, name: p.name, x: Math.round(((j + 1) * 100) / (k + 1)), y: Math.round(y), gk: false });
    }
  });
  extra.forEach((p, i) => {
    pins.push({ memberId: p.id, name: p.name, x: Math.round(((i + 1) * 100) / (extra.length + 1)), y: 95, gk: false });
  });
  return pins;
}

export function initTactics(ctx) {
  const { store, ui, toast, esc, confirmDialog, shareOrDownload, fmtDate, TEAM_KEYS, TEAM_COLORS,
    APP_VERSION, groupLabel, groupColor, currentPlan, labelOf, AI, aiRun, aiCostLine } = ctx;
  const root = document.getElementById('view-tactics');
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const t = {
    matchId: null,
    teamIdx: 0,          // -1 = 전체 참석자
    formation: null,
    pins: [],
    strokes: [],
    mode: 'move',        // 'move' | 'draw'
    tool: 'free',        // 'free' | 'line' | 'arrow'
    color: COLORS[0],
    title: '',
    editingId: null,
  };

  /* ---------- 데이터 ---------- */
  function currentMatch() {
    const list = store.matches.sorted();
    if (!list.length) return null;
    if (!t.matchId || !store.matches.byId(t.matchId)) t.matchId = (store.matches.upcoming()[0] || list[0]).id;
    return store.matches.byId(t.matchId);
  }
  function teamOptions(g) {
    const opts = [];
    const plan = currentPlan(g);
    if (plan?.teams?.length) {
      plan.teams.forEach((ids, i) => opts.push({
        idx: i,
        label: `오늘 · ${labelOf(plan, i)}`,
        color: groupColor(plan.groups[i], i, plan.mode),
        ids,
      }));
    }
    // 고정 소속 팀 (이번 경기 참석자 기준)
    const att = store.matches.teamAttendance(g.id);
    TEAM_KEYS.forEach((k, i) => {
      if (!att[k].length) return;
      opts.push({ idx: 100 + i, label: store.club.teamName(k), color: TEAM_COLORS[i], ids: att[k].map((m) => m.id) });
    });
    opts.push({ idx: -1, label: '전체 참석자', color: '#1f7a4d', ids: store.matches.attendees(g.id).map((m) => m.id) });
    return opts;
  }
  function playersOf(g) {
    const list = teamOptions(g);
    const opt = list.find((o) => o.idx === t.teamIdx) || list[0];
    t.teamIdx = opt.idx;
    t.teamColor = opt.color || '#1f7a4d';
    t.teamLabel = opt.label;
    return opt.ids.map((id) => store.members.byId(id)).filter(Boolean);
  }

  /* ---------- 렌더 ---------- */
  function render() {
    const g = currentMatch();
    if (!g) {
      root.innerHTML = `<div class="empty"><div class="big">경기가 없습니다</div>
        <div>홈 탭에서 경기를 먼저 만들어 주세요.</div></div>`;
      return;
    }
    const players = playersOf(g);
    const presets = presetsFor(players.length);
    if (!t.formation || !presets.some((p) => p.name === t.formation)) t.formation = presets[0].name;
    const saved = store.tactics.byMatch(g.id);

    root.innerHTML = `
      <div class="selectrow"><select id="tac-match">${store.matches.sorted().map((m) => `<option value="${m.id}" ${m.id === g.id ? 'selected' : ''}>${esc(fmtDate(m.date))} ${esc(m.time || '')}${m.place ? ' · ' + esc(m.place) : ''}</option>`).join('')}</select></div>
      <div class="selectrow">
        <select id="tac-team">${teamOptions(g).map((o) => `<option value="${o.idx}" ${o.idx === t.teamIdx ? 'selected' : ''}>${esc(o.label)} (${o.ids.length}명)</option>`).join('')}</select>
        <select id="tac-formation" style="max-width:130px">${presets.map((p) => `<option value="${p.name}" ${p.name === t.formation ? 'selected' : ''}>${p.name} (${p.size}인)</option>`).join('')}</select>
      </div>
      ${players.length < 2 ? `<div class="empty"><div class="big">선수가 없습니다</div>
        <div>출석 탭에서 참석자를 체크하거나, 팀 탭에서 팀을 확정해 주세요.</div></div>` : `
      <div class="pitch-wrap" id="pitch">
        ${pitchSVG()}
        <svg class="draw-layer${t.mode === 'draw' ? ' on' : ''}" id="draw" viewBox="0 0 100 150" preserveAspectRatio="none"
             style="pointer-events:${t.mode === 'draw' ? 'auto' : 'none'}">${strokesSVG(t.strokes)}</svg>
        <div id="pins" style="position:absolute;inset:0;pointer-events:${t.mode === 'draw' ? 'none' : 'auto'}">
          ${t.pins.map((p, i) => pinHTML(p, i)).join('')}
        </div>
      </div>
      <div class="tool-row">
        <button class="toolbtn" id="m-move" aria-pressed="${t.mode === 'move'}">핀 이동</button>
        <button class="toolbtn" id="m-draw" aria-pressed="${t.mode === 'draw'}">그리기</button>
        ${t.mode === 'draw' ? `
          <span style="width:1px;height:26px;background:var(--line);margin:0 2px"></span>
          <button class="toolbtn" data-tool="free" aria-pressed="${t.tool === 'free'}">자유선</button>
          <button class="toolbtn" data-tool="line" aria-pressed="${t.tool === 'line'}">직선</button>
          <button class="toolbtn" data-tool="arrow" aria-pressed="${t.tool === 'arrow'}">화살표</button>
          ${COLORS.map((c) => `<button class="swatch" data-color="${c}" style="background:${c}" aria-pressed="${t.color === c}" aria-label="색 ${c}"></button>`).join('')}
        ` : ''}
        <span style="flex:1"></span>
        <button class="toolbtn" id="t-undo" ${t.strokes.length ? '' : 'disabled style="opacity:.4"'}>되돌리기</button>
        <button class="toolbtn" id="t-clear" ${t.strokes.length ? '' : 'disabled style="opacity:.4"'}>전체 지우기</button>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn grow" id="t-reset">포메이션 다시 배치</button>
        <button class="btn grow primary" id="t-save">${t.editingId ? '전술 저장' : '전술 저장'}</button>
      </div>
      ${t.note ? `<div class="card flat" style="margin-top:10px;padding:12px">
        <div style="font-size:12px;font-weight:800;color:var(--text-2);margin-bottom:6px">전술 메모</div>
        <div style="font-size:13.5px;line-height:1.6;white-space:pre-wrap">${esc(t.note)}</div></div>` : ''}
      <div class="row" style="margin-top:8px">
        <button class="btn block grow" id="t-png">전술판 이미지 저장</button>
      </div>
      <div class="row" style="margin-top:8px">
        <button class="btn block grow ai" id="t-ai">✦ AI 전술 추천</button>
      </div>
      <div id="ai-tactics-box"></div>`}
      <div class="section-title">저장된 전술 <span class="count">${saved.length}</span></div>
      ${saved.length ? saved.map((s) => `
        <div class="match-row">
          <div class="d" style="min-width:44px"><div class="n" style="font-size:13px">${esc(String(s.teamLabel || '전체').slice(0, 4))}</div></div>
          <button class="info" data-load="${s.id}" style="background:none;border:none;padding:0">
            <div class="p">${esc(s.title || '제목 없음')}</div>
            <div class="s">${esc(s.formation)} · 핀 ${s.pins?.length || 0} · 선 ${s.strokes?.length || 0}</div>
          </button>
          <button class="btn sm danger" data-del="${s.id}">삭제</button>
        </div>`).join('')
        : `<div class="empty" style="padding:22px"><div class="big">저장된 전술이 없습니다</div><div>배치를 만들고 "전술 저장"을 누르세요.</div></div>`}
      <div class="footer-note">웃을산 FC · ${APP_VERSION}</div>`;

    if (players.length >= 2 && !t.pins.length) resetLayout(false);
    bindPitch();
  }

  function pinHTML(p, i) {
    const color = t.teamColor || '#1f7a4d';
    return `<div class="pin" data-pin="${i}" style="left:${p.x}%;top:${p.y}%">
      <div class="dot" style="background:${p.gk ? '#f2b705' : color}">${p.gk ? 'GK' : (i)}</div>
      <div class="lbl">${esc(p.name)}</div>
    </div>`;
  }

  function pitchSVG() {
    return `<svg class="pitch" viewBox="0 0 100 150" aria-hidden="true">
      <defs>
        <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#3a9b66"/><stop offset="1" stop-color="#2b7f52"/>
        </linearGradient>
      </defs>
      <rect width="100" height="150" fill="url(#grass)"/>
      ${Array.from({ length: 6 }, (_, i) => `<rect x="0" y="${i * 25}" width="100" height="12.5" fill="#fff" opacity=".04"/>`).join('')}
      <g fill="none" stroke="#fff" stroke-width=".7" opacity=".85">
        <rect x="4" y="4" width="92" height="142"/>
        <line x1="4" y1="75" x2="96" y2="75"/>
        <circle cx="50" cy="75" r="14"/>
        <circle cx="50" cy="75" r="1" fill="#fff"/>
        <rect x="24" y="4" width="52" height="20"/>
        <rect x="38" y="4" width="24" height="8"/>
        <rect x="24" y="126" width="52" height="20"/>
        <rect x="38" y="138" width="24" height="8"/>
        <path d="M34 24a18 14 0 0 0 32 0"/>
        <path d="M34 126a18 14 0 0 1 32 0"/>
      </g>
    </svg>`;
  }

  function strokesSVG(strokes) {
    return strokes.map((s) => {
      const pts = s.points.map((p) => `${p[0]},${p[1] * 1.5}`).join(' ');
      let out = `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" opacity=".95"/>`;
      if (s.type === 'arrow' && s.points.length > 1) {
        const [x1, y1] = s.points[s.points.length - 2];
        const [x2, y2] = s.points[s.points.length - 1];
        const a = Math.atan2((y2 - y1) * 1.5, x2 - x1);
        const L = 3.6;
        const p1 = [x2 - L * Math.cos(a - 0.45), y2 * 1.5 - L * Math.sin(a - 0.45)];
        const p2 = [x2 - L * Math.cos(a + 0.45), y2 * 1.5 - L * Math.sin(a + 0.45)];
        out += `<polygon points="${x2},${y2 * 1.5} ${p1[0]},${p1[1]} ${p2[0]},${p2[1]}" fill="${s.color}"/>`;
      }
      return out;
    }).join('');
  }

  function resetLayout(notify = true) {
    const g = currentMatch();
    if (!g) return;
    const players = playersOf(g);
    const preset = PRESETS.find((p) => p.name === t.formation) || presetsFor(players.length)[0];
    t.pins = layout(preset, players);
    if (notify) { render(); toast(`${preset.name} 배치`); }
    else renderPins();
  }

  function renderPins() {
    const box = $('#pins', root);
    if (box) box.innerHTML = t.pins.map((p, i) => pinHTML(p, i)).join('');
  }
  function renderStrokes() {
    const d = $('#draw', root);
    if (d) d.innerHTML = strokesSVG(t.strokes);
    const u = $('#t-undo', root); const c = $('#t-clear', root);
    [u, c].forEach((b) => { if (b) { b.disabled = !t.strokes.length; b.style.opacity = t.strokes.length ? '' : '.4'; } });
  }

  /* ---------- 포인터: 핀 드래그 & 그리기 ---------- */
  function bindPitch() {
    const pitch = $('#pitch', root);
    if (!pitch) return;
    const rectPct = (e) => {
      const r = pitch.getBoundingClientRect();
      return {
        x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
        y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)),
      };
    };

    // 핀 드래그
    $('#pins', root)?.addEventListener('pointerdown', (e) => {
      const pin = e.target.closest('.pin');
      if (!pin || t.mode !== 'move') return;
      e.preventDefault();
      const i = Number(pin.dataset.pin);
      pin.classList.add('dragging');
      pin.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const p = rectPct(ev);
        t.pins[i].x = p.x; t.pins[i].y = p.y;
        pin.style.left = p.x + '%'; pin.style.top = p.y + '%';
      };
      const up = () => {
        pin.classList.remove('dragging');
        pin.removeEventListener('pointermove', move);
        pin.removeEventListener('pointerup', up);
        pin.removeEventListener('pointercancel', up);
      };
      pin.addEventListener('pointermove', move);
      pin.addEventListener('pointerup', up);
      pin.addEventListener('pointercancel', up);
    });

    // 그리기
    const draw = $('#draw', root);
    draw?.addEventListener('pointerdown', (e) => {
      if (t.mode !== 'draw') return;
      e.preventDefault();
      draw.setPointerCapture(e.pointerId);
      const start = rectPct(e);
      const stroke = { type: t.tool, color: t.color, points: [[start.x, start.y]] };
      t.strokes.push(stroke);
      const move = (ev) => {
        const p = rectPct(ev);
        if (t.tool === 'free') {
          const last = stroke.points[stroke.points.length - 1];
          if (Math.hypot(p.x - last[0], p.y - last[1]) < 1) return;
          stroke.points.push([p.x, p.y]);
        } else {
          stroke.points[1] = [p.x, p.y];
        }
        renderStrokes();
      };
      const up = () => {
        draw.removeEventListener('pointermove', move);
        draw.removeEventListener('pointerup', up);
        draw.removeEventListener('pointercancel', up);
        if (stroke.points.length < 2) t.strokes.pop();
        renderStrokes();
      };
      draw.addEventListener('pointermove', move);
      draw.addEventListener('pointerup', up);
      draw.addEventListener('pointercancel', up);
    });
  }

  /* ---------- 저장 / 불러오기 ---------- */
  function saveTactic() {
    const g = currentMatch();
    ctx.openModal(`
      <h3>전술 저장</h3>
      <div class="field"><label>제목</label><input id="f-title" type="text" placeholder="예: 전반 4-3-3 압박" value="${esc(t.title)}"></div>
      <div style="font-size:12.5px;color:var(--text-2)">${esc(fmtDate(g.date))} · ${esc(t.teamLabel || '전체 참석자')} · ${esc(t.formation)}</div>
      <div class="foot">
        <button class="btn ghost" data-act="cancel">취소</button>
        <button class="btn primary" data-act="ok">저장</button>
      </div>`, (m) => {
      m.addEventListener('click', (e) => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (!act) return;
        if (act === 'cancel') return ctx.closeModal();
        const title = $('#f-title', m).value.trim() || `${t.formation} 전술`;
        const saved = store.tactics.save({
          id: t.editingId || undefined,
          matchId: g.id, team: t.teamIdx, teamLabel: t.teamLabel, formation: t.formation, title, note: t.note || '',
          pins: t.pins.map((p) => ({ ...p })), strokes: t.strokes.map((s) => ({ ...s, points: s.points.map((q) => [...q]) })),
        });
        t.editingId = saved.id; t.title = title;
        ctx.closeModal();
        toast('전술을 저장했습니다');
        render();
      });
    });
  }

  function loadTactic(id) {
    const s = store.tactics.byId(id);
    if (!s) return;
    t.matchId = s.matchId; t.teamIdx = s.team; t.formation = s.formation; t.teamLabel = s.teamLabel;
    t.pins = (s.pins || []).map((p) => ({ ...p }));
    t.strokes = (s.strokes || []).map((x) => ({ ...x, points: (x.points || []).map((q) => [...q]) }));
    t.title = s.title; t.editingId = s.id; t.note = s.note || '';
    render();
    toast(`"${s.title}" 불러옴`);
  }

  /* ---------- PNG ---------- */
  async function exportPNG() {
    const g = currentMatch();
    const W = 760; const PH = Math.round(W * 1.5); const HEAD = 96;
    const c = document.createElement('canvas');
    c.width = W; c.height = PH + HEAD + 56;
    const x = c.getContext('2d');
    x.fillStyle = '#f7f4ee'; x.fillRect(0, 0, c.width, c.height);
    // 헤더
    x.fillStyle = '#241f1a';
    x.font = '900 30px -apple-system, Malgun Gothic, sans-serif';
    x.fillText(t.title || `${t.formation} 전술`, 24, 44);
    x.fillStyle = '#6b6255';
    x.font = '700 20px -apple-system, Malgun Gothic, sans-serif';
    x.fillText(`웃을산 FC · ${fmtDate(g.date)} · ${t.teamLabel || '전체 참석자'} · ${t.formation}`, 24, 76);

    const oy = HEAD;
    // 잔디
    const grad = x.createLinearGradient(0, oy, 0, oy + PH);
    grad.addColorStop(0, '#3a9b66'); grad.addColorStop(1, '#2b7f52');
    x.fillStyle = grad; x.fillRect(0, oy, W, PH);
    x.fillStyle = 'rgba(255,255,255,.04)';
    for (let i = 0; i < 6; i += 1) x.fillRect(0, oy + (i * PH) / 6, W, PH / 12);
    const sx = (v) => (v / 100) * W;
    const sy = (v) => oy + (v / 150) * PH;
    x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 2.5;
    x.strokeRect(sx(4), sy(4), sx(92), sy(146) - sy(4));
    x.beginPath(); x.moveTo(sx(4), sy(75)); x.lineTo(sx(96), sy(75)); x.stroke();
    x.beginPath(); x.ellipse(sx(50), sy(75), sx(14), sy(89) - sy(75), 0, 0, Math.PI * 2); x.stroke();
    x.strokeRect(sx(24), sy(4), sx(52), sy(24) - sy(4));
    x.strokeRect(sx(24), sy(126), sx(52), sy(146) - sy(126));

    // 선
    for (const s of t.strokes) {
      x.strokeStyle = s.color; x.lineWidth = 5; x.lineCap = 'round'; x.lineJoin = 'round';
      x.beginPath();
      s.points.forEach((p, i) => { const px = sx(p[0]); const py = oy + (p[1] / 100) * PH; i ? x.lineTo(px, py) : x.moveTo(px, py); });
      x.stroke();
      if (s.type === 'arrow' && s.points.length > 1) {
        const a0 = s.points[s.points.length - 2]; const a1 = s.points[s.points.length - 1];
        const X1 = sx(a0[0]); const Y1 = oy + (a0[1] / 100) * PH;
        const X2 = sx(a1[0]); const Y2 = oy + (a1[1] / 100) * PH;
        const ang = Math.atan2(Y2 - Y1, X2 - X1); const L = 22;
        x.fillStyle = s.color;
        x.beginPath();
        x.moveTo(X2, Y2);
        x.lineTo(X2 - L * Math.cos(ang - 0.42), Y2 - L * Math.sin(ang - 0.42));
        x.lineTo(X2 - L * Math.cos(ang + 0.42), Y2 - L * Math.sin(ang + 0.42));
        x.closePath(); x.fill();
      }
    }
    // 핀
    t.pins.forEach((p, i) => {
      const px = sx(p.x); const py = oy + (p.y / 100) * PH;
      x.beginPath(); x.arc(px, py, 20, 0, Math.PI * 2);
      x.fillStyle = p.gk ? '#f2b705' : (t.teamColor || '#1f7a4d');
      x.fill();
      x.lineWidth = 3; x.strokeStyle = 'rgba(255,255,255,.9)'; x.stroke();
      x.fillStyle = '#fff'; x.font = '900 16px -apple-system, sans-serif'; x.textAlign = 'center';
      x.fillText(p.gk ? 'GK' : String(i), px, py + 6);
      x.font = '800 17px -apple-system, Malgun Gothic, sans-serif';
      const w = x.measureText(p.name).width;
      x.fillStyle = 'rgba(0,0,0,.45)';
      x.fillRect(px - w / 2 - 7, py + 24, w + 14, 24);
      x.fillStyle = '#fff';
      x.fillText(p.name, px, py + 41);
      x.textAlign = 'left';
    });
    x.fillStyle = '#9a9183'; x.font = '600 16px -apple-system, Malgun Gothic, sans-serif';
    x.fillText(`웃을산 FC 앱 ${APP_VERSION}`, 24, c.height - 14);

    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    await shareOrDownload(new File([blob], `웃을산FC_${g.date}_전술.png`, { type: 'image/png' }), blob);
  }

  /* ---------- AI 전술 추천 ---------- */
  function aiTacticsModal() {
    const g = currentMatch();
    const players = playersOf(g);
    if (players.length < 3) { toast('선수가 더 필요합니다', 'err'); return; }
    if (!AI.hasKey()) { document.getElementById('ai-tactics-box').innerHTML = ctx.aiKeyNotice(); return; }
    ctx.openModal(`
      <h3>AI 전술 추천</h3>
      <div style="font-size:12.5px;color:var(--text-2);margin-bottom:10px">${esc(t.teamLabel || '팀')} · ${players.length}명 기준으로 포메이션과 자리, 지시를 받아옵니다.</div>
      <div class="field"><label>상대 특징 / 우리 약점 (선택)</label>
        <input type="text" id="f-ai-note" placeholder="예: 상대 공격수가 빠름, 우리는 수비 뒷공간이 약함"></div>
      <div id="ai-tac-modal-box"></div>
      <div class="foot">
        <button class="btn ghost" data-act="close">닫기</button>
        <button class="btn primary" data-act="go">추천 받기</button>
      </div>`, (m) => {
      m.addEventListener('click', async (e) => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'close') return ctx.closeModal();
        if (act !== 'go') return;
        const note = m.querySelector('#f-ai-note').value.trim();
        const formations = presetsFor(players.length).map((x) => x.name);
        const r = await aiRun('#ai-tac-modal-box', 'AI가 전술을 짜는 중',
          AI.tacticsPrompt({ players, teamLabel: t.teamLabel || '팀', formations, note }),
          (res) => {
            const j = res.json;
            t._aiSuggestion = j;
            const pins = Array.isArray(j.pins) ? j.pins : [];
            return `<div class="ai-card">
              <div class="ai-head"><b>${esc(j.formation || '')} 추천</b></div>
              <div class="ai-body">
                ${AI.renderMini((j.instructions || []).map((x) => '- ' + x).join('\n'), esc)}
                <div class="ai-sub">자리 배치</div>
                <div class="s">${esc(pins.map((p) => `${p.name}(${p.role || '-'})`).join(', '))}</div>
              </div>
              <div class="row" style="padding:0 12px 12px">
                <button class="btn primary grow" data-act="apply">전술판에 적용</button>
              </div>
              ${aiCostLine(res)}
            </div>`;
          }, { json: true });
        if (!r) return;
        m.querySelector('[data-act="apply"]')?.addEventListener('click', () => {
          applyAITactic(t._aiSuggestion, players);
          ctx.closeModal();
        });
      });
    });
  }

  /** AI 응답(0~1 좌표) → 핀 배치 + 지시문 메모 */
  function applyAITactic(j, players) {
    if (!j) return;
    const byName = new Map(players.map((p) => [p.name, p]));
    const used = new Set();
    const pins = [];
    for (const raw of j.pins || []) {
      const p = byName.get(String(raw.name || '').trim());
      if (!p || used.has(p.id)) continue;
      used.add(p.id);
      pins.push({
        memberId: p.id, name: p.name, gk: !!p.gk,
        x: Math.min(97, Math.max(3, Number(raw.x) * 100 || 50)),
        y: Math.min(98, Math.max(4, Number(raw.y) * 100 || 50)),
        role: raw.role || '',
      });
    }
    // 빠진 선수는 대기줄에
    const rest = players.filter((p) => !used.has(p.id));
    rest.forEach((p, i) => pins.push({
      memberId: p.id, name: p.name, gk: !!p.gk,
      x: Math.round(((i + 1) * 100) / (rest.length + 1)), y: 95,
    }));
    if (!pins.length) { toast('적용할 자리가 없습니다', 'err'); return; }
    if (j.formation && PRESETS.some((x) => x.name === j.formation)) t.formation = j.formation;
    t.pins = pins;
    t.note = (j.instructions || []).join('\n');
    t.title = t.title || `AI ${j.formation || ''} 전술`;
    render();
    toast(`AI 전술 적용 (빠진 선수 ${rest.length}명은 대기줄)`);
  }

  /* ---------- 이벤트 ---------- */
  root.addEventListener('click', async (e) => {
    const el = e.target;
    if (el.closest('#m-move')) { t.mode = 'move'; return render(); }
    if (el.closest('#m-draw')) { t.mode = 'draw'; return render(); }
    const tool = el.closest('[data-tool]');
    if (tool) { t.tool = tool.dataset.tool; return render(); }
    const sw = el.closest('[data-color]');
    if (sw) { t.color = sw.dataset.color; return render(); }
    if (el.closest('#t-undo')) { t.strokes.pop(); return renderStrokes(); }
    if (el.closest('#t-clear')) {
      if (!t.strokes.length) return;
      if (await confirmDialog({ title: '그린 선을 모두 지울까요?', ok: '지우기', danger: true })) { t.strokes = []; renderStrokes(); }
      return;
    }
    if (el.closest('#t-reset')) return resetLayout(true);
    if (el.closest('#t-save')) return saveTactic();
    if (el.closest('#t-png')) return exportPNG();
    if (el.closest('#t-ai')) return aiTacticsModal();
    const ld = el.closest('[data-load]');
    if (ld) return loadTactic(ld.dataset.load);
    const dl = el.closest('[data-del]');
    if (dl) {
      const s = store.tactics.byId(dl.dataset.del);
      if (await confirmDialog({ title: `"${s?.title || '전술'}"을 삭제할까요?`, ok: '삭제', danger: true })) {
        store.tactics.remove(dl.dataset.del);
        if (t.editingId === dl.dataset.del) t.editingId = null;
        toast('삭제했습니다'); render();
      }
    }
  });

  root.addEventListener('change', (e) => {
    if (e.target.id === 'tac-match') { t.matchId = e.target.value; t.pins = []; t.strokes = []; t.editingId = null; render(); }
    if (e.target.id === 'tac-team') { t.teamIdx = Number(e.target.value); t.pins = []; t.editingId = null; render(); }
    if (e.target.id === 'tac-formation') { t.formation = e.target.value; resetLayout(true); }
  });

  document.addEventListener('app:tab', (e) => { if (e.detail === 'tactics') render(); });
  if (document.getElementById('view-tactics').classList.contains('active')) render();
  else root.innerHTML = '<div class="empty">불러오는 중…</div>';

  window.__tactics = { t, render, layout, presetsFor };
}
