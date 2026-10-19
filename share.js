'use strict';
/* ════════════════════════════════════════════════════════════════
   SHARE CARD — turns a result into an image people can post.
   Shared by all the tests; each test supplies its own draw() and theme.

   ShareCard.open({
     filename: 'my-result',               // without .png
     title:    'The Abyss',               // used by the share sheet
     text:     'I got The Strategist',    // caption for the share sheet
     theme:    { bg, surface, ink, muted, line, accent, accentInk },
     draw:     async (ctx, W, H, format, help) => { ... }   // format: 'post' | 'story'
   })

   help.loadImage(src, fallback) → an image safe to draw (falls back if the host blocks it)
   help.wrap(ctx, text, x, y, maxWidth, lineHeight, maxLines) → y after the last line
   help.fit(ctx, text, maxWidth, size, minSize, family, weight) → font size that fits one line
   help.round(ctx, x, y, w, h, r) → rounded-rectangle path
════════════════════════════════════════════════════════════════ */
(function () {
  const SIZES = { post: [1080, 1350], story: [1080, 1920] };
  let opts = null, format = 'post', blob = null, url = null, lastFocus = null, root = null;

  /* ── drawing helpers ── */
  function testDrawable(img) {
    try {
      const c = document.createElement('canvas'); c.width = c.height = 1;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, 1, 1); x.getImageData(0, 0, 1, 1);
      return true;
    } catch (e) { return false; }
  }
  function rawLoad(src, cors) {
    return new Promise(res => {
      const im = new Image();
      if (cors) im.crossOrigin = 'anonymous';
      im.onload = () => res(im); im.onerror = () => res(null);
      im.src = src;
    });
  }
  async function loadImage(src, fallback) {
    if (src) {
      const remote = /^https?:/i.test(src);
      const im = await rawLoad(src, remote);
      if (im && im.naturalWidth && testDrawable(im)) return im;
    }
    return fallback ? rawLoad(fallback, false) : null;
  }
  function wrap(ctx, text, x, y, maxW, lineH, maxLines) {
    const words = String(text).split(/\s+/); let line = '', n = 0;
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) {
        if (maxLines && n === maxLines - 1) { ctx.fillText(line.replace(/[,.;:]?$/, '…'), x, y); return y + lineH; }
        ctx.fillText(line, x, y); y += lineH; n++; line = words[i];
      } else line = test;
    }
    if (line) { ctx.fillText(line, x, y); y += lineH; }
    return y;
  }
  function fit(ctx, text, maxW, size, min, family, weight) {
    for (; size > min; size -= 2) {
      ctx.font = `${weight || 400} ${size}px ${family}`;
      if (ctx.measureText(text).width <= maxW) return size;
    }
    ctx.font = `${weight || 400} ${min}px ${family}`; return min;
  }
  function round(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  const help = { loadImage, wrap, fit, round };

  /* ── modal ── */
  function build() {
    if (root) return;
    const css = document.createElement('style');
    css.textContent = `
.sc-modal[hidden]{display:none}
.sc-modal{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.7);display:flex;align-items:flex-start;justify-content:center;padding:4vh 16px;overflow-y:auto}
.sc-box{background:var(--sc-surface);color:var(--sc-ink);border:1px solid var(--sc-line);border-radius:8px;width:100%;max-width:520px;padding:18px 20px 22px;font:inherit}
.sc-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.sc-head h3{margin:0;font-size:1.2rem}
.sc-x{background:none;border:0;color:var(--sc-muted);font-size:1.1rem;cursor:pointer;padding:4px 8px}
.sc-tabs{display:flex;gap:6px;margin-bottom:12px}
.sc-tab{flex:1;padding:8px;border:1px solid var(--sc-line);border-radius:6px;background:none;color:var(--sc-muted);cursor:pointer;font:inherit;font-size:.9rem}
.sc-tab[aria-pressed="true"]{border-color:var(--sc-ink);color:var(--sc-ink)}
.sc-prev{display:flex;justify-content:center;align-items:center;background:var(--sc-bg);border-radius:6px;padding:10px;min-height:200px}
.sc-prev img{max-width:100%;max-height:56vh;border-radius:4px;box-shadow:0 6px 24px rgba(0,0,0,.4)}
.sc-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.sc-btn{flex:1 1 auto;padding:10px 14px;border-radius:6px;border:1px solid var(--sc-line);background:none;color:var(--sc-ink);font:inherit;font-weight:600;cursor:pointer}
.sc-btn.main{background:var(--sc-accent);color:var(--sc-accent-ink);border-color:var(--sc-accent)}
.sc-btn:disabled{opacity:.4;cursor:default}
.sc-status{min-height:1.3em;margin:10px 0 0;font-size:.85rem;color:var(--sc-muted)}`;
    document.head.appendChild(css);
    root = document.createElement('div');
    root.className = 'sc-modal'; root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'sc-h');
    root.innerHTML = `<div class="sc-box">
      <div class="sc-head"><h3 id="sc-h">Share your result</h3><button class="sc-x" data-act="close" aria-label="Close">✕</button></div>
      <div class="sc-tabs"><button class="sc-tab" data-fmt="post" aria-pressed="true">Post (4:5)</button><button class="sc-tab" data-fmt="story" aria-pressed="false">Story (9:16)</button></div>
      <div class="sc-prev"><img alt="Preview of your result image"></div>
      <div class="sc-acts">
        <button class="sc-btn main" data-act="share">Share</button>
        <button class="sc-btn" data-act="download">Download image</button>
        <button class="sc-btn" data-act="copy">Copy image</button>
      </div>
      <p class="sc-status" aria-live="polite"></p></div>`;
    document.body.appendChild(root);
    root.addEventListener('click', e => {
      if (e.target === root) return close();
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.fmt) { format = b.dataset.fmt; render(); }
      if (b.dataset.act === 'close') close();
      if (b.dataset.act === 'share') doShare();
      if (b.dataset.act === 'download') download();
      if (b.dataset.act === 'copy') copy();
    });
    document.addEventListener('keydown', e => { if (!root.hidden && e.key === 'Escape') { e.stopPropagation(); close(); } }, true);
  }
  const $ = s => root.querySelector(s);
  const status = t => { $('.sc-status').textContent = t || ''; };

  async function render() {
    root.querySelectorAll('.sc-tab').forEach(t => t.setAttribute('aria-pressed', String(t.dataset.fmt === format)));
    status('Drawing…'); blob = null;
    root.querySelectorAll('[data-act="share"],[data-act="download"],[data-act="copy"]').forEach(b => { b.disabled = true; });
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
    const [W, H] = SIZES[format];
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'); ctx.textBaseline = 'alphabetic';
    try { await opts.draw(ctx, W, H, format, help); }
    catch (e) { status('Could not draw the image.'); console.warn(e); return; }
    blob = await new Promise(r => { try { c.toBlob(r, 'image/png'); } catch (e) { r(null); } });
    if (!blob) { status('Your browser blocked the image. Try downloading a screenshot instead.'); return; }
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(blob);
    $('.sc-prev img').src = url;
    const file = new File([blob], opts.filename + '.png', { type: 'image/png' });
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    const canCopy = !!(navigator.clipboard && window.ClipboardItem);
    $('[data-act="share"]').hidden = !canShare;
    $('[data-act="copy"]').hidden = !canCopy;
    $('[data-act="download"]').classList.toggle('main', !canShare);
    root.querySelectorAll('.sc-acts button').forEach(b => { b.disabled = false; });
    status('');
  }

  async function doShare() {
    if (!blob) return;
    const file = new File([blob], opts.filename + '.png', { type: 'image/png' });
    try { await navigator.share({ files: [file], title: opts.title, text: opts.text }); status('Shared.'); }
    catch (e) { if (e && e.name !== 'AbortError') status('Sharing didn\'t work here. Download the image instead.'); }
  }
  function download() {
    if (!url) return;
    const a = document.createElement('a'); a.href = url; a.download = opts.filename + (format === 'story' ? '-story' : '') + '.png';
    document.body.appendChild(a); a.click(); a.remove();
    status('Saved to your downloads.');
  }
  async function copy() {
    if (!blob) return;
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); status('Image copied. Paste it into a chat or post.'); }
    catch (e) { status('Copying images isn\'t allowed here. Download it instead.'); }
  }

  function open(o) {
    build(); opts = o; format = 'post';
    const t = o.theme || {};
    const set = (k, v, d) => root.style.setProperty(k, v || d);
    set('--sc-bg', t.bg, '#111'); set('--sc-surface', t.surface, '#1b1b1b'); set('--sc-ink', t.ink, '#eee');
    set('--sc-muted', t.muted, '#999'); set('--sc-line', t.line, '#333'); set('--sc-accent', t.accent, '#ddd'); set('--sc-accent-ink', t.accentInk, '#111');
    lastFocus = document.activeElement;
    root.hidden = false; document.body.style.overflow = 'hidden';
    $('.sc-x').focus();
    render();
  }
  function close() {
    root.hidden = true; document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  window.ShareCard = { open, close, help };
})();
