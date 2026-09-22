/* 웃을산 FC — 팀 자동 밸런스 (순수 함수, 테스트 가능)
 * 규칙
 *  1) GK는 팀당 1명 우선 분산 (GK 수가 팀 수보다 적으면 있는 만큼만)
 *  2) 인원 균등 (팀 간 인원 차 ≤ 1)
 *  3) 실력 내림차순 스네이크 드래프트로 1차 배분
 *  4) 전력합 차이를 줄이는 국소 교환(hill climbing)
 *  5) 매번 같은 조합이 안 나오도록 동점자 소량 셔플 (seed 지정 시 재현 가능)
 */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function teamSizeCaps(n, teamCount) {
  const base = Math.floor(n / teamCount);
  const rem = n % teamCount;
  return Array.from({ length: teamCount }, (_, i) => base + (i < rem ? 1 : 0));
}

function sum(list) { return list.reduce((a, p) => a + (Number(p.skill) || 0), 0); }

/**
 * @param {Array<{id:string,name:string,skill:number,gk:boolean}>} players
 * @param {number} teamCount 2 또는 3
 * @param {{seed?:number, iterations?:number}} opts
 * @returns {{teams: Array<Array>, stats: Array<{total:number,avg:number,gk:number,size:number}>, spread:number}}
 */
export function balanceTeams(players, teamCount = 2, opts = {}) {
  const seed = opts.seed ?? (Date.now() ^ Math.floor(Math.random() * 1e9));
  const rnd = mulberry32(seed);
  const tc = Math.max(2, Math.min(3, teamCount | 0));
  const pool = players.map((p) => ({
    id: p.id, name: p.name, gk: !!p.gk,
    skill: Math.min(5, Math.max(1, Number(p.skill) || 3)),
    pos: p.pos || 'MF',
  }));

  if (pool.length === 0) {
    return { teams: Array.from({ length: tc }, () => []), stats: emptyStats(tc), spread: 0, seed };
  }

  const caps = teamSizeCaps(pool.length, tc);
  const teams = Array.from({ length: tc }, () => []);

  // 동점자 셔플: skill 내림차순 + 소량 난수 tie-break
  const keyed = pool.map((p) => ({ p, k: p.skill + rnd() * 0.9 }));
  keyed.sort((a, b) => b.k - a.k);
  const sorted = keyed.map((x) => x.p);

  // 1) GK 우선 분산
  const gks = sorted.filter((p) => p.gk);
  const rest = sorted.filter((p) => !p.gk);
  const gkOrder = shuffleTeamOrder(tc, rnd);
  let gi = 0;
  for (const g of gks) {
    if (gi < tc) { teams[gkOrder[gi]].push(g); gi += 1; }
    else rest.push(g); // 남는 GK는 일반 풀로
  }
  if (gi < tc) {
    // GK가 모자라면 그대로 진행 (표시에서 'GK 없음' 경고)
  }
  rest.sort((a, b) => b.skill - a.skill || rnd() - 0.5);

  // 2) 스네이크 드래프트 — 매 픽마다 (여유 있는 팀 중) 전력합 최저 팀에 배정
  for (const p of rest) {
    let best = -1; let bestScore = Infinity;
    for (let t = 0; t < tc; t += 1) {
      if (teams[t].length >= caps[t]) continue;
      const score = sum(teams[t]) * 10 + teams[t].length + rnd() * 0.01;
      if (score < bestScore) { bestScore = score; best = t; }
    }
    if (best < 0) best = teams.reduce((m, t, i) => (t.length < teams[m].length ? i : m), 0);
    teams[best].push(p);
  }

  // 3) 국소 교환으로 전력 편차 최소화 (GK 수·인원 유지)
  hillClimb(teams, opts.iterations ?? 2000, rnd);

  return { teams, stats: statsOf(teams), spread: spreadOf(teams), seed };
}

function shuffleTeamOrder(tc, rnd) {
  const arr = Array.from({ length: tc }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function hillClimb(teams, iterations, rnd) {
  const tc = teams.length;
  if (tc < 2) return;
  let best = spreadOf(teams);
  for (let it = 0; it < iterations && best > 0; it += 1) {
    const a = Math.floor(rnd() * tc);
    let b = Math.floor(rnd() * tc);
    if (a === b) b = (b + 1) % tc;
    if (!teams[a].length || !teams[b].length) continue;
    const i = Math.floor(rnd() * teams[a].length);
    const j = Math.floor(rnd() * teams[b].length);
    const pa = teams[a][i]; const pb = teams[b][j];
    if (pa.skill === pb.skill) continue;
    if (pa.gk !== pb.gk) continue; // GK 분산 유지: GK는 GK끼리만 교환
    teams[a][i] = pb; teams[b][j] = pa;
    const next = spreadOf(teams);
    if (next < best) best = next;
    else { teams[a][i] = pa; teams[b][j] = pb; } // 되돌리기
  }
}

function spreadOf(teams) {
  const totals = teams.map((t) => sum(t));
  return Math.max(...totals) - Math.min(...totals);
}

function statsOf(teams) {
  return teams.map((t) => ({
    size: t.length,
    total: sum(t),
    avg: t.length ? Math.round((sum(t) / t.length) * 10) / 10 : 0,
    gk: t.filter((p) => p.gk).length,
  }));
}

function emptyStats(tc) {
  return Array.from({ length: tc }, () => ({ size: 0, total: 0, avg: 0, gk: 0 }));
}

export { statsOf, spreadOf };

/** 참석 인원에 따른 권장 팀 수 (≤14명 → 2팀, 그 이상 → 3팀) */
export function suggestTeamCount(n) {
  return n >= 15 ? 3 : 2;
}

/* ===================== 고정 4팀 → 합치기 제안 (v0.3.0) ===================== */

/** 선수 배열의 요약 통계 */
export function groupStat(players) {
  return {
    size: players.length,
    total: players.reduce((a, p) => a + (Number(p.skill) || 0), 0),
    avg: players.length ? Math.round((players.reduce((a, p) => a + (Number(p.skill) || 0), 0) / players.length) * 10) / 10 : 0,
    gk: players.filter((p) => p.gk).length,
    pos: ['FW', 'MF', 'DF'].reduce((o, k) => { o[k] = players.filter((p) => (p.pos || 'MF') === k).length; return o; }, {}),
  };
}

/**
 * 참석자가 있는 소속 팀들을 groupCount 개의 묶음으로 나누는 모든 경우를 만들고 점수화.
 * 점수(낮을수록 좋음) = 전력합 편차*10 + 인원 편차*4 + GK 없는 묶음*25
 * @param {Object} byTeam  { A: [players], B: [...], ... } — 참석자만
 * @param {number} groupCount 2~4
 * @returns {Array<{groups: string[][], stats, spread, sizeSpread, gkMissing, score}>} 점수 오름차순
 */
export function suggestMerges(byTeam, groupCount) {
  const keys = Object.keys(byTeam).filter((k) => (byTeam[k] || []).length > 0);
  const gc = Math.max(1, Math.min(keys.length, groupCount | 0));
  const out = [];
  const assign = new Array(keys.length).fill(0);

  // 정규형(첫 등장 순서) 열거로 같은 분할의 순열 중복 제거
  const walk = (i, used) => {
    if (i === keys.length) {
      if (used !== gc) return;
      const groups = Array.from({ length: gc }, () => []);
      keys.forEach((k, j) => groups[assign[j]].push(k));
      out.push(evaluateGroups(groups, byTeam));
      return;
    }
    for (let g = 0; g <= Math.min(used, gc - 1); g += 1) {
      assign[i] = g;
      walk(i + 1, g === used ? used + 1 : used);
    }
  };
  walk(0, 0);

  out.sort((a, b) => a.score - b.score
    || a.groups.length - b.groups.length
    || a.groups.map((x) => x.join()).join('|').localeCompare(b.groups.map((x) => x.join()).join('|')));
  return out;
}

export function evaluateGroups(groups, byTeam) {
  const players = groups.map((keys) => keys.flatMap((k) => byTeam[k] || []));
  const stats = players.map(groupStat);
  const totals = stats.map((s) => s.total);
  const sizes = stats.map((s) => s.size);
  const spread = Math.max(...totals) - Math.min(...totals);
  const sizeSpread = Math.max(...sizes) - Math.min(...sizes);
  const gkMissing = stats.filter((s) => s.gk === 0).length;
  return {
    groups, stats, players, spread, sizeSpread, gkMissing,
    score: spread * 10 + sizeSpread * 4 + gkMissing * 25,
  };
}

/** 참석 인원 → 권장 팀 묶음 수 (고정 4팀 기준) */
export function suggestGroupCount(n, availableTeams = 4) {
  const want = n >= 24 ? 4 : n >= 15 ? 3 : 2;
  return Math.max(2, Math.min(availableTeams, want));
}

/** 한 팀이 경기하기에 부족한지 (5명 미만이거나 GK 없음) */
export function teamShortage(stat) {
  const reasons = [];
  if (stat.size < 5) reasons.push('인원 부족');
  if (stat.gk === 0) reasons.push('GK 없음');
  return reasons;
}
