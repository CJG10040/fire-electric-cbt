
// ============================================================
//  단답·서술 모드 (SA) — 기존 시험 엔진/오답노트와 분리된 전용 엔진
//  데이터: 암기영상 정리본 447문항 → 동일 질문 묶음(대표 1문항) / 저장소: STORE.sa (cbt_sa_v1)
// ============================================================
const SA_BANK = /*SA_DATA_START*/null/*SA_DATA_END*/;
const SA_OCC = {};
SA_BANK.occ.forEach(o => { SA_OCC[o.id] = o; });
const SA_CL = {};
SA_BANK.clusters.forEach(c => { SA_CL[c.k] = c; });
const SA_TOPICS = SA_BANK.topics;
const SA_KIND = { '단답':'단답형', '서술':'서술형', '빈칸':'빈칸 채우기', '택일':'택일형' };

/*SA_LAW_CODE*/

// 암기법 데이터: 원문 정리본 대조는 법령 검증이 아님. 현행 보충을 별도로 표시한다.
const SA_MEMO = /*SA_MEMO_START*/null/*SA_MEMO_END*/;
const SA_CARD_BY_K = {};
SA_MEMO.cards.forEach((c, i) => c.ks.forEach(k => { SA_CARD_BY_K[k] = i; }));
const SA_CMP_BY_ID = {};
const SA_CMP_BY_K = {};
SA_MEMO.compares.forEach(s => {
  SA_CMP_BY_ID[s.id] = s;
  s.r.forEach(r => r.ks.forEach(k => {
    (SA_CMP_BY_K[k] = SA_CMP_BY_K[k] || []);
    if (!SA_CMP_BY_K[k].includes(s.id)) SA_CMP_BY_K[k].push(s.id);
  }));
});

function saBlockKey(o)   { return o.y + '_' + (o.r || 0); }
function saBlockLabel(o) { return o.y + '년' + (o.r ? ' ' + o.r + '회' : ''); }
function saBlockShort(o) { return o.y + (o.r ? '-' + o.r : ''); }
function saOccCmp(a, b)  { return (b.y + (b.r || '0')).localeCompare(a.y + (a.r || '0')) || a.n - b.n; }

const SA_BLOCKS = (() => {
  const m = {};
  SA_BANK.occ.forEach(o => {
    const k = saBlockKey(o);
    (m[k] = m[k] || { key:k, y:o.y, r:o.r || '', n:0, label:saBlockLabel(o) }).n++;
  });
  return Object.values(m).sort((a, b) => (b.y + (b.r || '0')).localeCompare(a.y + (a.r || '0')));
})();

function saCount(k)  { return SA_CL[k].m.length; }
function saRep(k)    { return SA_OCC[SA_CL[k].rep]; }
function saTopicOf(k){ return SA_TOPICS[SA_CL[k].tp]; }
function saYears(k, hiId) {
  return SA_CL[k].m.map(id => {
    const t = saBlockShort(SA_OCC[id]);
    return id === hiId ? '<b>' + t + '</b>' : t;
  }).join(' · ');
}
function saRepeatBadge(k) {
  const n = saCount(k);
  if (n <= 1) return '<span class="sa-repeat once">📅 출제 1회</span>';
  return `<span class="sa-repeat ${n >= 3 ? 'hot' : ''}">📅 출제 ${n}회</span>`;
}
function saKindText(o) {
  if (o.kd === '택일' && o.pk) return `${o.pk}가지 택일`;
  if (o.pk) return `${SA_KIND[o.kd]} · ${o.pk}가지`;
  return SA_KIND[o.kd] || '';
}
function saVideoUrl(o) {
  const base = SA_BANK.sources[saBlockKey(o)];
  return base ? base + '?t=' + o.s : '';
}
function saMMSS(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

// ------------------------------------------------------------
//  선택 상태 + 허브 화면
// ------------------------------------------------------------
const SA_SEL = { mode:'all', blocks:new Set(), topics:new Set(), order:'exam', scope:'all', limit:0 };
let SA_STATE = null;
let SA_LAST = null;      // 마지막으로 시작한 세션 정의 (같은 문제 다시 풀기용)
let SA_WN_TOPIC = -1;    // 오답노트 주제 필터(-1=전체)

function saBuildUnits() {
  let units = [];
  if (SA_SEL.mode === 'all') {
    units = SA_BANK.clusters.map(c => ({ k:c.k, id:c.rep }));
  } else if (SA_SEL.mode === 'topic') {
    units = SA_BANK.clusters.filter(c => SA_SEL.topics.has(c.tp)).map(c => ({ k:c.k, id:c.rep }));
  } else {
    const seen = new Set();
    SA_BANK.occ.filter(o => SA_SEL.blocks.has(saBlockKey(o))).sort(saOccCmp).forEach(o => {
      if (!seen.has(o.c)) { seen.add(o.c); units.push({ k:o.c, id:o.id }); }
    });
  }
  const solved = new Set(STORE.sa.solved);
  if (SA_SEL.scope === 'unsolved') units = units.filter(u => !solved.has(u.k));
  if (SA_SEL.scope === 'wrong')    units = units.filter(u => STORE.sa.wrong[u.k]);
  const byExam = (a, b) => saOccCmp(SA_OCC[a.id], SA_OCC[b.id]);
  if (SA_SEL.order === 'hot') units.sort((a, b) => saCount(b.k) - saCount(a.k) || byExam(a, b));
  else if (SA_SEL.order === 'random') units = saShuffle(units);
  else units.sort(byExam);
  if (SA_SEL.limit > 0) units = units.slice(0, SA_SEL.limit);
  return units;
}
function saShuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function saRenderHub() {
  const total = SA_BANK.occ.length, uniq = SA_BANK.clusters.length;
  const repeated = SA_BANK.clusters.filter(c => c.m.length > 1).length;
  document.getElementById('sa-note').innerHTML =
    `출처: 단답형·서술형 암기영상 정리본(비공식) ${SA_BLOCKS.length}개 영상 · 원본 ${total}문항을 동일 질문끼리 묶어 <b>${uniq}문항</b>(2회 이상 출제 ${repeated}개)으로 정리했습니다. ` +
    `전체·주제별은 묶음당 대표(최신 출제본) 1문항만 출제하고, 연도별은 그 해 문항을 그대로 출제합니다. 원문 정답을 보존하고 현행 대조 메모를 정답 공개 후 따로 표시합니다.`;
  document.getElementById('sa-law-summary').innerHTML = saLawSummaryHtml();
  const solvedSet = new Set(STORE.sa.solved);
  document.getElementById('sa-stats').innerHTML = [
    [uniq, '고유 문항'], [total, '원본 출제 건수'],
    [SA_BANK.clusters.filter(c => solvedSet.has(c.k)).length, '풀어본 문제'],
    [Object.keys(STORE.sa.wrong).filter(k => SA_CL[k]).length, '단답 오답']
  ].map(([v, l]) => `<div class="stat-box"><div class="sv">${v}</div><div class="sl">${l}</div></div>`).join('');
  document.getElementById('sa-seg').innerHTML = [['all','📚 전체'], ['year','📅 연도별'], ['topic','🏷️ 주제별']]
    .map(([m, l]) => `<button type="button" class="${SA_SEL.mode === m ? 'on' : ''}" onclick="saSetMode('${m}')">${l}</button>`).join('');
  ['order','scope','limit'].forEach(id => { document.getElementById('sa-' + id).value = String(SA_SEL[id]); });
  saRenderPanel();
  // TOP 10 (가장 자주 출제된 문제)
  const top = SA_BANK.clusters.slice().sort((a, b) => b.m.length - a.m.length || saOccCmp(SA_OCC[a.rep], SA_OCC[b.rep])).slice(0, 10);
  document.getElementById('sa-top').innerHTML = top.map(c => {
    const o = SA_OCC[c.rep];
    return `<div class="sa-top-row">${saRepeatBadge(c.k)}<div class="t">${esc(o.t)}<span class="m">${esc(SA_TOPICS[c.tp])} · ${saYears(c.k)}</span></div></div>`;
  }).join('');
  const h = STORE.sa.history;
  document.getElementById('sa-recent').innerHTML = h.length ? h.slice(0, 5).map(r => `
    <div class="sa-recent-row"><div style="flex:1">${esc(r.label)} <span style="color:var(--gray);font-size:.75rem">(${r.total}문항)</span></div>
    <div style="font-weight:700;color:${r.pct >= 60 ? 'var(--green)' : 'var(--fire)'}">${r.pct}%</div>
    <div style="font-size:.75rem;color:var(--gray)">${esc(r.date)}</div></div>`).join('') : '아직 기록이 없습니다.';
}

function saRenderPanel() {
  const el = document.getElementById('sa-panel');
  let html = '';
  if (SA_SEL.mode === 'all') {
    html = `<div class="sa-panel-head">전체 ${SA_BANK.clusters.length}문항(중복 묶음 기준)을 한 번에 출제합니다.</div>`;
  } else if (SA_SEL.mode === 'year') {
    html = `<div class="sa-panel-head">출제 연도를 고르세요 (복수 선택 · 선택한 해 사이에서 같은 문제는 1번만 출제)
      <button type="button" class="btn btn-outline" onclick="saSelectAll('blocks',true)">전체 선택</button>
      <button type="button" class="btn btn-outline" onclick="saSelectAll('blocks',false)">선택 해제</button></div>
      <div class="year-filter">` + SA_BLOCKS.map(b =>
        `<div class="filter-chip ${SA_SEL.blocks.has(b.key) ? 'active' : ''}" onclick="saToggleBlock('${b.key}')">${b.label} (${b.n})</div>`).join('') + '</div>';
  } else {
    const cnt = SA_TOPICS.map((t, i) => SA_BANK.clusters.filter(c => c.tp === i).length);
    html = `<div class="sa-panel-head">주제를 고르세요 (복수 선택)
      <button type="button" class="btn btn-outline" onclick="saSelectAll('topics',true)">전체 선택</button>
      <button type="button" class="btn btn-outline" onclick="saSelectAll('topics',false)">선택 해제</button></div>
      <div class="year-filter">` + SA_TOPICS.map((t, i) =>
        `<div class="filter-chip ${SA_SEL.topics.has(i) ? 'active' : ''}" onclick="saToggleTopic(${i})">${esc(t)} (${cnt[i]})</div>`).join('') + '</div>';
  }
  el.innerHTML = html;
  saUpdateSummary();
}

function saUpdateSummary() {
  const n = saBuildUnits().length;
  const modeTxt = SA_SEL.mode === 'all' ? '전체' : SA_SEL.mode === 'year' ? `연도 ${SA_SEL.blocks.size}개 선택` : `주제 ${SA_SEL.topics.size}개 선택`;
  document.getElementById('sa-summary').innerHTML = `${modeTxt} → 출제 <em>${n}</em>문항`;
  document.getElementById('sa-start-btn').disabled = n === 0;
}

function saSetMode(m)   { SA_SEL.mode = m; saRenderHub(); }
function saSetOpt(k, v) { SA_SEL[k] = (k === 'limit') ? Number(v) : v; saUpdateSummary(); }
function saToggleBlock(key) { SA_SEL.blocks.has(key) ? SA_SEL.blocks.delete(key) : SA_SEL.blocks.add(key); saRenderPanel(); }
function saToggleTopic(i)   { SA_SEL.topics.has(i) ? SA_SEL.topics.delete(i) : SA_SEL.topics.add(i); saRenderPanel(); }
function saSelectAll(what, on) {
  if (what === 'blocks') SA_SEL.blocks = on ? new Set(SA_BLOCKS.map(b => b.key)) : new Set();
  else SA_SEL.topics = on ? new Set(SA_TOPICS.map((t, i) => i)) : new Set();
  saRenderPanel();
}

function saSessionTitle() {
  if (SA_SEL.mode === 'all') return '전체';
  if (SA_SEL.mode === 'year') {
    const names = SA_BLOCKS.filter(b => SA_SEL.blocks.has(b.key)).map(b => b.label);
    return names.length > 2 ? `연도별(${names.length}개)` : names.join('·');
  }
  const names = SA_TOPICS.filter((t, i) => SA_SEL.topics.has(i));
  return names.length > 2 ? `주제별(${names.length}개)` : names.join('·');
}

function saStart() {
  const units = saBuildUnits();
  if (!units.length) { showToast('출제할 문제가 없어요. 범위를 확인해 주세요'); return; }
  saLaunch('단답·서술 · ' + saSessionTitle(), units, SA_SEL.mode);
}

// ------------------------------------------------------------
//  세션 엔진
// ------------------------------------------------------------
function saLaunch(title, units, mode) {
  SA_LAST = { title, units: units.map(u => ({ k:u.k, id:u.id })), mode };
  SA_STATE = { title, mode, units: SA_LAST.units.slice(), cur:0, answers:{}, texts:{}, shown:{}, snap:{}, study:false, startedAt:Date.now(), finished:false };
  const btn = document.getElementById('btn-sa-study');
  if (btn) btn.classList.remove('on');
  document.getElementById('sa-quiz-title').textContent = title;
  saRenderQuestion();
  showScreen('sa-quiz');
}

function saRenderQuestion() {
  const S = SA_STATE, i = S.cur, u = S.units[i], o = SA_OCC[u.id], k = u.k, c = SA_CL[k];
  const tot = S.units.length;
  document.getElementById('sa-quiz-cur').textContent = i + 1;
  document.getElementById('sa-quiz-tot').textContent = tot;
  document.getElementById('sa-quiz-progress').style.width = ((i + 1) / tot * 100) + '%';
  document.getElementById('sa-btn-prev').disabled = (i === 0);
  const isLast = (i === tot - 1);
  document.getElementById('sa-btn-next').style.display = isLast ? 'none' : '';
  document.getElementById('sa-btn-finish').style.display = isLast ? '' : 'none';
  document.getElementById('sa-nav-status').innerHTML = `<span class="q-answered-dot"></span>${Object.keys(S.answers).length}/${tot} 채점 완료`;

  if (S.study) S.shown[k] = true;
  const shown = !!S.shown[k], g = S.answers[k] || '';
  const yearMode = S.mode === 'year';
  document.getElementById('sa-quiz-body').innerHTML = `
    <div class="q-card">
      <div class="q-badge">
        <span class="q-num-badge">문제 ${String(i + 1).padStart(2, '0')}</span>
        ${yearMode ? `<span class="q-exam-badge">${saBlockLabel(o)} · ${o.n}번</span>` : ''}
        ${saRepeatBadge(k)}
        <span class="q-cat-badge">${esc(saTopicOf(k))}</span>
        <span class="sa-kind">${esc(saKindText(o))}</span>
        ${c.ad ? '<span class="sa-warn">⚠ 출제본마다 답 표기가 다름</span>' : ''}
      </div>
      <div class="sa-years">출제 연도: ${saYears(k, o.id)}</div>
      ${o.ht ? '' : `<div class="sa-title">${esc(o.t)}</div>`}
      <div class="sa-q">${o.qh}</div>
      <div class="answer-section">
        <div class="answer-label">✏️ 내 답안 (메모용 · 저장되지 않음)</div>
        <textarea class="answer-textarea" id="sa-user-ta" placeholder="여기에 답을 적어 본 뒤 정답과 비교하세요..." rows="3">${esc(S.texts[k] || '')}</textarea>
      </div>
      <div class="answer-reveal ${shown ? 'show' : ''}" id="sa-reveal">
        <div class="answer-reveal-header" onclick="saToggleAnswer('${k}')">
          <span>${shown ? '✅' : '👁️'}</span><span>${shown ? '정답 공개됨 (클릭하여 닫기)' : '정답 보기 (클릭)'}</span>
        </div>
        <div class="answer-reveal-body" id="sa-reveal-body">${shown ? saAnswerHtml(u) : ''}</div>
      </div>
      <div class="self-grade ${shown ? 'visible' : ''}" id="sa-grade">
        <div class="grade-actions">
          <button class="sg-btn ${g === 'O' ? 'correct' : ''}" onclick="saGrade('${k}','O')">✅ 정답</button>
          <button class="sg-btn ${g === 'P' ? 'partial' : ''}" onclick="saGrade('${k}','P')">🟡 부분(일부만 맞음)</button>
          <button class="sg-btn ${g === 'X' ? 'wrong' : ''}" onclick="saGrade('${k}','X')">❌ 오답</button>
        </div>
        <div class="grade-note">자가채점입니다(점수 없음). 오답·부분은 <b>단답·서술 오답노트</b>에 기록되고, 정답으로 다시 채점하면 오답노트에서 빠집니다.</div>
      </div>
    </div>`;
  document.getElementById('sa-user-ta').addEventListener('input', e => { S.texts[k] = e.target.value; });
}

function saAnswerHtml(u) {
  const o = SA_OCC[u.id], k = u.k, c = SA_CL[k];
  const pick = o.pk ? `<div class="sa-pick">💡 원문 요구: <b>${o.pk}가지</b> 작성. 과거 정답과 현행 보충·출제 조건을 구분해서 학습하세요.</div>` : '';
  const note = c.nt ? `<div class="sa-note-box">⚠️ ${esc(c.nt)}</div>` : '';
  const diffNote = (c.ad && !c.nt) ? `<div class="sa-note-box">⚠️ 출제본마다 숫자·항목 표기가 다릅니다. 아래 '출제 이력'에서 연도별 정답을 비교하세요.</div>` : '';
  // dq/da are measured against the cluster's representative; show another occurrence's own text only when it differs from the one on screen
  const d = o;
  const differs = (m) => m.id === c.rep ? !!(d.dq || d.da) : (d.id === c.rep ? !!(m.dq || m.da) : !!(m.dq || m.da || d.dq || d.da));
  const rows = c.m.map(id => {
    const m = SA_OCC[id], here = id === u.id, url = saVideoUrl(m);
    let body = '';
    if (!here && differs(m)) {
      body = `<div class="sa-var"><span class="lbl">문제</span><div class="sa-q">${m.qh}</div><span class="lbl" style="margin-top:6px">원문 정답</span><div class="sa-a">${m.ah}</div>${saLawBox(k)}</div>`;
    } else if (!here) {
      body = '<div class="sa-same">질문·정답이 위와 같음(표기 차이 가능)</div>';
    }
    return `<div class="sa-hist-row"><div class="h"><b>${saBlockLabel(m)} ${m.n}번</b>${here ? '<span class="sa-same">← 지금 보는 문제</span>' : ''}` +
      (url ? `<a href="${url}" target="_blank" rel="noopener noreferrer">▶ 해설영상 ${saMMSS(m.s)}</a>` : '') + `</div>${body}</div>`;
  }).join('');
  const hist = `<details class="sa-hist"><summary>📅 출제 이력 ${c.m.length}회 · 연도별 보기</summary><div class="sa-hist-body">${rows}</div></details>`;
  return `${pick}${note}${diffNote}<div class="sa-original-label">📚 기출 정리본 정답 (원문 보존)</div><div class="sa-a">${o.ah}</div>${saLawBox(k)}${saMemoBox(k)}${hist}`;
}

function saToggleAnswer(k) {
  const S = SA_STATE, u = S.units[S.cur];
  S.shown[k] = !S.shown[k];
  const reveal = document.getElementById('sa-reveal'), sg = document.getElementById('sa-grade');
  const body = document.getElementById('sa-reveal-body'), head = reveal.querySelector('.answer-reveal-header');
  if (S.shown[k]) {
    reveal.classList.add('show');
    head.innerHTML = '<span>✅</span><span>정답 공개됨 (클릭하여 닫기)</span>';
    if (!body.innerHTML) body.innerHTML = saAnswerHtml(u);
    sg.classList.add('visible');
  } else {
    reveal.classList.remove('show');
    head.innerHTML = '<span>👁️</span><span>정답 보기 (클릭)</span>';
    sg.classList.remove('visible');
  }
}

function saToggleStudy() {
  const S = SA_STATE;
  S.study = !S.study;
  document.getElementById('btn-sa-study').classList.toggle('on', S.study);
  if (S.study) { S.shown[S.units[S.cur].k] = true; saRenderQuestion(); }
  showToast(S.study ? '📖 공부모드 ON — 문제마다 정답이 자동 공개됩니다' : '📖 공부모드 OFF', 2000);
}

// 채점 → 단답·서술 오답노트(STORE.sa)에 즉시 반영. 기존 STORE.wrong 은 건드리지 않는다.
function saApplyGrade(k, g) {
  const sa = STORE.sa, S = SA_STATE;
  if (!(k in S.snap)) S.snap[k] = sa.wrong[k] || 0;       // 이 세션 시작 전 오답 횟수
  if (g === 'O') delete sa.wrong[k];
  else sa.wrong[k] = S.snap[k] + 1;                         // 세션당 문제별 최대 +1
  if (!sa.solved.includes(k)) sa.solved.push(k);
  STORE._dirty = true;
  _persistSA();
  updateSyncBadge();
}

function saGrade(k, g) {
  const S = SA_STATE;
  S.answers[k] = g;
  saApplyGrade(k, g);
  document.querySelectorAll('#sa-grade .sg-btn').forEach(b => b.classList.remove('correct', 'partial', 'wrong'));
  const idx = { O:0, P:1, X:2 }[g];
  const btns = document.querySelectorAll('#sa-grade .sg-btn');
  if (btns[idx]) btns[idx].classList.add(g === 'O' ? 'correct' : g === 'P' ? 'partial' : 'wrong');
  document.getElementById('sa-nav-status').innerHTML = `<span class="q-answered-dot"></span>${Object.keys(S.answers).length}/${S.units.length} 채점 완료`;
  showToast(g === 'O' ? '✅ 정답으로 기록 (오답노트에서 제거)' : g === 'P' ? '🟡 부분으로 기록 (단답 오답노트에 추가)' : '❌ 오답으로 기록 (단답 오답노트에 추가)');
}

function saMove(d) {
  SA_STATE.cur = Math.max(0, Math.min(SA_STATE.units.length - 1, SA_STATE.cur + d));
  saRenderQuestion();
  window.scrollTo(0, 0);
}

function saConfirmEnd() {
  const g = Object.keys(SA_STATE.answers).length;
  if (g === 0) {
    if (confirm('채점한 문제가 없습니다. 풀이를 종료하고 돌아갈까요?')) { SA_STATE.finished = true; showScreen('sa'); }
    return;
  }
  if (confirm(`${g}/${SA_STATE.units.length}문제를 채점했습니다. 여기서 종료하고 결과를 볼까요?`)) saFinish();
}

function saFinish() {
  const S = SA_STATE;
  if (!S || S.finished) { if (S) showScreen('sa-result'); return; }
  S.finished = true;
  const cnt = { O:0, P:0, X:0, U:0 };
  S.units.forEach(u => { cnt[S.answers[u.k] || 'U']++; });
  const total = S.units.length;
  const pct = total ? Math.round(cnt.O / total * 100) : 0;
  STORE.sa.history.unshift({
    label: S.title, pct, correct: cnt.O, partial: cnt.P, wrong: cnt.X, unanswered: cnt.U, total,
    elapsedSeconds: Math.max(0, Math.round((Date.now() - S.startedAt) / 1000)),
    date: new Date().toLocaleDateString('ko-KR', { month:'numeric', day:'numeric' })
  });
  if (STORE.sa.history.length > 30) STORE.sa.history.length = 30;
  STORE._dirty = true;
  _persistSA();
  updateSyncBadge();
  document.getElementById('sa-res-score').textContent = `${cnt.O} / ${total}`;
  document.getElementById('sa-res-grade').textContent = `정답률 ${pct}% (정답 기준) · 부분 ${cnt.P} · 오답 ${cnt.X} · 미채점 ${cnt.U}`;
  document.getElementById('sa-res-grade').style.color = pct >= 60 ? 'var(--green)' : 'var(--fire)';
  document.getElementById('sa-res-correct').textContent = cnt.O;
  document.getElementById('sa-res-partial').textContent = cnt.P;
  document.getElementById('sa-res-wrong').textContent = cnt.X;
  document.getElementById('sa-res-unanswered').textContent = cnt.U;
  document.getElementById('sa-res-total').textContent = total;
  saRenderResult('all');
  showScreen('sa-result');
}

function saRenderResult(filter) {
  const S = SA_STATE;
  const items = S.units.filter(u => filter === 'all' || (S.answers[u.k] || 'U') === filter);
  const mark = { O:'✅ 정답', P:'🟡 부분', X:'❌ 오답', U:'⚪ 미채점' };
  document.getElementById('sa-res-list').innerHTML = items.map(u => {
    const o = SA_OCC[u.id], g = S.answers[u.k] || 'U';
    return `<details class="sa-res-item ${g}"><summary><span class="tt">${esc(o.t)}<br><span style="font-size:.72rem;color:var(--gray)">${esc(saTopicOf(u.k))} · 출제 ${saCount(u.k)}회 · ${saYears(u.k)}</span></span><span>${mark[g]}</span></summary>
      <div class="body"><span class="lbl">문제</span><div class="sa-q">${o.qh}</div><span class="lbl">원문 정답</span><div class="sa-a">${o.ah}</div>${saLawBox(u.k)}${saMemoBox(u.k)}</div></details>`;
  }).join('') || '<div style="color:var(--gray);padding:20px;text-align:center">해당 문제 없음</div>';
}

function saRetryWrong() {
  const S = SA_STATE;
  const units = S.units.filter(u => { const g = S.answers[u.k]; return g === 'X' || g === 'P'; });
  if (!units.length) { showToast('오답이나 부분 문제가 없어요!'); return; }
  saLaunch(S.title + ' · 오답 재시험', saShuffle(units), S.mode);
}
function saRetrySame() {
  if (!SA_LAST) return showScreen('sa');
  saLaunch(SA_LAST.title, SA_LAST.units, SA_LAST.mode);
}

// ------------------------------------------------------------
//  단답·서술 오답노트 (기존 복습노트와 별개)
// ------------------------------------------------------------
function saWrongKeys() { return Object.keys(STORE.sa.wrong).filter(k => SA_CL[k]); }

function saRenderWrong() {
  const wrong = STORE.sa.wrong;
  const keys = saWrongKeys();
  const topicCnt = SA_TOPICS.map((t, i) => keys.filter(k => SA_CL[k].tp === i).length);
  const topIdx = topicCnt.indexOf(Math.max(0, ...topicCnt));
  document.getElementById('sa-wn-stats').innerHTML = `
    <div class="wn-stat"><div class="wv">${keys.length}</div><div class="wl">복습 문항</div></div>
    <div class="wn-stat"><div class="wv" style="color:var(--fire)">${keys.length ? topicCnt[topIdx] : 0}</div><div class="wl">최다: ${keys.length ? esc(SA_TOPICS[topIdx].slice(0, 8)) : '없음'}</div></div>
    <div class="wn-stat"><div class="wv" style="color:var(--green)">${keys.reduce((s, k) => s + (Number(wrong[k]) || 0), 0)}</div><div class="wl">누적 오답 기록</div></div>`;
  document.getElementById('sa-wn-chips').innerHTML =
    `<div class="filter-chip ${SA_WN_TOPIC < 0 ? 'active' : ''}" onclick="saWnTopic(-1)">전체 (${keys.length})</div>` +
    SA_TOPICS.map((t, i) => topicCnt[i] ? `<div class="filter-chip ${SA_WN_TOPIC === i ? 'active' : ''}" onclick="saWnTopic(${i})">${esc(t)} (${topicCnt[i]})</div>` : '').join('');
  const list = keys.filter(k => SA_WN_TOPIC < 0 || SA_CL[k].tp === SA_WN_TOPIC)
    .sort((a, b) => (wrong[b] || 0) - (wrong[a] || 0) || saCount(b) - saCount(a) || saOccCmp(saRep(a), saRep(b)));
  if (!list.length) {
    document.getElementById('sa-wn-list').innerHTML = `<div class="wn-empty"><div class="we-icon">🎉</div><div>${keys.length ? '이 주제에는 오답이 없어요.' : '단답·서술 오답이 없어요. 문제를 풀고 채점하면 여기에 모입니다.'}</div></div>`;
    return;
  }
  document.getElementById('sa-wn-list').innerHTML = list.map(k => {
    const o = saRep(k);
    return `<details class="sa-wn-item"><summary>
        <div class="sa-wn-head">${saRepeatBadge(k)}<span class="q-cat-badge">${esc(saTopicOf(k))}</span>
          <span class="sa-wn-cnt">오답 ${wrong[k] || 1}회</span></div>
        <div class="sa-wn-title">${esc(o.t)}</div></summary>
      <div class="sa-wn-body"><span class="lbl">문제</span><div class="sa-q">${o.qh}</div>
        <span class="lbl">원문 정답</span><div class="sa-a">${o.ah}</div>${saLawBox(k)}${saMemoBox(k)}
        <div class="sa-years" style="margin-top:8px">출제 연도: ${saYears(k, o.id)}</div>
        <div class="sa-wn-actions"><button class="btn btn-success btn-sm" onclick="saRemoveWrong('${k}')">✓ 외웠어요 (오답노트에서 제거)</button></div></div></details>`;
  }).join('');
}

function saWnTopic(i) { SA_WN_TOPIC = i; saRenderWrong(); }

function saRemoveWrong(k) {
  delete STORE.sa.wrong[k];
  STORE._dirty = true;
  _persistSA();
  updateSyncBadge();
  saRenderWrong();
  showToast('단답·서술 오답노트에서 제거했습니다');
}

function saStartWrong() {
  const keys = saWrongKeys().filter(k => SA_WN_TOPIC < 0 || SA_CL[k].tp === SA_WN_TOPIC);
  if (!keys.length) { showToast('복습할 단답·서술 오답이 없어요'); return; }
  const units = saShuffle(keys.map(k => ({ k, id: SA_CL[k].rep })));
  saLaunch('단답·서술 오답노트' + (SA_WN_TOPIC >= 0 ? ' · ' + SA_TOPICS[SA_WN_TOPIC] : ''), units, 'wrong');
}

function saClearWrong() {
  if (!confirm('단답·서술 오답 기록만 전체 삭제할까요?\n(기존 📕 복습노트와 풀이 이력은 그대로 유지됩니다)')) return;
  STORE.sa.wrong = {};
  STORE._dirty = true;
  _persistSA();
  updateSyncBadge();
  saRenderWrong();
  showToast('단답·서술 오답 기록이 초기화되었습니다. 저장하기로 백업하세요!');
}

// ============================================================
//  🧠 단답 암기노트 (암기법 카드 · 숫자 비교 · 카드 훈련)
// ============================================================
function saMemoBox(k) {
  const ci = SA_CARD_BY_K[k];
  const cmp = SA_CMP_BY_K[k] || [];
  if (ci === undefined && !cmp.length) return '';
  let html = '<div class="sa-memo-box"><div class="sa-memo-title">🧠 암기법 · 원문 기준</div>' + saLawMemoAlert(ci === undefined ? [k] : SA_MEMO.cards[ci].ks);
  if (ci !== undefined) {
    const c = SA_MEMO.cards[ci];
    html += `<div class="sa-memo-hook">${c.h}</div><ul class="sa-memo-lines">${c.l.map(x => `<li>${x}</li>`).join('')}</ul>`;
    if (c.t) html += `<div class="sa-memo-trap">⚠️ ${c.t}</div>`;
    if (c.ks.length > 1) html += `<div class="sa-memo-shared">이 암기법은 관련 문제 ${c.ks.length}개에 공통입니다.</div>`;
  }
  if (cmp.length) {
    html += '<div class="sa-memo-cmps">' + cmp.map(id =>
      `<button type="button" class="sa-cmp-link" onclick="saMemoGoCompare('${id}')">🔢 ${esc(SA_CMP_BY_ID[id].t)}</button>`).join('') + '</div>';
  }
  return html + '</div>';
}

const SA_MEMO_UI = { tab:'cmp', topic:-1, q:'', sort:'hot', open:null };
let SA_FLASH = null;

function saPlain(html) { return String(html).replace(/<[^>]+>/g, ''); }

function saRenderMemo() {
  const tabs = [['cmp', '🔢 헷갈리는 숫자 비교'], ['cards', '🎯 암기법 카드'], ['flash', '🃏 카드 훈련']];
  document.getElementById('sa-memo-seg').innerHTML = tabs.map(([t, l]) =>
    `<button type="button" class="${SA_MEMO_UI.tab === t ? 'on' : ''}" onclick="saMemoTab('${t}')">${l}</button>`).join('');
  document.getElementById('sa-memo-intro').innerHTML =
    `헷갈리는 숫자·비슷한 개념을 <b>비교표 → 암기법 카드 → 카드 훈련 → 문제 풀이</b> 순서로 잡아 보세요. 카드 ${SA_MEMO.cards.length}장이 고유 ${SA_BANK.clusters.length}문항을 모두 덮습니다. ` +
    `숫자·용어는 <b>과거 정리본</b> 대조 결과이며 현행 적합 판정이 아닙니다. <b>⚖️ 현행 보충을 우선 확인</b>하세요. 인쇄 암기노트는 ①~③ 기출 원문 + ④ 현행 보충편입니다. 숫자 연습지는 기출 원문을 쓴 뒤 보충 번호로 현행 조건을 대조하세요.`;
  if (SA_MEMO_UI.tab === 'cmp') saRenderMemoCmp();
  else if (SA_MEMO_UI.tab === 'cards') saRenderMemoCards();
  else saRenderFlash();
}

function saMemoTab(t) { SA_MEMO_UI.tab = t; saRenderMemo(); }

function saMemoGoCompare(id) {
  SA_MEMO_UI.tab = 'cmp';
  SA_MEMO_UI.open = id;
  showScreen('sa-memo');
  const e = document.getElementById('sa-cmp-' + id);
  if (e && e.scrollIntoView) e.scrollIntoView();
  SA_MEMO_UI.open = null;
}

// ---- 비교 세트
function saRenderMemoCmp() {
  const html = SA_MEMO.compares.map(s => {
    const rows = s.r.map(r => `
      <div class="sa-cmp-row">
        <div class="lb">${r.lb}</div>
        <div class="v" onclick="this.classList.toggle('show')">${r.v}</div>
        <div class="n">${r.n}</div>
        <div class="go"><button type="button" onclick="saMemoPractice('${r.ks[0]}')" title="이 문제 풀어보기">📝</button></div>
      </div>`).join('');
    return `<details class="sa-cmp" id="sa-cmp-${s.id}" ${SA_MEMO_UI.open === s.id ? 'open' : ''}>
      <summary><span class="t">${esc(s.t)}</span><span class="h">${s.h}</span></summary>
      <div class="sa-cmp-body">
        <p class="sa-cmp-intro">${s.i}</p>
        <div class="sa-cmp-tools"><button type="button" class="btn btn-outline btn-sm" onclick="saCmpHide('${s.id}')">🙈 값 가리기 / 보이기</button>
          <span class="sa-same">가린 뒤에 탭하면 한 줄씩 공개됩니다 · 📝 = 그 항목 문제 풀기</span></div>
        <div class="sa-cmp-rows">${rows}</div>
        ${saLawMemoAlert(s.r.flatMap(r=>r.ks))}${saLawRelated(s.r.flatMap(r=>r.ks))}
        ${s.l.length ? `<ul class="sa-memo-lines">${s.l.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
      </div></details>`;
  }).join('');
  document.getElementById('sa-memo-body').innerHTML =
    `<p class="sa-note">비교표 ${SA_MEMO.compares.length}개 — 제목을 눌러 펼치세요. 행마다 마지막의 📝로 해당 문제를 바로 풀 수 있어요.</p>${html}`;
}

function saCmpHide(id) {
  const e = document.getElementById('sa-cmp-' + id);
  if (e) e.classList.toggle('hide');
}

// ---- 암기법 카드
function saCardTopic(c) { return SA_CL[c.ks[0]].tp; }
function saCardWeight(c) { return c.ks.reduce((s, k) => s + saCount(k), 0); }

function saMemoFiltered() {
  const q = SA_MEMO_UI.q.trim().toLowerCase();
  let list = SA_MEMO.cards.map((c, i) => ({ c, i })).filter(({ c }) => SA_MEMO_UI.topic < 0 || saCardTopic(c) === SA_MEMO_UI.topic);
  if (q) {
    list = list.filter(({ c }) => {
      const hay = (saPlain(c.h) + ' ' + c.l.map(saPlain).join(' ') + ' ' + saPlain(c.t) + ' ' + c.ks.map(k => saRep(k).t).join(' ')).toLowerCase();
      return hay.includes(q);
    });
  }
  if (SA_MEMO_UI.sort === 'hot') list.sort((a, b) => saCardWeight(b.c) - saCardWeight(a.c) || a.i - b.i);
  else list.sort((a, b) => saCardTopic(a.c) - saCardTopic(b.c) || saCardWeight(b.c) - saCardWeight(a.c));
  return list;
}

function saRenderMemoCards() {
  const counts = SA_TOPICS.map((t, i) => SA_MEMO.cards.filter(c => saCardTopic(c) === i).length);
  document.getElementById('sa-memo-body').innerHTML = `
    <div class="year-filter" id="sa-memo-chips"></div>
    <div class="sa-opts" style="margin-top:0">
      <span><label for="sa-memo-q">검색</label><input id="sa-memo-q" type="search" placeholder="예: 1.5m, 부싱, 종단저항" value="${esc(SA_MEMO_UI.q)}" oninput="saMemoSearch(this.value)"></span>
      <span><label for="sa-memo-sort">정렬</label><select id="sa-memo-sort" onchange="saMemoSort(this.value)">
        <option value="hot" ${SA_MEMO_UI.sort === 'hot' ? 'selected' : ''}>많이 출제된 순</option>
        <option value="topic" ${SA_MEMO_UI.sort === 'topic' ? 'selected' : ''}>주제순</option></select></span>
      <span id="sa-memo-count" class="sa-same"></span>
    </div>
    <div id="sa-memo-list"></div>`;
  document.getElementById('sa-memo-chips').innerHTML =
    `<div class="filter-chip ${SA_MEMO_UI.topic < 0 ? 'active' : ''}" onclick="saMemoTopic(-1)">전체 (${SA_MEMO.cards.length})</div>` +
    SA_TOPICS.map((t, i) => counts[i] ? `<div class="filter-chip ${SA_MEMO_UI.topic === i ? 'active' : ''}" onclick="saMemoTopic(${i})">${esc(t)} (${counts[i]})</div>` : '').join('');
  saRenderMemoList();
}

function saRenderMemoList() {
  const list = saMemoFiltered();
  const cnt = document.getElementById('sa-memo-count');
  if (cnt) cnt.textContent = `${list.length}장`;
  document.getElementById('sa-memo-list').innerHTML = list.map(({ c, i }) => {
    const first = c.ks[0], o = saRep(first), n = saCardWeight(c);
    const badge = c.ks.length > 1
      ? `<span class="sa-repeat ${n >= 3 ? 'hot' : ''}">📅 관련 출제 ${n}회</span>`
      : saRepeatBadge(first);
    const rel = c.ks.map(k => {
      const ro = saRep(k);
      return `<details class="sa-memo-rel"><summary>${esc(ro.t)} <span class="sa-same">· 출제 ${saCount(k)}회 · ${saYears(k)}</span></summary>
        <div class="sa-var"><span class="lbl">문제</span><div class="sa-q">${ro.qh}</div><span class="lbl" style="margin-top:6px">원문 정답</span><div class="sa-a">${ro.ah}</div>${saLawBox(k)}
        <div class="sa-wn-actions"><button type="button" class="btn btn-outline btn-sm" onclick="saMemoPractice('${k}')">📝 이 문제 풀기</button></div></div></details>`;
    }).join('');
    const cmp = [...new Set(c.ks.flatMap(k => SA_CMP_BY_K[k] || []))];
    return `<div class="sa-memo-card">
      <div class="sa-memo-head">${badge}<span class="q-cat-badge">${esc(saTopicOf(first))}</span>
        <span class="sa-memo-qt">${esc(o.t)}${c.ks.length > 1 ? ` 외 ${c.ks.length - 1}문제` : ''}</span></div>
      ${saLawMemoAlert(c.ks)}
      <div class="sa-memo-hook">${c.h}</div>
      <ul class="sa-memo-lines">${c.l.map(x => `<li>${x}</li>`).join('')}</ul>
      ${saLawRelated(c.ks)}
      ${c.t ? `<div class="sa-memo-trap">⚠️ ${c.t}</div>` : ''}
      <details class="sa-memo-ans"><summary>🙈 관련 문제·정답 확인 (${c.ks.length}개)</summary>${rel}</details>
      <div class="sa-memo-cmps">${cmp.map(id => `<button type="button" class="sa-cmp-link" onclick="saMemoGoCompare('${id}')">🔢 ${esc(SA_CMP_BY_ID[id].t)}</button>`).join('')}
        <button type="button" class="sa-cmp-link go" onclick="saMemoPracticeCard(${i})">📝 ${c.ks.length > 1 ? `관련 ${c.ks.length}문제 풀기` : '문제로 풀어보기'}</button></div>
    </div>`;
  }).join('') || '<div class="wn-empty"><div class="we-icon">🔍</div><div>조건에 맞는 카드가 없어요.</div></div>';
}

function saMemoTopic(i) { SA_MEMO_UI.topic = i; saRenderMemoCards(); }
function saMemoSearch(v) { SA_MEMO_UI.q = v; saRenderMemoList(); }
function saMemoSort(v) { SA_MEMO_UI.sort = v; saRenderMemoList(); }

function saMemoPractice(k) {
  if (!SA_CL[k]) return;
  saLaunch('암기노트 · ' + saRep(k).t, [{ k, id: SA_CL[k].rep }], 'memo');
}
function saMemoPracticeCard(i) {
  const c = SA_MEMO.cards[i];
  saLaunch('암기노트 · ' + saRep(c.ks[0]).t + (c.ks.length > 1 ? ' 외' : ''), c.ks.map(k => ({ k, id: SA_CL[k].rep })), 'memo');
}

// ---- 카드 훈련 (문제 → 힌트 → 정답 → 알겠어요/헷갈려요)
function saRenderFlash() {
  const el = document.getElementById('sa-memo-body');
  if (!SA_FLASH) {
    const counts = SA_TOPICS.map((t, i) => SA_BANK.clusters.filter(c => c.tp === i && SA_CARD_BY_K[c.k] !== undefined).length);
    el.innerHTML = `<p class="sa-note">문제만 보고 먼저 떠올려 보세요(인출 연습). 막히면 <b>힌트</b>(암기법 한 줄) → <b>정답</b> 순서로 확인하고, 헷갈리면 🤔를 눌러 단답 오답노트에 담으세요.</p>
      <div class="sa-panel-head">주제 선택 (미선택 = 전체)</div>
      <div class="year-filter" id="sa-flash-chips"><div class="filter-chip ${SA_MEMO_UI.topic < 0 ? 'active' : ''}" onclick="saFlashTopic(-1)">전체</div>` +
      SA_TOPICS.map((t, i) => counts[i] ? `<div class="filter-chip ${SA_MEMO_UI.topic === i ? 'active' : ''}" onclick="saFlashTopic(${i})">${esc(t)} (${counts[i]})</div>` : '').join('') +
      `</div><div class="sa-start"><span id="sa-flash-sum"></span><button class="btn btn-primary btn-lg" onclick="saFlashStart()">🃏 훈련 시작</button></div>`;
    const n = SA_BANK.clusters.filter(c => (SA_MEMO_UI.topic < 0 || c.tp === SA_MEMO_UI.topic) && SA_CARD_BY_K[c.k] !== undefined).length;
    document.getElementById('sa-flash-sum').innerHTML = `${SA_MEMO_UI.topic < 0 ? '전체' : esc(SA_TOPICS[SA_MEMO_UI.topic])} → <em>${n}</em>장 (랜덤)`;
    return;
  }
  const F = SA_FLASH;
  if (F.i >= F.deck.length) {
    el.innerHTML = `<div class="result-hero"><div class="result-score">${F.known} / ${F.deck.length}</div>
      <div class="result-grade">알겠어요 ${F.known} · 헷갈려요 ${F.flagged.size}</div></div>
      <p class="sa-note">헷갈려요로 담은 ${F.flagged.size}개는 📗 단답 오답노트에 들어 있습니다.</p>
      <div class="sa-wn-actions"><button class="btn btn-primary" onclick="saFlashReset()">🔄 다시 고르기</button>
      <button class="btn btn-outline" onclick="showScreen('sa-wrong')">📗 단답 오답노트</button>
      <button class="btn btn-outline" onclick="undoDo()" title="마지막 카드를 다시 판단하기">↶ 마지막 카드 되돌리기</button></div>`;
    return;
  }
  const k = F.deck[F.i], o = saRep(k), ci = SA_CARD_BY_K[k], c = SA_MEMO.cards[ci];
  let body = `<div class="sa-title">${esc(o.t)}</div><div class="sa-q">${o.qh}</div>`;
  if (F.stage >= 1) body += `<div class="sa-memo-box"><div class="sa-memo-title">💡 힌트</div><div class="sa-memo-hook">${c.ks.some(saLawNeedsUpdate) ? '현행 보충이 있는 암기법입니다. 정답을 열어 과거 표현과 현재 조건을 함께 확인하세요.' : c.h}</div></div>`;
  if (F.stage >= 2) body += `<div class="answer-reveal show"><div class="answer-reveal-body" style="display:block"><div class="sa-original-label">📚 기출 정리본 정답 (원문 보존)</div><div class="sa-a">${o.ah}</div>${saLawBox(k)}${saMemoBox(k)}</div></div>`;
  const btns = F.stage === 0
    ? `<button class="btn btn-outline" onclick="saFlashStage(1)">💡 힌트(암기법)</button><button class="btn btn-primary" onclick="saFlashStage(2)">정답 확인</button>`
    : F.stage === 1
      ? `<button class="btn btn-primary" onclick="saFlashStage(2)">정답 확인</button>`
      : `<button class="btn btn-success" onclick="saFlashNext(true)">👍 알겠어요</button><button class="btn btn-outline" onclick="saFlashNext(false)">🤔 헷갈려요 (오답노트에 담기)</button>`;
  el.innerHTML = `<div class="sa-flash-top"><span>${F.i + 1} / ${F.deck.length}</span>
      <div class="progress-bar" style="flex:1"><div class="progress-fill" style="width:${(F.i + 1) / F.deck.length * 100}%"></div></div>
      <button class="btn btn-outline btn-sm" onclick="saFlashReset()">그만하기</button>
      <button class="btn btn-outline btn-sm" onclick="undoDo()" title="바로 전 단계로 되돌리기 (이전 카드 · 힌트/정답 취소 등)">↶ 이전 단계</button></div>
    <div class="q-card"><div class="q-badge">${saRepeatBadge(k)}<span class="q-cat-badge">${esc(saTopicOf(k))}</span></div>
    ${body}<div class="sa-flash-btns">${btns}</div></div>`;
}

function saFlashStart() {
  const deck = saShuffle(SA_BANK.clusters.filter(c => (SA_MEMO_UI.topic < 0 || c.tp === SA_MEMO_UI.topic) && SA_CARD_BY_K[c.k] !== undefined).map(c => c.k));
  if (!deck.length) { showToast('카드가 없어요'); return; }
  SA_FLASH = { deck, i:0, stage:0, known:0, flagged:new Set() };
  saRenderFlash();
}
function saFlashTopic(i) { SA_MEMO_UI.topic = i; saRenderFlash(); }
function saFlashReset() { SA_FLASH = null; saRenderFlash(); }
function saFlashStage(s) { SA_FLASH.stage = s; saRenderFlash(); }
function saFlashNext(known) {
  const F = SA_FLASH, k = F.deck[F.i];
  if (known) F.known++;
  else if (!F.flagged.has(k)) {
    F.flagged.add(k);
    STORE.sa.wrong[k] = (STORE.sa.wrong[k] || 0) + 1;      // 헷갈려요 = 단답·서술 오답노트에 담기(세션당 1회)
    STORE._dirty = true;
    _persistSA();
    updateSyncBadge();
    showToast('🤔 단답 오답노트에 담았어요');
  }
  F.i++;
  F.stage = 0;
  saRenderFlash();
  window.scrollTo(0, 0);
}
