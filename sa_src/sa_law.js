// Additive, dated official-law notes. No source-answer or study-record mutation.
const SA_LAW = /*SA_LAW_START*/null/*SA_LAW_END*/;
const SA_LAW_NOTES = Object.fromEntries(SA_LAW.notes.map(n => [n.id, n]));
const SA_LAW_LABELS = {amendment:'개정 내용', correction:'원문 표현·조건 정정', supplement:'현행 조건 보충', checked:'인용 항목 확인', pending:'추가 확인 필요', technical:'일반이론·제품별 조건'};
function saLawNeedsUpdate(k) {
  return (SA_LAW.review[k]?.notes || []).some(id => ['amendment','correction','supplement'].includes(SA_LAW_NOTES[id].status));
}
function saLawTablesHtml(keys) {
  return Object.entries(SA_LAW.tables || {}).filter(([,t])=>keys.some(k=>t.links[k])).map(([id,t])=>{
    const s=SA_LAW.sources[t.source];
    const hints=[...new Set(keys.map(k=>t.links[k]).filter(Boolean))];
    return `<details class="sa-law-table"><summary>📋 근거 표 보기 · ${esc(t.title)}</summary>`+
      `<p class="sa-law-table-version">현행 참고표 · 인용본 시행 ${esc(s.effective)} · 출제 당시 판본을 뜻하지 않습니다.</p>`+
      hints.map(h=>`<p class="sa-law-table-hint">${esc(h)}</p>`).join('')+
      `<button type="button" class="sa-law-table-image" onclick="saLawTableOpen('${id}')" aria-label="${esc(t.title)} 확대 보기"><img src="${t.src}" alt="${esc(t.title)} — 비고 포함 공식 원문" loading="lazy"></button>`+
      `<button type="button" class="btn btn-outline btn-sm" onclick="saLawTableOpen('${id}')">🔍 표 확대 보기</button>`+
      `<p class="sa-law-table-source">${esc(s.title)} · ${esc(t.provision)}<br><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">공식 기준 원문</a> · <a href="${esc(t.imageUrl)}" target="_blank" rel="noopener noreferrer">공식 표 이미지</a> · 이미지 내장: 오프라인에서도 표시</p></details>`;
  }).join('');
}
let SA_LAW_TABLE_FOCUS=null;
function saLawTableClose() {
  const d=document.getElementById('sa-law-table-viewer');
  if(!d || !d.hasAttribute('open')) return;
  if(typeof d.close==='function') d.close();
  d.removeAttribute('open');
  if(SA_LAW_TABLE_FOCUS?.isConnected) SA_LAW_TABLE_FOCUS.focus();
  SA_LAW_TABLE_FOCUS=null;
}
function saLawTableZoom(delta) {
  const d=document.getElementById('sa-law-table-viewer');
  if(!d) return;
  const z=Math.max(50,Math.min(300,Number(d.dataset.zoom || 100)+delta));
  d.dataset.zoom=z;
  d.querySelector('img').style.width=z+'%';
  d.querySelector('.sa-law-zoom-label').textContent=z+'%';
}
function saLawTableOpen(id) {
  const t=(SA_LAW.tables || {})[id];
  if(!t) return;
  let d=document.getElementById('sa-law-table-viewer');
  if(!d) {
    d=document.createElement('dialog'); d.id='sa-law-table-viewer';
    d.setAttribute('aria-labelledby','sa-law-table-viewer-title');
    d.addEventListener('cancel',e=>{e.preventDefault();saLawTableClose();});
    d.addEventListener('click',e=>{if(e.target===d) saLawTableClose();});
    document.body.appendChild(d);
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape' || ((e.ctrlKey || e.metaKey) && ['z','y'].includes(e.key.toLowerCase()))) saLawTableClose();
    },true);
    window.addEventListener('popstate',saLawTableClose);
  }
  SA_LAW_TABLE_FOCUS=document.activeElement;
  d.dataset.zoom='100';
  d.innerHTML=`<header><b id="sa-law-table-viewer-title">${esc(t.title)}</b><button type="button" onclick="saLawTableClose()" autofocus>닫기 ✕</button></header>`+
    `<p class="sa-law-table-version">현행 참고표 · ${esc(SA_LAW.sources[t.source].title)} · 인용본 시행 ${esc(SA_LAW.sources[t.source].effective)} · 출제 당시 판본과 구별하세요.</p>`+
    '<div class="sa-law-table-toolbar"><button type="button" onclick="saLawTableZoom(-25)" aria-label="표 축소">−</button><span class="sa-law-zoom-label">100%</span><button type="button" onclick="saLawTableZoom(25)" aria-label="표 확대">＋</button><span>확대 후 가로·세로로 스크롤하세요.</span></div>'+
    `<div class="sa-law-table-canvas"><img src="${t.src}" alt="${esc(t.title)} — 공식 원문 전체" style="width:100%"></div>`;
  if(typeof d.showModal==='function') d.showModal(); else d.setAttribute('open','');
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
    (n.caveat ? `<p class="sa-law-caveat">주의: ${esc(n.caveat)}</p>` : '') + saLawTablesHtml(n.ks) +
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
