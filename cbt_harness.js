// Minimal DOM-less harness to execute the inline CBT script in a Node vm context.
const fs = require('fs');
const vm = require('vm');

function makeElement(id) {
  const el = {
    id, style: {}, dataset: {}, value: '', checked: false, disabled: false,
    innerHTML: '', textContent: '', className: '', files: [], children: [],
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      toggle(c, f) { const on = f === undefined ? !this._s.has(c) : !!f; on ? this._s.add(c) : this._s.delete(c); return on; },
      contains(c) { return this._s.has(c); }
    },
    addEventListener() {}, removeEventListener() {}, click() {}, focus() {}, scrollIntoView() {},
    insertAdjacentHTML(_p, h) { this.innerHTML += h; },
    _q: null, querySelector() { return this._q; }, querySelectorAll() { return []; },
    setAttribute() {}, getAttribute() { return null; }, appendChild() {}, remove() {},
    closest() { return null; }, getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; }
  };
  return el;
}

function load(htmlPath, opts = {}) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  if (scripts.length !== 1) throw new Error('expected exactly one inline script, found ' + scripts.length);
  if (/\bsrc\s*=/.test(scripts[0][1])) throw new Error('external script dependency found');
  const elements = {};
  const intervals = [];
  const lsData = Object.assign({}, opts.localStorage || {});
  const clock = { now: opts.now || 1_700_000_000_000 };
  const toasts = [];
  const captured = { blob: null, downloads: 0 };
  const document = {
    getElementById(id) { return elements[id] || (elements[id] = makeElement(id)); },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener() {}, createElement() { return makeElement('_new'); },
    body: makeElement('body'), documentElement: makeElement('html')
  };
  const sandbox = {
    document,
    window: { addEventListener() {}, scrollTo() {}, location: { href: 'file:///cbt.html' } },
    navigator: { userAgent: 'node-test' },
    localStorage: {
      getItem: k => (k in lsData ? lsData[k] : null),
      setItem: (k, v) => { lsData[k] = String(v); },
      removeItem: k => { delete lsData[k]; }
    },
    console, JSON, Math, Set, Map, Object, Array, String, Number, Date: class extends Date {
      static now() { return clock.now; }
    },
    setTimeout: () => 0, clearTimeout() {},
    setInterval: (fn) => { intervals.push(fn); return intervals.length; },
    clearInterval() {},
    confirm: opts.confirm || (() => true), alert() {},
    Blob: class { constructor(p, o) { this.parts = p; this.options = o; } },
    URL: { createObjectURL: (b) => { captured.blob = b; return 'blob:x'; }, revokeObjectURL() {} },
    FileReader: class { readAsText(f) { this.onload({ target: { result: f.text } }); } },
    scrollTo() {}
  };
  sandbox.window.document = document;
  const context = vm.createContext(sandbox);
  vm.runInContext(scripts[0][2], context, { filename: 'cbt-inline.js' });
  return { context, elements, intervals, clock, lsData, toasts, captured, run: (code) => { const r = vm.runInContext(code, context); return (r && typeof r === 'object') ? JSON.parse(JSON.stringify(r)) : r; } };
}

module.exports = { load };
