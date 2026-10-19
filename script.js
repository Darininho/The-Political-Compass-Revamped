'use strict';
/* THE POLITICAL COMPASS — logic. Content lives in data.js. */

if (typeof module !== 'undefined' && typeof AXES === 'undefined') {
  Object.assign(globalThis, require('./data.js'));
}

const KEYS = ['econ', 'auth', 'soc'];
const POS  = { econ: 'x', auth: 'y', soc: 'z' };
const SCALE = [
  { label: 'Strongly agree',    v: 1,     key: '1' },
  { label: 'Agree',             v: 0.67,  key: '2' },
  { label: 'Somewhat agree',    v: 0.33,  key: '3' },
  { label: 'Somewhat disagree', v: -0.33, key: '4' },
  { label: 'Disagree',          v: -0.67, key: '5' },
  { label: 'Strongly disagree', v: -1,    key: '6' },
];

/* ───────── scoring (pure) ───────── */

// People differ in how readily they agree with anything. Because every axis
// has as many statements pointing each way, the average answer should sit
// near zero; whatever is left over is habit, not opinion, and is removed.
function acquiescence(ans) {
  const v = ans.filter(a => a !== undefined && a !== 0);
  if (v.length < 12) return 0;
  return v.reduce((s, a) => s + a, 0) / v.length;
}

function score(ans) {
  const acq = acquiescence(ans);
  const num = { econ: 0, auth: 0, soc: 0 }, den = { econ: 0, auth: 0, soc: 0 };
  const got = { econ: 0, auth: 0, soc: 0 }, tot = { econ: 0, auth: 0, soc: 0 };
  const contrib = [];
  QUESTIONS.forEach((q, i) => {
    tot[q.a]++;
    const a = ans[i];
    if (a === undefined || a === 0) return;
    got[q.a]++;
    const v = Math.max(-1, Math.min(1, a - acq));
    KEYS.forEach(k => {
      const w = q.w[k] || 0;
      if (!w) return;
      num[k] += v * w; den[k] += Math.abs(w);
      contrib.push({ i, k, push: v * w });
    });
  });
  const val = {}, rel = {};
  KEYS.forEach(k => {
    val[k] = den[k] ? Math.max(-10, Math.min(10, (num[k] / den[k]) * 10)) : 0;
    rel[k] = tot[k] ? got[k] / tot[k] : 0;
  });
  return { val, rel, got, tot, acq, contrib };
}

function dist(p, ideo) {
  let s = 0;
  KEYS.forEach(k => { s += (p[k] - ideo[POS[k]]) ** 2; });
  return Math.sqrt(s / 3);
}

function rank(p) {
  return IDEOLOGIES.map(d => {
    const dd = dist(p, d);
    return { d: dd, ideo: d, match: Math.max(0, Math.round(100 - dd * 5)) };
  }).sort((a, b) => a.d - b.d);
}

function biggestGap(p, ideo) {
  let best = null;
  KEYS.forEach(k => {
    const g = ideo[POS[k]] - p[k];
    if (!best || Math.abs(g) > Math.abs(best.g)) best = { k, g };
  });
  return best;
}

if (typeof module !== 'undefined') module.exports = { score, rank, dist, acquiescence, SCALE, KEYS };

/* ───────── page ───────── */
if (typeof document !== 'undefined') (function () {

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('pc_' + k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem('pc_' + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem('pc_' + k); } catch (e) {} },
};

let ORDER = [], pos = 0, ans = [], view = 'home', lastResult = null, explainOpen = false;

// Mix the statements so no axis appears twice in a row and topics are spread out.
function makeOrder() {
  const pools = {};
  KEYS.forEach(k => {
    pools[k] = QUESTIONS.map((q, i) => i).filter(i => QUESTIONS[i].a === k).sort(() => Math.random() - 0.5);
  });
  const out = []; let last = null;
  while (out.length < QUESTIONS.length) {
    const opts = KEYS.filter(k => pools[k].length && k !== last);
    const pick = (opts.length ? opts : KEYS.filter(k => pools[k].length))
      .sort((a, b) => pools[b].length - pools[a].length + (Math.random() - 0.5) * 0.9)[0];
    out.push(pools[pick].pop()); last = pick;
  }
  return out;
}

function show(id) {
  ['v-home', 'v-quiz', 'v-result'].forEach(v => $(v).classList.toggle('hidden', v !== id));
  view = id; window.scrollTo(0, 0);
}

/* ── home ── */
function renderHome() {
  $('axis-cards').innerHTML = KEYS.map(k => {
    const a = AXES[k];
    return `<div class="axis-card"><p class="eyebrow">${esc(a.name)} axis</p><h3>${esc(a.q)}</h3>
      <div class="poles"><div><b>${esc(a.low)}</b><p>${esc(a.lowText)}</p></div><div><b>${esc(a.high)}</b><p>${esc(a.highText)}</p></div></div></div>`;
  }).join('');
  drawCompass($('home-compass'), null, []);
  $('resume-btn').classList.toggle('hidden', !(store.get('progress') && store.get('progress').ans.some(a => a !== undefined && a !== null)));
}

/* ── compass (SVG) ── */
const SZ = 440, PAD = 20, HALF = (SZ - PAD * 2) / 2;
const px = x => PAD + HALF + x * HALF / 10;
const py = y => PAD + HALF - y * HALF / 10;

function drawCompass(el, me, labelled) {
  const grid = [];
  for (let i = -10; i <= 10; i += 2) {
    if (i === 0) continue;
    grid.push(`<line x1="${px(i)}" y1="${py(-10)}" x2="${px(i)}" y2="${py(10)}"/><line x1="${px(-10)}" y1="${py(i)}" x2="${px(10)}" y2="${py(i)}"/>`);
  }
  const lab = new Set(labelled.map(r => r.ideo.name));
  const dots = IDEOLOGIES.map((d, i) => {
    const on = lab.has(d.name);
    return `<circle class="idot${on ? ' on' : ''}" data-i="${i}" cx="${px(d.x)}" cy="${py(d.y)}" r="${on ? 5 : 4}" tabindex="0" aria-label="${esc(d.name)}"/>`;
  }).join('');
  // nearest ideologies get a numbered marker; names go in the legend below the chart
  const labels = labelled.map((r, n) => {
    const cx = px(r.ideo.x), cy = py(r.ideo.y);
    return `<g class="nmark"><circle cx="${cx}" cy="${cy}" r="8.5"/><text x="${cx}" y="${cy + 3.5}" text-anchor="middle">${n + 1}</text></g>`;
  }).reverse().join('');
  const meDot = me ? `<circle class="me-ring" cx="${px(me.econ)}" cy="${py(me.auth)}" r="13"/><circle class="me" cx="${px(me.econ)}" cy="${py(me.auth)}" r="4.5"/>` : '';
  el.innerHTML = `<div class="compass-box"><div class="compass-axes"><span class="ax-t">Authoritarian</span><span class="ax-b">Libertarian</span><span class="ax-l">Left</span><span class="ax-r">Right</span></div>
  <svg viewBox="0 0 ${SZ} ${SZ}" class="compass" role="img" aria-label="Political compass${me ? ' with your position' : ''}">
    <rect class="q-al" x="${px(-10)}" y="${py(10)}" width="${HALF}" height="${HALF}"/>
    <rect class="q-ar" x="${px(0)}" y="${py(10)}" width="${HALF}" height="${HALF}"/>
    <rect class="q-ll" x="${px(-10)}" y="${py(0)}" width="${HALF}" height="${HALF}"/>
    <rect class="q-lr" x="${px(0)}" y="${py(0)}" width="${HALF}" height="${HALF}"/>
    <g class="grid">${grid.join('')}</g>
    <line class="axis" x1="${px(-10)}" y1="${py(0)}" x2="${px(10)}" y2="${py(0)}"/>
    <line class="axis" x1="${px(0)}" y1="${py(-10)}" x2="${px(0)}" y2="${py(10)}"/>
    <g>${dots}</g>${labels}${meDot}
  </svg></div>${labelled.length ? `<ol class="clegend">${labelled.map(r => `<li><button onclick="PC.openIdeo(${IDEOLOGIES.indexOf(r.ideo)})">${esc(r.ideo.name)}</button> <span class="num muted">${r.match}%</span></li>`).join('')}</ol>` : ''}`;
  el.querySelectorAll('.idot').forEach(c => {
    const d = IDEOLOGIES[+c.dataset.i];
    const showTip = () => {
      const r = c.getBoundingClientRect(), t = $('tip');
      t.innerHTML = `<b>${esc(d.name)}</b><span class="tip-xy">${fmt(d.x)} econ · ${fmt(d.y)} auth · ${fmt(d.z)} culture</span><p>${esc(d.desc)}</p><span class="tip-more">Click for details</span>`;
      t.classList.remove('hidden');
      const w = t.offsetWidth, h = t.offsetHeight;
      let left = r.left + r.width / 2 - w / 2; left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
      let top = r.top - h - 10; if (top < 8) top = r.bottom + 10;
      t.style.left = left + 'px'; t.style.top = top + 'px';
    };
    c.addEventListener('mouseenter', showTip); c.addEventListener('focus', showTip);
    c.addEventListener('mouseleave', hideTip); c.addEventListener('blur', hideTip);
    c.addEventListener('click', () => { hideTip(); openIdeo(+c.dataset.i); });
    c.addEventListener('keydown', e => { if (e.key === 'Enter') { hideTip(); openIdeo(+c.dataset.i); } });
  });
}
function hideTip() { $('tip').classList.add('hidden'); }
const fmt = n => (n > 0 ? '+' : '') + (Math.round(n * 10) / 10).toFixed(1);

/* culture bar: progressive ← → traditional */
function drawCultureBar(me, top) {
  const pct = v => ((v + 10) / 20) * 100;
  return `<div class="cbar">
    <div class="cbar-ends"><span>Progressive</span><span>Traditional</span></div>
    <div class="cbar-track">
      <span class="cbar-mid"></span>
      ${top ? `<span class="cbar-ideo" style="left:${pct(top.z)}%" title="${esc(top.name)}"></span>` : ''}
      <span class="cbar-me" style="left:${pct(me.soc)}%"></span>
    </div>
    <div class="cbar-legend"><span><i class="lg-me"></i>You ${fmt(me.soc)}</span>${top ? `<span><i class="lg-ideo"></i>${esc(top.name)} ${fmt(top.z)}</span>` : ''}</div>
  </div>`;
}

/* ── quiz ── */
function start() {
  ORDER = makeOrder(); ans = new Array(QUESTIONS.length); pos = 0;
  save(); show('v-quiz'); renderQ();
}
function resume() {
  const p = store.get('progress'); if (!p) return start();
  ORDER = p.order; pos = p.pos; ans = p.ans.map(a => (a === null ? undefined : a));
  if (pos >= ORDER.length) return finish();
  show('v-quiz'); renderQ();
}
function save() { store.set('progress', { order: ORDER, pos, ans: ans.map(a => (a === undefined ? null : a)) }); }

function renderQ() {
  const q = QUESTIONS[ORDER[pos]];
  $('q-cat').textContent = q.cat;
  $('q-num').textContent = `${pos + 1} of ${ORDER.length}`;
  $('q-track').style.width = (pos / ORDER.length * 100) + '%';
  $('q-text').textContent = q.t;
  $('explain').textContent = q.h;
  explainOpen = false; $('explain').classList.add('hidden');
  $('explain-btn').setAttribute('aria-expanded', 'false');
  const cur = ans[ORDER[pos]];
  $('scale').innerHTML = SCALE.map((s, i) =>
    `<button class="opt-btn${cur === s.v ? ' picked' : ''}" data-side="${i < 3 ? 'a' : 'd'}" onclick="PC.vote(${s.v})"><span>${s.label}</span><kbd>${s.key}</kbd></button>`).join('');
}
function vote(v) {
  ans[ORDER[pos]] = v; pos++; save();
  if (pos >= ORDER.length) finish(); else renderQ();
}
function back() {
  if (pos === 0) { show('v-home'); renderHome(); return; }
  pos--; save(); renderQ();
}
function toggleExplain() {
  explainOpen = !explainOpen;
  $('explain').classList.toggle('hidden', !explainOpen);
  $('explain-btn').setAttribute('aria-expanded', String(explainOpen));
}

/* ── result ── */
function finish() {
  const s = score(ans);
  const r = rank(s.val);
  lastResult = { s, r };
  store.set('last', { ans: ans.map(a => (a === undefined ? null : a)) });
  show('v-result');
  renderResult();
}

function axisReading(k, v) {
  const a = AXES[k], m = Math.abs(v);
  const side = v < 0 ? a.low : a.high;
  if (m < 1.5) return `Close to the centre. You split between ${a.low.toLowerCase()} and ${a.high.toLowerCase()} positions, or hold them weakly.`;
  const deg = m < 4 ? 'Leaning' : m < 7 ? 'Clearly' : 'Strongly';
  return `${deg} ${side.toLowerCase()}. ${v < 0 ? a.lowText : a.highText}`;
}

function renderResult() {
  const { s, r } = lastResult, me = s.val, top = r[0], d = top.ideo;
  const answered = ans.filter(a => a !== undefined && a !== 0).length;
  const near = r.slice(1, 7);
  const far = r[r.length - 1];
  const close = r[1] && r[1].match >= top.match - 2;

  const pulls = KEYS.map(k => {
    const list = s.contrib.filter(c => c.k === k && QUESTIONS[c.i].a === k)
      .sort((a, b) => Math.abs(b.push) - Math.abs(a.push)).slice(0, 3);
    return `<div class="pull"><h4>${esc(AXES[k].name)}</h4><ul>${list.map(c => {
      const q = QUESTIONS[c.i], a = ans[c.i], lab = SCALE.find(x => x.v === a);
      const dir = c.push < 0 ? AXES[k].low : AXES[k].high;
      return `<li><span class="pq">“${esc(q.t)}”</span><span class="muted small">You: ${lab ? lab.label.toLowerCase() : '—'} → toward ${esc(dir.toLowerCase())}</span></li>`;
    }).join('') || '<li class="muted">No answers on this axis.</li>'}</ul></div>`;
  }).join('');

  $('v-result').innerHTML = `
  <div class="res-hero">
    <img class="hero-img" src="${esc(d.img || PLACEHOLDER_IMG)}" alt="" onerror="this.src=PLACEHOLDER_IMG">
    <div>
      <p class="eyebrow">Your closest match · ${top.match}%</p>
      <h1>${esc(d.name)}</h1>
      <p class="lede">${esc(d.desc)}</p>
      <p class="coords">Economic ${fmt(me.econ)} · Authority ${fmt(me.auth)} · Culture ${fmt(me.soc)}</p>
      ${close ? `<p class="note">Close call: <b>${esc(r[1].ideo.name)}</b> is almost as near (${r[1].match}%). Read both.</p>` : ''}
    </div>
  </div>

  <div class="res-grid">
    <section class="card chart-card">
      <h2>Your position</h2>
      <div class="compass-wrap" id="res-compass"></div>
      <h3 class="bar-h">Culture</h3>
      ${drawCultureBar(me, d)}
      <p class="muted small">The white ring is you. Numbered dots are your nearest ideologies, listed above. The culture axis is a separate dimension, so two people at the same spot on the compass can sit far apart on the bar.</p>
      <button class="btn text small" onclick="PC.toggleTable()" id="tbl-btn">Show as table</button>
      <div id="res-table" class="hidden"></div>
    </section>

    <section class="card">
      <h2>Your three axes</h2>
      ${KEYS.map(k => {
        const v = me[k], a = AXES[k];
        return `<div class="axrow">
          <div class="axrow-head"><b>${esc(a.name)}</b><span class="num">${fmt(v)}</span></div>
          <div class="axbar"><span class="axbar-mid"></span><span class="axbar-fill" style="${v < 0 ? `right:50%;width:${-v * 5}%` : `left:50%;width:${v * 5}%`}"></span></div>
          <div class="axbar-ends"><span>${esc(a.low)}</span><span>${esc(a.high)}</span></div>
          <p>${esc(axisReading(k, v))}</p>
          <p class="muted small">Based on ${s.got[k]} of ${s.tot[k]} statements.${s.got[k] < s.tot[k] * 0.6 ? ' You skipped a lot here, so treat this one loosely.' : ''}</p>
          <p class="small term"><b>${esc(a.term[0])}:</b> ${esc(a.term[1])}</p>
        </div>`;
      }).join('')}
    </section>
  </div>

  <section class="card">
    <h2>About ${esc(d.name)}</h2>
    ${ideoBody(d)}
  </section>

  <section class="card">
    <h2>Your neighbours</h2>
    <p class="muted">The next closest ideologies, and the one thing that most separates you from each.</p>
    <div class="near-grid">${near.map(x => {
      const g = biggestGap(me, x.ideo), a = AXES[g.k];
      return `<button class="near" onclick="PC.openIdeo(${IDEOLOGIES.indexOf(x.ideo)})">
        <span class="near-top"><b>${esc(x.ideo.name)}</b><span class="num">${x.match}%</span></span>
        <span class="small">${esc(x.ideo.desc)}</span>
        <span class="muted small">Biggest difference: ${esc(a.name.toLowerCase())} — it sits at ${fmt(x.ideo[POS[g.k]])}, you at ${fmt(me[g.k])}.</span></button>`;
    }).join('')}</div>
    <p class="far">Furthest from you: <button class="link" onclick="PC.openIdeo(${IDEOLOGIES.indexOf(far.ideo)})">${esc(far.ideo.name)}</button> <span class="muted">(${far.match}%)</span></p>
  </section>

  <section class="card">
    <h2>What pulled you here</h2>
    <p class="muted">Your three most decisive answers on each axis.</p>
    <div class="pull-grid">${pulls}</div>
  </section>

  <section class="card">
    <h2>How this test works</h2>
    <p>Each statement is weighted toward one pole of an axis, and some lean slightly on a second axis too. Your position on each axis is the weighted average of your answers, from −10 to +10. Skipped statements are left out, not counted as neutral.</p>
    <p>Every axis has 14 statements pointing each way. Some people agree with most things they read regardless of content; because the test is balanced, any overall tilt toward agreeing is treated as habit and removed.${s.acq ? ` Your answers leaned ${s.acq > 0 ? 'toward agreeing' : 'toward disagreeing'} by ${Math.abs(Math.round(s.acq * 100))} points out of 100, and that was corrected.` : ''}</p>
    <p>The match percentage is based on your distance from each ideology across all three axes. You answered ${answered} of ${QUESTIONS.length} statements.</p>
    <h3>Limits worth knowing</h3>
    <ul class="limits">
      <li>Ideologies are placed by judgement, not measured. Followers of any of them would argue about where they belong.</li>
      <li>Three axes are a simplification. Two people can share a position and disagree about almost everything that matters to them, such as how change should happen or who counts as "the people".</li>
      <li>The statements are written from a Western, mostly European and North American, point of view. "Traditional" means different things in different places.</li>
      <li>Some movements on the map are tied to mass violence. A match describes a set of positions, not an endorsement of that history.</li>
    </ul>
  </section>

  <section class="card">
    <h2>Glossary</h2>
    <dl class="gloss">${GLOSSARY.map(g => `<div><dt>${esc(g[0])}</dt><dd>${esc(g[1])}</dd></div>`).join('')}</dl>
  </section>

  <div class="res-foot">
    <button class="btn primary" onclick="PC.copy()" id="copy-btn">Share as image</button>
    <button class="btn ghost" onclick="PC.openList()">Browse all ideologies</button>
    <button class="btn ghost" onclick="PC.retake()">Retake</button>
  </div>`;

  drawCompass($('res-compass'), me, r.slice(0, 7));
  $('res-table').innerHTML = `<table class="tbl"><thead><tr><th></th><th>Economic</th><th>Authority</th><th>Culture</th><th>Match</th></tr></thead><tbody>
    <tr><th>You</th><td>${fmt(me.econ)}</td><td>${fmt(me.auth)}</td><td>${fmt(me.soc)}</td><td>—</td></tr>
    ${r.slice(0, 7).map(x => `<tr><th>${esc(x.ideo.name)}</th><td>${fmt(x.ideo.x)}</td><td>${fmt(x.ideo.y)}</td><td>${fmt(x.ideo.z)}</td><td>${x.match}%</td></tr>`).join('')}
  </tbody></table>`;
}

function ideoBody(d) {
  const list = (h, arr, cls) => arr && arr.length ? `<div class="${cls || ''}"><h4>${h}</h4><ul>${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
  return `<p>${esc(d.origin)}</p>
    ${list('Core beliefs', d.beliefs, 'beliefs')}
    <div class="two">${list('Strengths', d.strengths, 'pro')}${list('Common criticisms', d.critiques, 'con')}</div>
    <h4>In the real world</h4><p>${esc(d.realworld)}</p>
    <div class="two"><div><h4>Key thinkers</h4><p>${(d.thinkers || []).map(esc).join(', ')}</p></div>
    <div><h4>Where to start reading</h4><p>${esc(d.read || '')}</p></div></div>
    <p class="muted small">Placement: economic ${fmt(d.x)}, authority ${fmt(d.y)}, culture ${fmt(d.z)}.</p>`;
}

/* ── ideology list & detail ── */
function openList() {
  renderList('');
  openModal('m-list');
  setTimeout(() => $('list-search').focus(), 30);
}
function quadOf(d) {
  if (Math.abs(d.x) <= 2 && Math.abs(d.y) <= 2) return 'Centre';
  return (d.y > 0 ? 'Authoritarian' : 'Libertarian') + ' ' + (d.x < 0 ? 'left' : 'right');
}
function renderList(f) {
  f = f.trim().toLowerCase();
  const groups = {};
  IDEOLOGIES.forEach((d, i) => {
    if (f && !(d.name + ' ' + d.desc).toLowerCase().includes(f)) return;
    (groups[quadOf(d)] = groups[quadOf(d)] || []).push(i);
  });
  const order = ['Authoritarian left', 'Authoritarian right', 'Centre', 'Libertarian left', 'Libertarian right'];
  $('list-body').innerHTML = order.filter(g => groups[g]).map(g =>
    `<h4 class="list-h">${g}</h4><div class="list-grid">${groups[g].sort((a, b) => IDEOLOGIES[a].name.localeCompare(IDEOLOGIES[b].name)).map(i =>
      `<button class="list-item" onclick="PC.openIdeo(${i})"><img src="${esc(IDEOLOGIES[i].img || PLACEHOLDER_IMG)}" alt="" onerror="this.src=PLACEHOLDER_IMG"><span><b>${esc(IDEOLOGIES[i].name)}</b><span class="small muted">${esc(IDEOLOGIES[i].desc)}</span></span></button>`).join('')}</div>`
  ).join('') || '<p class="muted">Nothing matches.</p>';
}
function openIdeo(i) {
  const d = IDEOLOGIES[i];
  let you = '';
  if (lastResult) {
    const m = lastResult.r.find(x => x.ideo === d);
    you = `<p class="note">Your match: <b>${m.match}%</b> (#${lastResult.r.indexOf(m) + 1} of ${IDEOLOGIES.length})</p>`;
  }
  $('ideo-body').innerHTML = `<div class="modal-head"><h3>${esc(d.name)}</h3><button class="x" onclick="PC.closeModal()">✕</button></div>
    <div class="ideo-top"><img src="${esc(d.img || PLACEHOLDER_IMG)}" alt="" onerror="this.src=PLACEHOLDER_IMG"><div><p class="lede">${esc(d.desc)}</p>${you}</div></div>
    ${ideoBody(d)}`;
  openModal('m-ideo');
}

let lastFocus = null;
function openModal(id) {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  lastFocus = lastFocus || document.activeElement;
  $(id).classList.remove('hidden'); document.body.classList.add('no-scroll');
  const x = $(id).querySelector('.x'); if (x) x.focus();
}
function closeModal() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  document.body.classList.remove('no-scroll');
  if (lastFocus && lastFocus.focus) lastFocus.focus(); lastFocus = null;
}
document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeModal(); }));

/* ── misc ── */
function copy() {
  const { s: sc, r } = lastResult, me = sc.val, d = r[0].ideo;
  ShareCard.open({
    filename: 'political-compass-' + d.name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''),
    title: 'The Political Compass', text: `I'm closest to ${d.name}. Where do you stand?`,
    theme: { bg: '#12151b', surface: '#1a1e26', ink: '#e6e8ec', muted: '#9aa1ad', line: '#2f3542', accent: '#e2c27a', accentInk: '#14161b' },
    draw: async (ctx, W, H, format, h) => {
      const story = format === 'story', SERIF = 'Fraunces, Georgia, serif', SANS = '"IBM Plex Sans", system-ui, sans-serif', MONO = '"IBM Plex Mono", ui-monospace, monospace';
      ctx.fillStyle = '#12151b'; ctx.fillRect(0, 0, W, H);
      // header: ideology image + name
      const IS = story ? 200 : 170, hx = 90, hy = story ? 150 : 70;
      const img = await h.loadImage(d.img, PLACEHOLDER_IMG);
      if (img) {
        const sc = Math.max(IS / img.naturalWidth, IS / img.naturalHeight), iw = img.naturalWidth * sc, ih = img.naturalHeight * sc;
        ctx.save(); h.round(ctx, hx, hy, IS, IS, 14); ctx.clip(); ctx.drawImage(img, hx + (IS - iw) / 2, hy + (IS - ih) / 2, iw, ih); ctx.restore();
      }
      ctx.strokeStyle = '#e2c27a'; ctx.lineWidth = 3; h.round(ctx, hx, hy, IS, IS, 14); ctx.stroke();
      const tx = hx + IS + 36, tw = W - 90 - tx;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#9aa1ad'; ctx.font = `500 24px ${MONO}`; ctx.fillText('THE POLITICAL COMPASS', tx, hy + 34);
      ctx.fillStyle = '#e6e8ec'; h.fit(ctx, d.name, tw, story ? 76 : 66, 34, SERIF, 500); ctx.fillText(d.name, tx, hy + IS / 2 + 26);
      ctx.fillStyle = '#e2c27a'; ctx.font = `500 30px ${MONO}`; ctx.fillText(`${r[0].match}% MATCH`, tx, hy + IS - 8);
      ctx.textAlign = 'center';
      let y = hy + IS + (story ? 40 : 10);
      // compass
      const S = story ? 640 : 560, x0 = (W - S) / 2, y0 = y + (story ? 70 : 50), half = S / 2;
      const quads = [['#e0605a', x0, y0], ['#4b8fe2', x0 + half, y0], ['#3fb27a', x0, y0 + half], ['#a77fe0', x0 + half, y0 + half]];
      quads.forEach(([c, qx, qy]) => { ctx.fillStyle = c; ctx.globalAlpha = 0.2; ctx.fillRect(qx, qy, half, half); });
      ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(230,232,236,.08)'; ctx.lineWidth = 1;
      for (let i = 1; i < 10; i++) { const t = S * i / 10; ctx.beginPath(); ctx.moveTo(x0 + t, y0); ctx.lineTo(x0 + t, y0 + S); ctx.moveTo(x0, y0 + t); ctx.lineTo(x0 + S, y0 + t); ctx.stroke(); }
      ctx.strokeStyle = '#9aa1ad'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0 + half, y0); ctx.lineTo(x0 + half, y0 + S); ctx.moveTo(x0, y0 + half); ctx.lineTo(x0 + S, y0 + half); ctx.stroke();
      const P = (x, yy) => [x0 + half + x * half / 10, y0 + half - yy * half / 10];
      ctx.fillStyle = 'rgba(141,149,163,.7)';
      IDEOLOGIES.forEach(o => { const [px, py] = P(o.x, o.y); ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill(); });
      const [ix, iy] = P(d.x, d.y); ctx.fillStyle = '#e2c27a'; ctx.beginPath(); ctx.arc(ix, iy, 9, 0, Math.PI * 2); ctx.fill();
      const [mx, my] = P(me.econ, me.auth);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(mx, my, 20, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(mx, my, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#9aa1ad'; ctx.font = `500 22px ${MONO}`;
      ctx.fillText('AUTHORITARIAN', W / 2, y0 - 14); ctx.fillText('LIBERTARIAN', W / 2, y0 + S + 34);
      ctx.save(); ctx.translate(x0 - 18, y0 + half); ctx.rotate(-Math.PI / 2); ctx.fillText('LEFT', 0, 0); ctx.restore();
      ctx.save(); ctx.translate(x0 + S + 18, y0 + half); ctx.rotate(Math.PI / 2); ctx.fillText('RIGHT', 0, 0); ctx.restore();
      // culture bar
      y = y0 + S + (story ? 140 : 100);
      const L = 140, BW = W - 280;
      ctx.textAlign = 'left'; ctx.fillStyle = '#9aa1ad'; ctx.font = `400 26px ${SANS}`; ctx.fillText('Progressive', L, y);
      ctx.textAlign = 'right'; ctx.fillText('Traditional', L + BW, y);
      ctx.textAlign = 'center'; ctx.fillStyle = '#e6e8ec'; ctx.font = `500 26px ${SANS}`; ctx.fillText('Culture', W / 2, y);
      const by = y + 26; ctx.fillStyle = '#232833'; h.round(ctx, L, by, BW, 18, 9); ctx.fill();
      ctx.fillStyle = '#9aa1ad'; ctx.fillRect(L + BW / 2 - 1, by - 6, 2, 30);
      const cx = v => L + (v + 10) / 20 * BW;
      ctx.save(); ctx.translate(cx(d.z), by + 9); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#e2c27a'; ctx.fillRect(-9, -9, 18, 18); ctx.restore();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx(me.soc), by + 9, 14, 0, Math.PI * 2); ctx.fill();
      y = by + (story ? 120 : 92);
      ctx.fillStyle = '#e6e8ec'; ctx.font = `400 30px ${MONO}`;
      ctx.fillText(`Economic ${fmt(me.econ)}  ·  Authority ${fmt(me.auth)}  ·  Culture ${fmt(me.soc)}`, W / 2, y, W - 100);
      if (story) {
        y += 110; ctx.fillStyle = '#9aa1ad'; ctx.font = `500 24px ${MONO}`; ctx.fillText('ALSO CLOSE', W / 2, y); y += 62;
        r.slice(1, 4).forEach(x => {
          ctx.fillStyle = '#e6e8ec'; ctx.font = `400 40px ${SERIF}`; ctx.fillText(`${x.ideo.name}  ·  ${x.match}%`, W / 2, y, W - 160); y += 60;
        });
      }
      ctx.fillStyle = '#6b7280'; ctx.font = `400 24px ${SANS}`;
      ctx.fillText('White = me   ·   gold = ' + d.name, W / 2, H - (story ? 120 : 56), W - 100);
    },
  });
}
function retake() { store.del('progress'); start(); }
function home() { closeModal(); show('v-home'); renderHome(); }
function toggleTable() {
  const t = $('res-table'), open = t.classList.toggle('hidden');
  $('tbl-btn').textContent = open ? 'Show as table' : 'Hide table';
}

function setPref(k, v) {
  const p = store.get('prefs') || {}; p[k] = v; store.set('prefs', p); applyPrefs();
}
function applyPrefs() {
  const p = store.get('prefs') || {}, root = document.documentElement;
  root.dataset.theme = p.theme || 'dark';
  root.dataset.size = p.size || 'normal';
  root.classList.toggle('easy-font', !!p.easy);
  root.classList.toggle('high-contrast', !!p.contrast);
  root.classList.toggle('reduced-motion', !!p.motion);
  $('pref-theme').value = p.theme || 'dark'; $('pref-size').value = p.size || 'normal';
  $('pref-easy').checked = !!p.easy; $('pref-contrast').checked = !!p.contrast; $('pref-motion').checked = !!p.motion;
}

document.addEventListener('keydown', e => {
  if (e.target.matches('input, select, textarea')) return;
  if (e.key === 'Escape') { closeModal(); hideTip(); return; }
  if (!document.querySelector('.modal:not(.hidden)') && view === 'v-quiz') {
    const s = SCALE.find(x => x.key === e.key);
    if (s) { vote(s.v); return; }
    if (e.key === '0') { vote(0); return; }
    if (e.key === 'ArrowLeft' || e.key === 'Backspace') { e.preventDefault(); back(); }
  } else if (view === 'home' || view === 'v-home') {
    if (e.key === 'Enter' && e.target === document.body) start();
  }
});
window.addEventListener('scroll', hideTip, { passive: true });

window.PC = { start, resume, vote, back, toggleExplain, openList, filterList: renderList, openIdeo, openModal, closeModal, copy, retake, home, toggleTable, setPref };
applyPrefs(); renderHome();
})();
