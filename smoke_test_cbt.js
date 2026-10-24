// Regression smoke test for the existing 493-question CBT behaviour (+ SA isolation when --sa is passed).
const assert = require('assert');
const { load } = require('./cbt_harness');
const withSA = process.argv.includes('--sa');
const HTML = process.env.CBT_HTML || 'cbt_v2/cbt.html';

function fresh(ls) { return load(HTML, { localStorage: ls }); }

// ---- 1. bank and explanation integrity
let app = fresh();
assert.strictEqual(app.run('DB.length'), 493);
assert.strictEqual(app.run('EXAM_INDEX.length'), 29);
for (const e of app.run('EXAM_INDEX')) {
  const sum = e.question_ids.reduce((s, id) => s + app.run(`DB_MAP['${id}'].p`), 0);
  assert.strictEqual(sum, 100, 'exam ' + e.exam_id + ' totals ' + sum);
}
assert.ok(app.run(`buildQuestionStudyHtml(DB_MAP['2016_1_06'])`).includes('70㎡/개'));
assert.ok(app.run(`buildQuestionStudyHtml(DB_MAP['2016_1_01'])`).includes('2.727'));

// ---- 2. weighted scoring, partial score, wrong-note updates (existing 복습노트)
app = fresh();
app.run(`startExam('2016_1')`);
assert.strictEqual(app.run('STATE.mode'), 'exam');
const q = app.run('STATE.questions.map(x=>({id:x.id,p:x.p}))');
app.run(`gradeQ('${q[0].id}','O')`);
app.elements[`partial-score-${q[1].id}`] = { value: '1.5', focus() {} };
app.run(`document.getElementById('partial-score-${q[1].id}').value='1.5'`);
app.run(`gradeQ('${q[1].id}','P')`);
assert.strictEqual(app.run(`STATE.answers['${q[1].id}']`), 'P');
assert.strictEqual(app.run(`STATE.pointScores['${q[1].id}']`), 1.5);
// invalid (not a 0.5 multiple) must be rejected
app.run(`document.getElementById('partial-score-${q[2].id}').value='1.3'`);
app.run(`gradeQ('${q[2].id}','P')`);
assert.strictEqual(app.run(`STATE.answers['${q[2].id}']`), undefined);
app.run(`gradeQ('${q[3].id}','X')`);
app.run('finishExam()');
assert.strictEqual(app.run('STATE.finished'), true);
const w = app.run('STORE.wrong');
assert.ok(w[q[1].id] === 1 && w[q[3].id] === 1 && !(q[0].id in w), JSON.stringify(w));
assert.strictEqual(app.run('getHistory().length'), 1);
const hist = app.run('getHistory()[0]');
assert.ok(Math.abs(hist.score - (q[0].p + 1.5)) < 1e-9);
assert.strictEqual(hist.maxScore, 100);
// a correct answer later removes the wrong entry
app.run(`launchQuiz('wrong', [DB_MAP['${q[3].id}']], null)`);
app.run(`gradeQ('${q[3].id}','O')`);
app.run('finishExam()');
assert.ok(!(q[3].id in app.run('STORE.wrong')));

// ---- 3. timer expiry grades automatically
app = fresh();
app.run(`document.getElementById('exam-time-limit').value='120'`);
app.run(`startExam('2016_2')`);
assert.strictEqual(app.run('STATE.timerMinutes'), 120);
assert.ok(app.intervals.length >= 1);
app.clock.now += 121 * 60 * 1000;
app.intervals[app.intervals.length - 1]();
assert.strictEqual(app.run('STATE.finished'), true);
assert.strictEqual(app.run('getHistory()[0].timedOut'), true);

// ---- 4. saved data keeps loading (legacy cbt_data.json shape)
// Synthetic v2 fixture: do not use a real person's saved study records in this public repository.
const legacy = { _version: 2, wrong: { '2016_1_01': 2 }, solved: ['2016_1_01'], history: [], myNotes: {} };
app = fresh({ cbt_store_v2: JSON.stringify(legacy) });
assert.strictEqual(Object.keys(app.run('STORE.wrong')).length, Object.keys(legacy.wrong).length);
assert.strictEqual(app.run('STORE.solved.length'), legacy.solved.length);

if (withSA) require('./smoke_sa')({ assert, fresh, load, HTML, legacy });
console.log('PASS: bank integrity, weighted scoring, partial score rules, wrong-note update, timer expiry, legacy data load' + (withSA ? ', SA mode' : ''));
