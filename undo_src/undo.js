
// ============================================================
//  ↶ 되돌리기 / ↷ 다시 실행  (전역 실행취소)
//  - 사용자가 한 일(채점·문제 이동·정답 보기·화면 이동·시험 종료·시작·오답노트 삭제/초기화·카드 훈련·파일 불러오기)을
//    직전 상태 스냅샷으로 저장해 두었다가 복원한다. 기존 함수는 건드리지 않고 래퍼로 감싼다(상태가 안 바뀐 호출은 기록하지 않음).
//  - 되돌리기 대상이 아닌 것: 메모 입력(내 답안 칸·내 암기노트 글), 범위 선택 칩/옵션, 저장된 파일(cbt_data.json) 자체
//  - 되돌리기 기록은 메모리에만 있다(새로고침하면 사라짐). 복원된 오답·풀이 기록은 localStorage에 즉시 다시 저장된다.
//  - 어떤 오류가 나도 원래 기능이 멈추지 않도록 모든 훅은 try/catch 로 감싼다.
// ============================================================
const UNDO = { stack:[], redo:[], max:120, depth:0, busy:false, lastStore:'', snackTimer:null, show:null };
const UNDO_BACK = { on:true, warnAt:0, armed:false };

function undoActiveScreen() {
  const el = document.querySelector('.screen.active');
  return el && el.id ? el.id.replace(/^screen-/, '') : 'home';
}

const UNDO_SCREEN_NAMES = {
  quiz:'시험 화면', result:'시험 결과', 'sa-quiz':'단답 풀이', 'sa-result':'단답 결과', home:'홈',
  'exam-select':'회차별', 'random-config':'랜덤', 'concept-select':'개념별학습', conceptnote:'암기노트',
  wrongnote:'복습노트', sa:'단답·서술', 'sa-wrong':'단답 오답노트', 'sa-memo':'단답 암기노트'
};
function undoScreenName(name) {
  return UNDO_SCREEN_NAMES[name] || name;
}

// ---- 스냅샷 -------------------------------------------------
function undoSnap(opts) {
  opts = opts || {};
  const s = { screen: undoActiveScreen(), y: Number(window.scrollY) || 0, notes: !!opts.notes };
  if (STATE && STATE.questions && STATE.questions.length) {
    s.st = {
      mode:STATE.mode, questions:STATE.questions, cur:STATE.cur,
      answers:Object.assign({}, STATE.answers), pointScores:Object.assign({}, STATE.pointScores),
      userTexts:Object.assign({}, STATE.userTexts), shown:Object.assign({}, STATE.shown),
      examId:STATE.examId, conceptName:STATE.conceptName || null, studyMode:!!STATE.studyMode,
      timerMinutes:STATE.timerMinutes, timerEndsAt:STATE.timerEndsAt, startedAt:STATE.startedAt, finished:!!STATE.finished
    };
  }
  const store = {
    wrong:STORE.wrong, solved:STORE.solved, history:STORE.history,
    sa:{ wrong:STORE.sa.wrong, solved:STORE.sa.solved, history:STORE.sa.history }
  };
  if (opts.notes) store.myNotes = STORE.myNotes;
  let j = JSON.stringify(store);
  if (j === UNDO.lastStore) j = UNDO.lastStore; else UNDO.lastStore = j;   // 같은 문자열은 하나만 보관
  s.store = j;
  if (SA_STATE) {
    s.sa = {
      title:SA_STATE.title, mode:SA_STATE.mode, units:SA_STATE.units, cur:SA_STATE.cur,
      answers:Object.assign({}, SA_STATE.answers), texts:Object.assign({}, SA_STATE.texts),
      shown:Object.assign({}, SA_STATE.shown), snap:Object.assign({}, SA_STATE.snap),
      study:!!SA_STATE.study, startedAt:SA_STATE.startedAt, finished:!!SA_STATE.finished
    };
  }
  s.saLast = SA_LAST;
  if (SA_FLASH) s.flash = { deck:SA_FLASH.deck, i:SA_FLASH.i, stage:SA_FLASH.stage, known:SA_FLASH.known, flagged:Array.from(SA_FLASH.flagged) };
  s.memo = { tab:SA_MEMO_UI.tab, topic:SA_MEMO_UI.topic, q:SA_MEMO_UI.q, sort:SA_MEMO_UI.sort };
  if (s.screen === 'result' || s.screen === 'sa-result') {
    const el = document.getElementById('screen-' + s.screen);
    if (el) s.html = el.innerHTML;
  }
  return s;
}

// 상태가 실제로 달라졌는지 비교하는 서명(스크롤·메모 입력은 제외)
function undoSig(s) {
  return JSON.stringify([
    s.screen,
    s.st ? [s.st.cur, s.st.answers, s.st.pointScores, s.st.shown, s.st.studyMode, s.st.finished, s.st.startedAt, s.st.questions.length] : 0,
    s.store,
    s.sa ? [s.sa.cur, s.sa.answers, s.sa.shown, s.sa.study, s.sa.finished, s.sa.startedAt, s.sa.units.length] : 0,
    s.flash ? [s.flash.i, s.flash.stage, s.flash.known, s.flash.flagged, s.flash.deck.length] : 0,
    s.memo.tab
  ]);
}

// ---- 기록 --------------------------------------------------
function undoCommit(before, label, opts) {
  try {
    if (!before) return;
    const now = undoSnap({ notes:before.notes });
    if (undoSig(before) === undoSig(now)) return;        // 아무 것도 안 바뀐 호출은 기록하지 않음
    UNDO.stack.push({ snap:before, label:label, t:Date.now(), nav:!!(opts && opts.nav) });
    while (UNDO.stack.length > UNDO.max) UNDO.stack.shift();
    UNDO.redo = [];                                      // 새 작업을 하면 '다시 실행' 기록은 사라짐
    undoRefreshUI();
    if (!(opts && opts.nav)) undoSnack(label);
  } catch (e) { /* 되돌리기 기록 실패가 원래 기능을 막으면 안 됨 */ }
}

function undoBegin(label, opts) {
  try {
    if (UNDO.busy || UNDO.depth > 0) return null;
    return { before:undoSnap(opts), label:label, opts:opts };
  } catch (e) { return null; }
}
function undoEnd(tok) {
  if (tok) undoCommit(tok.before, tok.label, tok.opts);
}

function undoWrap(name, labelFn, opts) {
  const orig = globalThis[name];
  if (typeof orig !== 'function') return;
  globalThis[name] = function () {
    if (UNDO.busy || UNDO.depth > 0) return orig.apply(this, arguments);   // 안쪽(중첩) 호출은 바깥 작업에 포함
    let before = null;
    try { before = undoSnap(opts); } catch (e) { before = null; }
    const args = Array.prototype.slice.call(arguments);
    UNDO.depth++;
    try {
      return orig.apply(this, args);
    } finally {
      UNDO.depth--;
      try {
        if (before) undoCommit(before, labelFn(args, before) || name, opts);
      } catch (e) { /* ignore */ }
    }
  };
}

// ---- 복원 --------------------------------------------------
function undoQuizTitle() {
  const qs = STATE.questions, m = STATE.mode;
  return m === 'exam' ? `${qs[0] && qs[0].y}년 제${qs[0] && qs[0].r}회`
    : m === 'wrong' ? '오답노트 시험'
    : m === 'concept' ? `🧠 ${STATE.conceptName}` : '랜덤 시험';
}

function undoRestore(s) {
  UNDO.busy = true;
  let note = '';
  try {
    if (QUIZ_TIMER_INTERVAL) { clearInterval(QUIZ_TIMER_INTERVAL); QUIZ_TIMER_INTERVAL = null; }

    // 1) 시험 상태 (내 답안 메모는 같은 시험이면 지금 것을 그대로 유지)
    if (s.st) {
      const same = STATE && STATE.startedAt && STATE.startedAt === s.st.startedAt;
      STATE = Object.assign({}, s.st, {
        answers:Object.assign({}, s.st.answers), pointScores:Object.assign({}, s.st.pointScores),
        shown:Object.assign({}, s.st.shown),
        userTexts: same ? STATE.userTexts : Object.assign({}, s.st.userTexts)
      });
    } else {
      STATE = { mode:null, questions:[], cur:0, answers:{}, pointScores:{}, userTexts:{}, shown:{}, examId:null,
        studyMode:false, timerMinutes:null, timerEndsAt:null, startedAt:null, finished:false };
    }

    // 2) 단답·서술 / 카드 훈련 / 암기노트 UI
    if (s.sa) {
      const same = SA_STATE && SA_STATE.startedAt === s.sa.startedAt;
      SA_STATE = Object.assign({}, s.sa, {
        answers:Object.assign({}, s.sa.answers), shown:Object.assign({}, s.sa.shown), snap:Object.assign({}, s.sa.snap),
        texts: same ? SA_STATE.texts : Object.assign({}, s.sa.texts)
      });
    } else { SA_STATE = null; }
    SA_LAST = s.saLast;
    SA_FLASH = s.flash ? { deck:s.flash.deck, i:s.flash.i, stage:s.flash.stage, known:s.flash.known, flagged:new Set(s.flash.flagged) } : null;
    Object.assign(SA_MEMO_UI, s.memo);

    // 3) 저장 데이터(오답·풀이·이력) — 바뀌었을 때만 다시 저장
    if (s.store !== JSON.stringify(Object.assign({
      wrong:STORE.wrong, solved:STORE.solved, history:STORE.history,
      sa:{ wrong:STORE.sa.wrong, solved:STORE.sa.solved, history:STORE.sa.history } }, s.notes ? { myNotes:STORE.myNotes } : {}))) {
      const st = JSON.parse(s.store);
      STORE.wrong = st.wrong || {};
      STORE.solved = st.solved || [];
      STORE.history = st.history || [];
      STORE.sa = normalizeSA(st.sa);
      if (st.myNotes !== undefined) STORE.myNotes = st.myNotes;
      STORE._dirty = true;
      _persistToLS();
      _persistSA();
      updateSyncBadge();
    }

    // 4) 열려 있던 팝업 닫기 → 화면 전환(원래 showScreen 이 화면별 렌더를 처리)
    const modal = document.getElementById('modal-overlay');
    if (modal && modal.classList) modal.classList.remove('open');
    UNDO.show(s.screen);

    // 5) 화면별 복원
    if (s.screen === 'quiz' && STATE.questions.length) {
      const tl = document.getElementById('quiz-title-label');
      if (tl) tl.textContent = undoQuizTitle();
      const sb = document.getElementById('btn-study-mode');
      if (sb && sb.classList) { if (STATE.studyMode) sb.classList.add('on'); else sb.classList.remove('on'); }
      renderQuizQuestion();
    }
    if (STATE.questions.length && !STATE.finished && STATE.timerMinutes > 0) {
      const left = (Number(STATE.timerEndsAt) || 0) - Date.now();
      if (left > 1000) startQuizTimer(left / 60000);
      else {
        STATE.timerMinutes = null; STATE.timerEndsAt = null;
        const tw = document.getElementById('quiz-timer-wrap');
        if (tw) tw.style.display = 'none';
        note = ' (시험시간이 이미 끝나 시간제한 없이 이어갑니다)';
      }
    } else {
      const tw = document.getElementById('quiz-timer-wrap');
      if (tw) tw.style.display = 'none';
    }
    if (s.screen === 'sa-quiz' && SA_STATE) {
      const tt = document.getElementById('sa-quiz-title');
      if (tt) tt.textContent = SA_STATE.title;
      const b = document.getElementById('btn-sa-study');
      if (b && b.classList) { if (SA_STATE.study) b.classList.add('on'); else b.classList.remove('on'); }
      saRenderQuestion();
    }
    if (s.html !== undefined && (s.screen === 'result' || s.screen === 'sa-result')) {
      const el = document.getElementById('screen-' + s.screen);
      if (el) el.innerHTML = s.html;
    }
    if (typeof window.scrollTo === 'function') window.scrollTo(0, s.y || 0);
    undoPlaceFab();
  } finally {
    UNDO.busy = false;
  }
  return note;
}

function undoStep(quiet) {
  const e = UNDO.stack.pop();
  if (!e) return null;
  UNDO.redo.push({ snap:undoSnap({ notes:e.snap.notes }), label:e.label, t:e.t, nav:e.nav });
  const note = undoRestore(e.snap);
  return { e, note };
}

function undoDo() {
  if (UNDO.busy) return;
  try {
    if (!UNDO.stack.length) { showToast('되돌릴 작업이 없어요'); return; }
    const r = undoStep();
    undoHideSnack();
    undoRefreshUI();
    showToast(`↶ 되돌렸어요: ${r.e.label}${r.note}`, 2600);
  } catch (err) { showToast('되돌리기 중 문제가 생겼어요: ' + err.message, 3000); }
}

function redoDo() {
  if (UNDO.busy) return;
  try {
    const e = UNDO.redo.pop();
    if (!e) { showToast('다시 실행할 작업이 없어요'); return; }
    UNDO.stack.push({ snap:undoSnap({ notes:e.snap.notes }), label:e.label, t:e.t, nav:e.nav });
    const note = undoRestore(e.snap);
    undoHideSnack();
    undoRefreshUI();
    showToast(`↷ 다시 실행: ${e.label}${note}`, 2600);
  } catch (err) { showToast('다시 실행 중 문제가 생겼어요: ' + err.message, 3000); }
}

// 목록에서 고른 지점까지 한꺼번에 되돌리기 / 다시 실행
function undoJump(idx) {
  if (UNDO.busy) return;
  try {
    const n = UNDO.stack.length - idx;
    if (n <= 0 || idx < 0) return;
    let last = null;
    for (let i = 0; i < n; i++) last = undoStep();
    undoHideSnack();
    undoRefreshUI();
    showToast(`↶ ${n}단계 되돌렸어요 (${last.e.label} 이전으로)`, 2600);
  } catch (err) { showToast('되돌리기 중 문제가 생겼어요: ' + err.message, 3000); }
}
function redoJump(idx) {
  if (UNDO.busy) return;
  try {
    const n = UNDO.redo.length - idx;
    if (n <= 0 || idx < 0) return;
    for (let i = 0; i < n; i++) {
      const e = UNDO.redo.pop();
      UNDO.stack.push({ snap:undoSnap({ notes:e.snap.notes }), label:e.label, t:e.t, nav:e.nav });
      undoRestore(e.snap);
    }
    undoHideSnack();
    undoRefreshUI();
    showToast(`↷ ${n}단계 다시 실행했어요`, 2200);
  } catch (err) { showToast('다시 실행 중 문제가 생겼어요: ' + err.message, 3000); }
}

function undoClear() {
  UNDO.stack = []; UNDO.redo = [];
  undoHideSnack();
  undoRefreshUI();
  showToast('작업 기록을 지웠어요');
}

// ---- UI ----------------------------------------------------
function undoAgo(t) {
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
  return sec < 60 ? `${sec}초 전` : sec < 3600 ? `${Math.round(sec / 60)}분 전` : `${Math.round(sec / 3600)}시간 전`;
}

function undoRenderPanel() {
  const el = document.getElementById('undo-panel-body');
  if (!el) return;
  const nUndo = UNDO.stack.length;
  const undoItems = UNDO.stack.slice().reverse().slice(0, 30).map((e, k) => {
    const idx = nUndo - 1 - k;
    return `<button type="button" class="undo-item" onclick="undoJump(${idx})"><span class="ui-t">${esc(e.label)}</span><span class="ui-s">${k === 0 ? '방금 · ' : ''}${undoAgo(e.t)}</span></button>`;
  }).join('');
  const nRedo = UNDO.redo.length;
  const redoItems = UNDO.redo.slice().reverse().slice(0, 15).map((e, k) => {
    const idx = nRedo - 1 - k;
    return `<button type="button" class="undo-item redo" onclick="redoJump(${idx})"><span class="ui-t">${esc(e.label)}</span><span class="ui-s">↷ 다시 실행</span></button>`;
  }).join('');
  el.innerHTML =
    `<div class="undo-sec">↶ 되돌리기 (누른 항목 <b>이전 상태</b>로 돌아가요 · 위에서부터 최근 작업)</div>` +
    (undoItems || '<div class="undo-empty">아직 되돌릴 작업이 없어요</div>') +
    (redoItems ? `<div class="undo-sec">↷ 다시 실행</div>` + redoItems : '');
}

function undoRefreshUI() {
  try {
    const ub = document.getElementById('undo-btn'), rb = document.getElementById('redo-btn'), cnt = document.getElementById('undo-count');
    const top = UNDO.stack[UNDO.stack.length - 1], rtop = UNDO.redo[UNDO.redo.length - 1];
    if (ub) { ub.disabled = !top; ub.title = top ? `되돌리기 (Ctrl+Z) — ${top.label}` : '되돌릴 작업이 없어요'; }
    if (rb) { rb.disabled = !rtop; rb.title = rtop ? `다시 실행 (Ctrl+Y) — ${rtop.label}` : '다시 실행할 작업이 없어요'; }
    if (cnt) cnt.textContent = UNDO.stack.length ? String(Math.min(UNDO.stack.length, 99)) : '';
    const panel = document.getElementById('undo-panel');
    if (panel && panel.style.display !== 'none') undoRenderPanel();
  } catch (e) { /* ignore */ }
}

function undoTogglePanel(ev) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  const panel = document.getElementById('undo-panel');
  if (!panel) return;
  const open = panel.style.display === 'none';
  panel.style.display = open ? 'flex' : 'none';
  if (open) {
    const chk = document.getElementById('undo-back-chk');
    if (chk) chk.checked = UNDO_BACK.on;
    undoRenderPanel();
  }
}

// 버튼·알림·기록창을 화면 아래 '이전/다음' 바(퀴즈 화면) 바로 위에 맞춘다
function undoPlaceFab() {
  try {
    const nav = document.querySelector('.screen.active .quiz-nav');
    const base = nav && nav.offsetHeight ? nav.offsetHeight + 14 : (nav ? 74 : 14);
    const fab = document.getElementById('undo-fab'), snack = document.getElementById('undo-snack'), panel = document.getElementById('undo-panel');
    if (fab) fab.style.bottom = base + 'px';
    if (panel) panel.style.bottom = (base + 52) + 'px';
    if (snack) snack.style.bottom = (base + 58) + 'px';
  } catch (e) { /* ignore */ }
}

function undoSnack(label) {
  try {
    const box = document.getElementById('undo-snack'), tx = document.getElementById('undo-snack-text');
    if (!box || !tx) return;
    undoPlaceFab();
    tx.textContent = label;
    box.style.display = 'flex';
    if (UNDO.snackTimer) clearTimeout(UNDO.snackTimer);
    UNDO.snackTimer = setTimeout(undoHideSnack, 6000);
  } catch (e) { /* ignore */ }
}
function undoHideSnack() {
  const box = document.getElementById('undo-snack');
  if (box) box.style.display = 'none';
  if (UNDO.snackTimer) { clearTimeout(UNDO.snackTimer); UNDO.snackTimer = null; }
}

// ---- 뒤로가기(브라우저/휴대폰) = 되돌리기 ----------------------
function undoSetBack(on) {
  UNDO_BACK.on = !!on;
  try { localStorage.setItem('cbt_undo_back', on ? '1' : '0'); } catch (e) { /* ignore */ }
  showToast(on ? '뒤로가기 버튼으로 되돌리기를 사용합니다' : '뒤로가기 버튼이 원래대로 동작합니다');
}

function undoArmBack() {
  try { history.pushState({ cbt:'guard' }, ''); UNDO_BACK.armed = true; } catch (e) { /* ignore */ }
}

// 크롬은 사용자 조작 없이 쌓은 기록은 뒤로가기에서 건너뛰므로, 처음 터치/클릭/키 입력 때 한 번 걸어 둔다
function undoArmOnGesture() {
  if (UNDO_BACK.armed) return;
  undoArmBack();
  ['pointerdown', 'touchstart', 'keydown', 'click'].forEach(t => document.removeEventListener(t, undoArmOnGesture, true));
}

function undoOnPop() {
  try {
    if (!UNDO_BACK.armed) return;
    if (!UNDO_BACK.on) { history.back(); return; }                   // 기능을 끈 상태: 원래대로 한 칸 더 뒤로(=페이지 나감)
    if (UNDO.stack.length) { undoDo(); undoArmBack(); return; }
    const now = Date.now();
    if (now - UNDO_BACK.warnAt < 2500) { UNDO_BACK.warnAt = 0; history.back(); return; }   // 연속 두 번 = 정말 나가기
    UNDO_BACK.warnAt = now;
    undoArmBack();
    showToast('더 되돌릴 작업이 없어요. 뒤로가기를 한 번 더 누르면 페이지를 나갑니다', 2600);
  } catch (e) { /* ignore */ }
}

function undoIsTyping(t) {
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable ||
    (tag === 'INPUT' && !/^(checkbox|radio|button|submit|file)$/i.test(t.type || ''));
}

// ---- 설치 ---------------------------------------------------
(function undoInstall() {
  try {
    UNDO.show = showScreen;                         // 래퍼를 씌우기 전의 원래 함수(복원용)
    const ico = { O:'✅', P:'🟡', X:'❌' };
    const noteN = qid => { const q = DB_MAP[qid]; return q ? String(q.n).padStart(2, '0') : '?'; };
    const saT = k => { const o = SA_CL[k] && SA_OCC[SA_CL[k].rep]; return o ? o.t.slice(0, 16) : k; };

    // 화면 이동·문제 이동·정답 보기 등 '탐색'은 기록은 하되 되돌리기 알림(스낵바)은 띄우지 않는다
    undoWrap('showScreen', a => `화면 이동 · ${undoScreenName(a[0])}`, { nav:true });
    undoWrap('moveQ', (a, b) => `문제 이동 (${b.st ? b.st.cur + 1 : '?'}번 → ${STATE.cur + 1}번)`, { nav:true });
    undoWrap('toggleAnswer', a => `정답 ${STATE.shown[a[0]] ? '보기' : '닫기'} · 문제 ${noteN(a[0])}`, { nav:true });
    undoWrap('toggleStudyMode', () => `공부모드 ${STATE.studyMode ? 'ON' : 'OFF'}`, { nav:true });
    undoWrap('gradeQ', a => `문제 ${noteN(a[0])} 채점 ${ico[STATE.answers[a[0]]] || ''}`);
    undoWrap('launchQuiz', () => `시험 시작 · ${undoQuizTitle()}`);
    undoWrap('finishExam', a => a[0] === true ? '시간 종료 · 자동 채점' : '시험 종료 · 결과 보기');
    undoWrap('confirmEnd', () => '시험 종료 · 결과 보기');
    undoWrap('clearWrongNote', () => '복습노트 전체 초기화');

    undoWrap('saLaunch', a => `단답 풀이 시작 · ${a[0]}`);
    undoWrap('saGrade', a => `단답 채점 ${ico[a[1]] || ''} · ${saT(a[0])}`);
    undoWrap('saMove', (a, b) => `단답 문제 이동 (${b.sa ? b.sa.cur + 1 : '?'}번 → ${SA_STATE ? SA_STATE.cur + 1 : '?'}번)`, { nav:true });
    undoWrap('saToggleAnswer', a => `단답 정답 ${SA_STATE && SA_STATE.shown[a[0]] ? '보기' : '닫기'}`, { nav:true });
    undoWrap('saToggleStudy', () => `단답 공부모드 ${SA_STATE && SA_STATE.study ? 'ON' : 'OFF'}`, { nav:true });
    undoWrap('saFinish', () => '단답 풀이 종료 · 결과 보기');
    undoWrap('saConfirmEnd', () => '단답 풀이 종료');
    undoWrap('saRemoveWrong', a => `단답 오답노트에서 제거 · ${saT(a[0])}`);
    undoWrap('saClearWrong', () => '단답 오답노트 전체 초기화');
    undoWrap('saFlashStart', () => '카드 훈련 시작');
    undoWrap('saFlashStage', a => a[0] === 1 ? '카드: 힌트 보기' : '카드: 정답 보기', { nav:true });
    undoWrap('saFlashNext', a => a[0] ? '카드: 👍 알겠어요' : '카드: 🤔 헷갈려요');
    undoWrap('saFlashReset', () => '카드 훈련 그만하기');

    document.addEventListener('keydown', e => {
      try {
        if (undoIsTyping(e.target)) return;                       // 입력 칸에서는 브라우저 기본 되돌리기(글자 되돌리기) 사용
        const key = String(e.key || '').toLowerCase();
        if (e.key === 'Escape') { const p = document.getElementById('undo-panel'); if (p && p.style.display !== 'none') p.style.display = 'none'; return; }
        if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
        if (key === 'z' && !e.shiftKey) { e.preventDefault(); undoDo(); }
        else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); redoDo(); }
      } catch (err) { /* ignore */ }
    });
    document.addEventListener('click', e => {                     // 패널 바깥을 누르면 닫기
      try {
        const p = document.getElementById('undo-panel');
        if (p && p.style.display !== 'none' && !(e.target.closest && e.target.closest('#undo-panel'))) p.style.display = 'none';
      } catch (err) { /* ignore */ }
    });

    try { UNDO_BACK.on = localStorage.getItem('cbt_undo_back') !== '0'; } catch (e) { /* ignore */ }
    if (typeof history !== 'undefined' && history.pushState && typeof window.addEventListener === 'function') {
      history.replaceState({ cbt:'base' }, '');
      ['pointerdown', 'touchstart', 'keydown', 'click'].forEach(t => document.addEventListener(t, undoArmOnGesture, true));
      window.addEventListener('popstate', undoOnPop);
    }
    // 화면이 바뀔 때마다 버튼 위치(퀴즈 화면의 아래 바 높이)를 다시 맞춘다
    const shown = globalThis.showScreen;
    globalThis.showScreen = function () { const r = shown.apply(this, arguments); undoPlaceFab(); return r; };
    window.addEventListener('resize', undoPlaceFab);
    undoPlaceFab();
    undoRefreshUI();
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('undo init failed', e);
  }
})();
