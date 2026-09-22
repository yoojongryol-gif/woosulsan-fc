/* 웃을산 FC — 대외 경기 선발팀 (참석자 중 베스트 1팀)
 * 순수 함수. GK 1명 확보 → 포메이션 슬롯을 선호 포지션 + 종합 실력(+능력치 보조)으로 채움 → 나머지는 벤치.
 */

/** 인원수별 포메이션 (rows = 수비라인부터 공격라인까지, GK 별도) */
export const LINEUPS = [
  { size: 11, name: '4-3-3', rows: [4, 3, 3] },
  { size: 11, name: '4-4-2', rows: [4, 4, 2] },
  { size: 11, name: '3-5-2', rows: [3, 5, 2] },
  { size: 9, name: '3-3-2', rows: [3, 3, 2] },
  { size: 9, name: '4-3-1', rows: [4, 3, 1] },
  { size: 7, name: '2-3-1', rows: [2, 3, 1] },
  { size: 7, name: '3-2-1', rows: [3, 2, 1] },
  { size: 6, name: '2-2-1', rows: [2, 2, 1] },
  { size: 5, name: '1-2-1', rows: [1, 2, 1] },
];
export const LINEUP_SIZES = [...new Set(LINEUPS.map((l) => l.size))].sort((a, b) => b - a);
export function lineupsForSize(size) { return LINEUPS.filter((l) => l.size === Number(size)); }
export function findLineup(size, name) {
  return LINEUPS.find((l) => l.size === Number(size) && l.name === name) || lineupsForSize(size)[0] || LINEUPS[0];
}

/** 포메이션 → 슬롯 목록 [{role:'GK'|'DF'|'MF'|'FW', row, idx, x, y}] (x,y 는 0~100 %) */
export function slotsOf(lineup) {
  const slots = [{ role: 'GK', row: -1, idx: 0, x: 50, y: 91 }];
  const rows = lineup.rows;
  rows.forEach((count, r) => {
    const role = r === 0 ? 'DF' : (r === rows.length - 1 ? 'FW' : 'MF');
    const y = rows.length > 1 ? 74 - r * (50 / (rows.length - 1)) : 50;
    for (let i = 0; i < count; i += 1) {
      slots.push({ role, row: r, idx: i, x: Math.round(((i + 1) * 100) / (count + 1)), y: Math.round(y) });
    }
  });
  return slots;
}

const NEIGHBOR = { DF: ['MF'], MF: ['DF', 'FW'], FW: ['MF'], GK: [] };

/** 선수 × 슬롯 적합도 점수 */
export function fitScore(player, slot) {
  const skill = Number(player.skill) || 3;
  const a = player.abil || {};
  const v = (k) => (typeof a[k] === 'number' ? a[k] : null);
  let score = skill * 2;

  if (slot.role === 'GK') {
    score += player.gk ? 12 : -6;          // GK 가능 여부가 절대적
    if (player.pos === 'GK') score += 2;
    return score;
  }
  // 필드 선수는 GK 전용 자원을 아깝게 쓰지 않는다
  if (player.gk && player.pos === 'GK') score -= 2;

  if (player.pos === slot.role) score += 3;
  else if ((NEIGHBOR[slot.role] || []).includes(player.pos)) score += 1;
  else score -= 1;

  // 능력치 보조 (입력된 항목만, 최대 ±2 정도)
  const pair = slot.role === 'DF' ? ['defense', 'physical']
    : slot.role === 'FW' ? ['speed', 'shoot'] : ['basic', 'stamina'];
  const vals = pair.map(v).filter((x) => x != null);
  if (vals.length) score += (vals.reduce((x, y) => x + y, 0) / vals.length - 3) * 0.8;

  return score;
}

/**
 * 참석자 중 베스트 선발 구성
 * @returns {{lineup, slots:[{...slot, player}], starters:[], bench:[], warnings:[]}}
 */
export function bestLineup(players, size, formationName) {
  const lineup = findLineup(size, formationName);
  const slots = slotsOf(lineup);
  const pool = [...players];
  const warnings = [];

  const assigned = new Map();   // slotIndex → player
  const used = new Set();

  // 1) GK 슬롯 먼저 (GK 가능자 우선, 없으면 경고)
  const gkSlotIdx = slots.findIndex((s) => s.role === 'GK');
  const gkCandidates = pool.filter((p) => p.gk);
  if (gkCandidates.length) {
    const best = gkCandidates.sort((a, b) => fitScore(b, slots[gkSlotIdx]) - fitScore(a, slots[gkSlotIdx]))[0];
    assigned.set(gkSlotIdx, best); used.add(best.id);
  } else if (pool.length) {
    warnings.push('GK 가능한 참석자가 없어 실력이 가장 낮은 선수를 임시 배치했습니다.');
    const tmp = [...pool].sort((a, b) => (a.skill || 3) - (b.skill || 3))[0];
    assigned.set(gkSlotIdx, tmp); used.add(tmp.id);
  }

  // 2) 나머지 슬롯: (선수, 슬롯) 적합도 최댓값부터 그리디 배정
  const rest = slots.map((s, i) => i).filter((i) => i !== gkSlotIdx);
  const pairs = [];
  for (const si of rest) {
    for (const p of pool) {
      if (used.has(p.id)) continue;
      pairs.push({ si, p, score: fitScore(p, slots[si]) });
    }
  }
  pairs.sort((a, b) => b.score - a.score || (b.p.skill || 0) - (a.p.skill || 0));
  for (const { si, p } of pairs) {
    if (assigned.has(si) || used.has(p.id)) continue;
    assigned.set(si, p); used.add(p.id);
  }

  const filled = slots.map((s, i) => ({ ...s, player: assigned.get(i) || null }));
  const starters = filled.filter((s) => s.player).map((s) => s.player);
  const bench = pool.filter((p) => !used.has(p.id)).sort((a, b) => (b.skill || 0) - (a.skill || 0));

  if (starters.length < lineup.size) {
    warnings.push(`참석자가 ${starters.length}명이라 ${lineup.size}명 선발을 다 채우지 못했습니다.`);
  }
  return { lineup, slots: filled, starters, bench, warnings };
}

/** 대외 전적 계산: [{ourScore, theirScore}] → {w,d,l,recent:[]} */
export function recordOf(results) {
  const r = { w: 0, d: 0, l: 0, recent: [] };
  for (const x of results) {
    const a = Number(x.ours); const b = Number(x.theirs);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const mark = a > b ? 'W' : (a === b ? 'D' : 'L');
    if (mark === 'W') r.w += 1; else if (mark === 'D') r.d += 1; else r.l += 1;
    r.recent.push({ mark, ours: a, theirs: b, date: x.date || '' });
  }
  r.recent = r.recent.sort((p, q) => String(q.date).localeCompare(String(p.date))).slice(0, 5);
  return r;
}
