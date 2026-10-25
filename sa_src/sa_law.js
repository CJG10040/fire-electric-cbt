// Additive, dated official-law notes. No source-answer or study-record mutation.
const SA_LAW = /*SA_LAW_START*/null/*SA_LAW_END*/;
const SA_LAW_NOTES = Object.fromEntries(SA_LAW.notes.map(n => [n.id, n]));
const SA_LAW_LABELS = {amendment:'개정 내용', correction:'원문 표현·조건 정정', supplement:'현행 조건 보충', checked:'인용 항목 확인', pending:'추가 확인 필요', technical:'일반이론·제품별 조건'};
function saLawNeedsUpdate(k) {
  return (SA_LAW.review[k]?.notes || []).some(id => ['amendment','correction','supplement'].includes(SA_LAW_NOTES[id].status));
}
function saLawNoteHtml(n) {
  const refs = n.refs.map(r => {
    const s = SA_LAW.sources[r.source];
    return `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} · ${esc(r.provision)}</a>` +
      `<div>인용본 시행: ${esc(s.effective || '해당 없음(참고자료)')} ${s.notice ? '· '+esc(s.notice) : ''}</div>` +
      (r.quote ? `<blockquote>${esc(r.quote)}</blockquote>` : '') + '</li>';
  }).join('');
  const body = `<div class="sa-law-content"><ul>${n.lines.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>` +
    (n.change_on ? `<div class="sa-law-date">해당 변경 시행: ${esc(n.change_on)}</div>` : '') +
    (n.caveat ? `<p class="sa-law-caveat">주의: ${esc(n.caveat)}</p>` : '') +
    `<details class="sa-law-refs"><summary>근거 조항·공식 원문</summary><ul>${refs}</ul></details></div>`;
  const head = `<span class="sa-law-tag">${esc(SA_LAW_LABELS[n.status])}</span> ${esc(n.title)}`;
  return `<details class="sa-law-note ${n.status}" ${n.status !== 'checked' ? 'open' : ''}><summary>${head}</summary>${body}</details>`;
}
function saLawBox(k) {
  const r = SA_LAW.review[k];
  if (!r) return '';
  const head = `<div class="sa-law-head">⚖️ 현행 기준 대조 · ${esc(SA_LAW.asOf)}</div>`;
  if (!r.notes.length) return `<details class="sa-law-status ${r.status}"><summary>${head}<span>${esc(SA_LAW_LABELS[r.status])}</span></summary><p>${esc(r.reason)}</p></details>`;
  return `<section class="sa-law-box" data-law-key="${esc(k)}">${head}` +
    `<p class="sa-law-scope">아래는 이 묶음의 인용 항목에 대한 보충입니다. 출제본별 조건을 구분하며, 전체 정답·모든 변형의 현행 적합을 보증하는 표시는 아닙니다.</p>` +
    r.notes.map(id=>saLawNoteHtml(SA_LAW_NOTES[id])).join('') +
    `<p class="sa-law-foot">원문 정답은 보존했습니다. 인용본 시행일 ≠ 모든 문구의 최초 개정일. 기존 건축물의 허가·신고일 및 부칙·경과조치를 별도로 확인하세요.</p></section>`;
}
function saLawMemoAlert(keys) {
  return keys.some(saLawNeedsUpdate) ? '<div class="sa-law-memo-alert">⚠️ 이 암기법에는 과거 정답 표현이 포함되어 있습니다. 현행 답안은 정답란의 ⚖️ 보충을 우선 확인하세요. 아래 문구를 현행 법령으로 그대로 외우지 마세요.</div>' : '';
}
function saLawRelated(keys) {
  const ids = [...new Set(keys.flatMap(k=>(SA_LAW.review[k]?.notes || []).filter(id=>['amendment','correction','supplement'].includes(SA_LAW_NOTES[id].status))))];
  if (!ids.length) return '';
  return `<details class="sa-law-related"><summary>⚖️ 이 암기자료의 현행 보충 ${ids.length}건</summary>${ids.map(id=>saLawNoteHtml(SA_LAW_NOTES[id])).join('')}</details>`;
}
function saLawStart(group) {
  const cs = SA_BANK.clusters.filter(c=>group === 'updated' ? saLawNeedsUpdate(c.k) : SA_LAW.review[c.k].status === 'pending');
  if (cs.length) saLaunch('현행 기준 · ' + (group === 'updated' ? '개정·정정·보충' : '추가 확인 필요'), cs.map(c=>({k:c.k,id:c.rep})), 'law');
}
function saLawSummaryHtml() {
  const n = SA_BANK.clusters.filter(c=>saLawNeedsUpdate(c.k)).length;
  const pending = SA_BANK.clusters.filter(c=>SA_LAW.review[c.k].status === 'pending');
  const c = SA_LAW.counts;
  return `<div class="sa-law-overview"><b>⚖️ ${esc(SA_LAW.asOf)} 기준 · 법령 대조(원문표 추가 확인)</b>` +
    `<p>개정·정정·조건 보충 <b>${n}문항</b> · 인용 항목 확인 ${c.checked || 0}문항 · 일반이론/제품별 조건 ${c.technical || 0}문항 · 추가 확인 ${pending.length}문항</p>` +
    `<p>${esc(SA_LAW.warning)}</p><button class="btn btn-outline btn-sm" onclick="saLawStart('updated')">⚖️ 보충 있는 ${n}문항만 풀기</button>` +
    `<details class="sa-law-pending-list"><summary>추가 확인 ${pending.length}문항 목록</summary><ul>${pending.map(x=>`<li><button type="button" onclick="saMemoPractice('${x.k}')">${esc(saRep(x.k).t)}</button></li>`).join('')}</ul></details>` +
    '<p class="sa-law-caveat">인쇄 암기노트는 기출 원문 ①~③ + 현행 보충편 ④로 구성됩니다. 숫자 연습지는 기출 원문 기준이며 표시된 보충 번호로 현행 조건을 함께 확인하세요.</p></div>';
}
