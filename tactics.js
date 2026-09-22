/* 웃을산 FC — 전술판 (2단계에서 구현) */
export function initTactics(ctx) {
  const v = document.getElementById('view-tactics');
  if (v) {
    v.innerHTML = '<div class="empty"><div class="big">전술판 준비 중</div>'
      + '<div>포메이션·핀 배치·그림판은 다음 업데이트에서 열립니다.</div></div>';
  }
}
