/* 웃을산 FC — AI 모듈 (Anthropic Messages API 브라우저 직접 호출)
 *
 * 근거 (claude-api 스킬 / SDK 소스 확인, 2026-09-22):
 *  - 엔드포인트: POST https://api.anthropic.com/v1/messages
 *  - 필수 헤더: x-api-key, anthropic-version: 2023-06-01, content-type: application/json
 *  - 브라우저에서 직접 호출하려면: anthropic-dangerous-direct-browser-access: true
 *    (TypeScript SDK 의 dangerouslyAllowBrowser 가 붙이는 헤더와 동일)
 *  - 모델: claude-sonnet-5 (입력 $2 / 출력 $10 per MTok), claude-haiku-4-5 (입력 $1 / 출력 $5)
 *  - Sonnet 5 는 thinking 을 쓰면 {type:'adaptive'} 만 허용(budget_tokens 는 400),
 *    effort 는 output_config.effort. Haiku 4.5 는 effort 미지원이라 보내지 않는다.
 *  - 어시스턴트 prefill 금지(400). 그래서 JSON 은 프롬프트 지시 + 관대한 파서로 받는다.
 *
 * ⚠ API 키는 이 파일이나 저장소에 절대 넣지 않는다. 사용자의 브라우저 localStorage
 *   (`woosulsan-fc:ai`, 앱 데이터와 별도 키) 에만 저장하고, 앱 JSON 내보내기에는 포함하지 않는다.
 */

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const SETTINGS_KEY = 'woosulsan-fc:ai'; // 앱 데이터(woosulsan-fc:v1)와 분리 → 내보내기에 안 섞임
const TIMEOUT_MS = 30000;

export const AI_MODELS = [
  { id: 'claude-sonnet-5', label: 'Sonnet 5 (기본)', note: '품질 우선', inPrice: 2, outPrice: 10 },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5 (절약)', note: '값이 1/2', inPrice: 1, outPrice: 5 },
];
export const DEFAULT_MODEL = AI_MODELS[0].id;

/* ---------------- 설정(키·모델) ---------------- */
export function getSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const s = raw ? JSON.parse(raw) : {};
    return {
      key: typeof s.key === 'string' ? s.key : '',
      model: AI_MODELS.some((m) => m.id === s.model) ? s.model : DEFAULT_MODEL,
    };
  } catch (e) {
    return { key: '', model: DEFAULT_MODEL };
  }
}
export function saveSettings(patch) {
  const next = Object.assign(getSettings(), patch);
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch (e) { /* 저장 불가 */ }
  return next;
}
export function clearKey() {
  const s = getSettings();
  saveSettings({ key: '', model: s.model });
}
export function hasKey() { return !!getSettings().key; }
export function maskKey(key) {
  const k = key || getSettings().key;
  if (!k) return '';
  return k.length <= 12 ? '••••' : `${k.slice(0, 7)}…${k.slice(-4)}`;
}

/* ---------------- 호출 ---------------- */
export class AIError extends Error {
  constructor(message, { status = 0, kind = 'unknown', detail = '' } = {}) {
    super(message);
    this.name = 'AIError';
    this.status = status; this.kind = kind; this.detail = detail;
  }
}

function explain(status, detail) {
  switch (status) {
    case 401: return new AIError('API 키가 잘못되었거나 만료되었습니다. 설정에서 키를 다시 입력해 주세요.', { status, kind: 'auth', detail });
    case 403: return new AIError('이 키로는 브라우저 직접 호출이 거부되었습니다(권한 또는 조직 설정). 콘솔에서 키 권한을 확인해 주세요.', { status, kind: 'forbidden', detail });
    case 400: return new AIError('요청 형식 오류입니다. 모델을 바꾸거나 잠시 후 다시 시도해 주세요.', { status, kind: 'bad_request', detail });
    case 404: return new AIError('모델을 찾을 수 없습니다. 설정에서 다른 모델을 선택해 주세요.', { status, kind: 'not_found', detail });
    case 429: return new AIError('사용량 한도에 걸렸습니다. 잠시 후 다시 시도해 주세요.', { status, kind: 'rate_limit', detail });
    default:
      if (status >= 500) return new AIError('Anthropic 서버 오류입니다. 잠시 후 다시 시도해 주세요.', { status, kind: 'server', detail });
      return new AIError(`알 수 없는 오류 (${status})`, { status, kind: 'unknown', detail });
  }
}

/**
 * Messages API 1회 호출.
 * @returns {{text:string, usage:object, stopReason:string, model:string, costUsd:number}}
 */
export async function callClaude({ system, messages, maxTokens = 1500, signal, model } = {}) {
  const s = getSettings();
  if (!s.key) throw new AIError('API 키가 없습니다. 설정에서 키를 입력해 주세요.', { kind: 'no_key' });
  const useModel = model || s.model;

  const body = {
    model: useModel,
    max_tokens: maxTokens,
    messages,
  };
  if (system) body.system = system;
  // effort 는 Sonnet 5 에서만 (Haiku 4.5 는 미지원 → 보내면 오류)
  if (useModel.startsWith('claude-sonnet-5')) body.output_config = { effort: 'low' };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort('timeout'), TIMEOUT_MS);
  if (signal) signal.addEventListener('abort', () => ctrl.abort('cancel'), { once: true });

  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': s.key,
        'anthropic-version': API_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (ctrl.signal.reason === 'cancel' || signal?.aborted) throw new AIError('취소했습니다.', { kind: 'cancelled' });
    if (ctrl.signal.reason === 'timeout') throw new AIError('30초 안에 응답이 없어 중단했습니다. 네트워크를 확인해 주세요.', { kind: 'timeout' });
    throw new AIError('네트워크에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.', { kind: 'network', detail: String(e?.message || e) });
  }
  clearTimeout(timer);

  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = j?.error?.message || ''; } catch (e) { /* 본문 없음 */ }
    throw explain(res.status, detail);
  }

  const data = await res.json();
  if (data.stop_reason === 'refusal') {
    throw new AIError('모델이 이 요청에 답하지 않았습니다. 질문을 바꿔서 다시 시도해 주세요.', { kind: 'refusal' });
  }
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  const usage = data.usage || {};
  return {
    text,
    usage,
    stopReason: data.stop_reason,
    model: data.model || useModel,
    truncated: data.stop_reason === 'max_tokens',
    costUsd: estimateCost(useModel, usage),
  };
}

export function estimateCost(modelId, usage = {}) {
  const m = AI_MODELS.find((x) => x.id === modelId) || AI_MODELS[0];
  const inTok = usage.input_tokens || 0;
  const outTok = usage.output_tokens || 0;
  return (inTok / 1e6) * m.inPrice + (outTok / 1e6) * m.outPrice;
}
export function formatCost(usd) {
  if (!usd) return '';
  const krw = Math.round(usd * 1400);
  return `약 ${krw < 1 ? '1원 미만' : krw + '원'}`;
}

/** 연결 테스트 — 아주 짧은 호출로 200 확인 */
export async function testConnection() {
  try {
    const r = await callClaude({
      messages: [{ role: 'user', content: 'ping 이라고만 답해 주세요.' }],
      maxTokens: 16,
    });
    return { ok: true, message: `연결 성공 · ${r.model}`, cost: r.costUsd };
  } catch (e) {
    return { ok: false, message: e.message, status: e.status || 0, kind: e.kind };
  }
}

/* ---------------- JSON 응답 파싱 ---------------- */
/** 모델이 설명을 곁들여도 첫 JSON 블록만 뽑아낸다 */
export function extractJSON(text) {
  if (!text) throw new AIError('빈 응답입니다.', { kind: 'parse' });
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start < 0) throw new AIError('AI 응답에서 데이터를 읽지 못했습니다. 다시 시도해 주세요.', { kind: 'parse', detail: text.slice(0, 200) });
  const opens = { '{': '}', '[': ']' };
  const open = candidate[start];
  const close = opens[open];
  let depth = 0; let inStr = false; let esc = false;
  for (let i = start; i < candidate.length; i += 1) {
    const c = candidate[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth += 1;
    else if (c === close) {
      depth -= 1;
      if (depth === 0) {
        try { return JSON.parse(candidate.slice(start, i + 1)); }
        catch (e) { throw new AIError('AI 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.', { kind: 'parse', detail: String(e.message) }); }
      }
    }
  }
  throw new AIError('AI 응답이 중간에 끊겼습니다. 다시 시도해 주세요.', { kind: 'parse' });
}

/** JSON 을 기대하는 호출 */
export async function askJSON(opts) {
  const r = await callClaude(opts);
  return { ...r, json: extractJSON(r.text) };
}

/* ---------------- 앱 데이터 → 컨텍스트 요약 ---------------- */
const GUARD = '제공된 데이터에 없는 사실(이름·기록·결과·부상 등)은 절대 지어내지 마세요. 모르면 모른다고 쓰세요.';

/** 회원 요약 (연락처 등 민감정보는 원래 저장하지 않지만, 필요한 필드만 골라 보낸다) */
function memberBrief(m, store) {
  const st = store.stats.attendance(m.id);
  return {
    이름: m.name,
    실력: m.skill,
    포지션: m.pos,
    GK: !!m.gk,
    소속: m.team ? store.club.teamName(m.team) : '미배정',
    나이: m.birthYear ? new Date().getFullYear() - m.birthYear : null,
    출석률: st.rate == null ? null : st.rate,
  };
}

export function buildClubContext(store, { matchId = null, includeMembers = true } = {}) {
  const ctx = {
    모임: store.get().club.name,
    전체회원수: store.members.active().length,
  };
  if (includeMembers) ctx.회원 = store.members.active().map((m) => memberBrief(m, store));
  if (matchId) {
    const g = store.matches.byId(matchId);
    if (g) {
      const att = store.matches.teamAttendance(g.id);
      ctx.경기 = {
        날짜: g.date, 시간: g.time, 장소: g.place || '미정', 상태: g.status,
        참석자수: store.matches.attendees(g.id).length,
        팀별참석: Object.fromEntries(['A', 'B', 'C', 'D'].map((k) => [store.club.teamName(k), att[k].map((m) => m.name)])),
        미배정참석: att.none.map((m) => m.name),
      };
    }
  }
  return ctx;
}

/* ---------------- 기능별 프롬프트 ---------------- */

/** 1) AI 팀 코치 */
export function teamCoachPrompt({ store, matchId, candidates, groupCount }) {
  const g = store.matches.byId(matchId);
  const att = store.matches.teamAttendance(matchId);
  const teams = {};
  for (const k of ['A', 'B', 'C', 'D']) {
    if (!att[k].length) continue;
    teams[store.club.teamName(k)] = att[k].map((m) => ({ 이름: m.name, 실력: m.skill, 포지션: m.pos, GK: !!m.gk, 나이: m.birthYear ? new Date().getFullYear() - m.birthYear : null }));
  }
  if (att.none.length) teams['미배정'] = att.none.map((m) => ({ 이름: m.name, 실력: m.skill, 포지션: m.pos, GK: !!m.gk, 나이: m.birthYear ? new Date().getFullYear() - m.birthYear : null }));

  const data = {
    경기: { 날짜: g.date, 장소: g.place || '미정' },
    오늘팀수: groundCountSafe(groupCount),
    소속팀별참석자: teams,
    앱이_계산한_합치기후보: (candidates || []).map((c) => ({
      묶음: c.groups.map((grp) => grp.map((k) => (k === 'none' ? '미배정' : store.club.teamName(k))).join('+')),
      전력합: c.stats.map((s) => s.total),
      인원: c.stats.map((s) => s.size),
      GK수: c.stats.map((s) => s.gk),
    })),
  };
  return {
    system: `당신은 한국 동호회 축구 모임의 팀 편성 코치입니다. 실력(1~5)·포지션·GK 유무·인원을 고려해 오늘 경기의 팀을 추천합니다. ${GUARD}
반드시 아래 JSON 하나만 출력하세요. 설명 문장은 JSON 안에만 넣습니다.
{"teams":[{"name":"팀 이름","members":["이름",...]}],"reasons":["이유 3줄"],"cautions":["주의점"]}
- members 에는 제공된 참석자 이름만, 한 사람은 한 팀에만 넣습니다. 전원을 배정하세요.
- 팀 수는 "오늘팀수"와 같아야 합니다.
- reasons 는 정확히 3개, cautions 는 1~3개(GK 공백·전력 쏠림·인원 차이 등).`,
    messages: [{ role: 'user', content: JSON.stringify(data, null, 1) }],
    maxTokens: 1500,
  };
}
function groundCountSafe(n) { return Math.max(2, Math.min(4, Number(n) || 3)); }

/** 2) AI 전술 추천 */
export function tacticsPrompt({ players, teamLabel, formations, note }) {
  const data = {
    팀: teamLabel,
    인원: players.length,
    선수: players.map((p) => ({ 이름: p.name, 실력: p.skill, 포지션: p.pos, GK: !!p.gk })),
    선택가능_포메이션: formations,
    사용자메모: note || '',
  };
  return {
    system: `당신은 한국 동호회 축구 팀의 전술 코치입니다. ${GUARD}
반드시 아래 JSON 하나만 출력하세요.
{"formation":"선택가능_포메이션 중 하나","pins":[{"name":"선수 이름","x":0.5,"y":0.9,"role":"GK/CB/CM/ST 등"}],"instructions":["핵심 지시 3~5개"]}
- 좌표는 0~1 정규화. x=0 왼쪽, x=1 오른쪽. y=0 상대 골대(공격 방향), y=1 우리 골대.
- 골키퍼는 y 0.90 이상 가운데. 수비는 y 0.65~0.8, 미드필더 0.4~0.6, 공격 0.15~0.35 근처.
- pins 에는 제공된 선수 전원을 한 번씩만 넣습니다(교체 인원이 많으면 y 0.97 줄에 나란히).
- instructions 는 한 줄 30자 안팎의 한국어 지시.`,
    messages: [{ role: 'user', content: JSON.stringify(data, null, 1) }],
    maxTokens: 2000,
  };
}

/** 3) 공지문 / 총평 */
export function noticePrompt({ store, matchId, mode = 'notice', tone = '짧게' }) {
  const ctx = buildClubContext(store, { matchId, includeMembers: false });
  const g = store.matches.byId(matchId);
  const plan = g?.teams?.length
    ? g.teams.map((ids, i) => ({
      팀: (g.teamPlan?.groups?.[i] || []).map((k) => (k === 'none' ? '미배정' : store.club.teamName(k))).join('+') || `${i + 1}조`,
      선수: ids.map((id) => store.members.byId(id)?.name).filter(Boolean),
    }))
    : null;
  const toneGuide = { '짧게': '3~5줄로 짧고 담백하게', '유쾌하게': '친근하고 유쾌하게, 이모지 2~3개까지', '정중하게': '정중한 존댓말로 단정하게' }[tone] || '짧고 담백하게';
  return {
    system: `당신은 축구 동호회 총무입니다. 단톡방에 그대로 붙여넣을 한국어 ${mode === 'review' ? '경기 총평' : '경기 공지문'}을 씁니다.
${toneGuide} 쓰세요. 제목 줄 + 본문 형식, 마크다운 표는 쓰지 마세요. ${GUARD}
${mode === 'review' ? '결과 데이터가 없으면 점수·득점자를 지어내지 말고 참석·팀 구성 중심으로 씁니다.' : '준비물·시간·장소는 제공된 값만 씁니다.'}
JSON 없이 본문만 출력하세요.`,
    messages: [{ role: 'user', content: JSON.stringify({ ...ctx, 오늘의팀: plan }, null, 1) }],
    maxTokens: 1200,
  };
}

/** 4) 자유 질문 */
export function askPrompt({ store, question, history = [] }) {
  const ctx = buildClubContext(store, { includeMembers: true });
  const recentMatches = store.matches.sorted().slice(0, 6).map((g) => ({
    날짜: g.date, 장소: g.place, 상태: g.status,
    참석: store.matches.attendees(g.id).map((m) => m.name),
  }));
  return {
    system: `당신은 축구 동호회 운영을 돕는 비서입니다. 아래 모임 데이터만 근거로 한국어로 간결하게(5줄 이내) 답합니다. ${GUARD}
계산이 필요하면 직접 세어서 답하고, 이름을 나열할 때는 쉼표로 구분합니다.

[모임 데이터]
${JSON.stringify({ ...ctx, 최근경기: recentMatches }, null, 1)}`,
    messages: [...history.slice(-6), { role: 'user', content: question }],
    maxTokens: 1000,
  };
}

/* ---------------- 최소 마크다운 렌더 ---------------- */
export function renderMini(text, escFn) {
  const esc = escFn || ((s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const lines = String(text || '').split('\n');
  let html = ''; let inList = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const li = line.match(/^\s*[-*•]\s+(.*)$/);
    if (li) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${bold(esc(li[1]), esc)}</li>`;
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    if (!line.trim()) { html += '<div class="sp"></div>'; continue; }
    html += `<p>${bold(esc(line.replace(/^#{1,6}\s*/, '')), esc)}</p>`;
  }
  if (inList) html += '</ul>';
  return html;
}
function bold(escaped) {
  return escaped.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}
