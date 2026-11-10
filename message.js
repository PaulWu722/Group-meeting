// 信息內容：把管理頁填的文字排版成網頁（首頁與管理頁預覽共用）
//
// content = {
//   series:    '第一次讀經就上手'            眉標（選填）
//   subtitle:  '供應我們的需要，並帶我們渡過難關'
//   pray:      { ref: '可 6:50~51', text: '耶穌立即同他們講話…' }
//   hymn:      { title: '喫、喝、呼吸', lyrics: '1 你經過程…\n\n（副）\n聖氣給我呼吸…' }
//   message:   信息選讀（◆ 開頭＝小標題；整段用（ ）括起來＝出處；空行分段）
//   questions: 問題研討（一行一題）
// }
(() => {
  'use strict';
  const { esc } = window.GM;
  const B = window.GM_BIBLE;
  const NUMS = ['壹', '貳', '參', '肆', '伍', '陸'];
  const ZH_Q = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

  // 1～199 → 中文數字（六、十二、二十三、一百五十）
  function zhNum(n) {
    const d = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    if (n < 10) return d[n];
    if (n < 20) return '十' + d[n % 10];
    if (n < 100) return d[Math.floor(n / 10)] + '十' + d[n % 10];
    const r = n % 100;
    return '一百' + (r === 0 ? '' : r < 10 ? '零' + d[r] : zhNum(r).replace(/^十/, '一十'));
  }

  // 讀經範圍 → 「馬可福音第六章」「馬可福音第四至五章」「詩篇第二十三篇」
  function readingText(bible) {
    return (Array.isArray(bible) ? bible : []).map(B.normalize).filter(Boolean).map((s) => {
      if (s.book.chapters === 1) return s.book.name;
      const unit = s.b === 19 ? '篇' : '章';
      return s.c1 === s.c2 ? `${s.book.name}第${zhNum(s.c1)}${unit}`
        : `${s.book.name}第${zhNum(s.c1)}至${zhNum(s.c2)}${unit}`;
    }).join('、');
  }

  const isEnd = (line) => /[。！？!?」』：:；;）)]$/.test(line);
  const isHeading = (line) => /^[◆◇■●#＃]/.test(line);
  const stripHeading = (line) => line.replace(/^[◆◇■●#＃]+\s*/, '');
  const isCitation = (p) => /^[（(].*[)）]$/.test(p) && p.length < 80;

  // 信息選讀：空行分段；從 PDF 貼上的斷行會自動接回（上一行不是句尾就接起來）
  function messageBlocks(text) {
    const blocks = [];
    let buf = '';
    const flush = () => { if (buf) blocks.push(buf); buf = ''; };
    String(text || '').replace(/\r/g, '').split('\n').forEach((raw) => {
      const line = raw.trim();
      if (!line) { flush(); return; }
      if (isHeading(line)) { flush(); blocks.push({ h: stripHeading(line) }); return; }
      if (buf && isEnd(buf)) flush();
      buf += line;
    });
    flush();
    return blocks.map((b) => {
      if (typeof b === 'object') return `<h4 class="msg-h">${esc(b.h)}</h4>`;
      if (isCitation(b)) return `<p class="msg-cite">${esc(b)}</p>`;
      return `<p class="msg-p">${esc(b)}</p>`;
    }).join('');
  }

  // 詩歌：空行分節；「（副）」開頭的一節是副歌；行首數字是節數
  function hymnBlocks(text) {
    const groups = [];
    let cur = null;
    String(text || '').replace(/\r/g, '').split('\n').forEach((raw) => {
      const line = raw.trim();
      if (!line) { cur = null; return; }
      const chorus = line.match(/^[（(]?副(歌)?[)）]?\s*[:：]?\s*(.*)$/);
      if (chorus && (chorus[2] === '' || /^[（(]/.test(line))) {
        cur = { chorus: true, lines: [] };
        groups.push(cur);
        if (chorus[2]) cur.lines.push(chorus[2]);
        return;
      }
      const num = line.match(/^(\d+)[.、．\s]\s*(.*)$/);
      if (num) {
        cur = { no: num[1], lines: [] };
        groups.push(cur);
        if (num[2]) cur.lines.push(num[2]);
        return;
      }
      if (!cur) { cur = { lines: [] }; groups.push(cur); }
      cur.lines.push(line);
    });
    return groups.map((g) => {
      const lines = g.lines.map((l) => `<p>${esc(l)}</p>`).join('');
      if (g.chorus) return `<div class="hymn-chorus"><span class="hymn-label">（副）</span>${lines}</div>`;
      return `<div class="hymn-stanza">${g.no ? `<span class="hymn-no">${esc(g.no)}</span>` : ''}<div>${lines}</div></div>`;
    }).join('');
  }

  const questionList = (text) => String(text || '').split('\n')
    .map((l) => l.trim().replace(/^([一二三四五六七八九十]+[、.．]|\d+[、.．)）]|[（(]\d+[)）])\s*/, ''))
    .filter(Boolean);

  const section = (i, title, sub, body) => `
    <section class="msg-sec">
      <div class="msg-sec-head"><span class="msg-num">${NUMS[i] || i + 1}</span>
        <h3>${esc(title)}${sub ? `<span class="msg-sec-sub">：${sub}</span>` : ''}</h3><span class="msg-line"></span></div>
      ${body}
    </section>`;

  function hasContent(item) {
    const c = (item && item.content) || {};
    return !!(c.subtitle || (c.pray && (c.pray.ref || c.pray.text)) || (c.hymn && (c.hymn.title || c.hymn.lyrics))
      || (c.message || '').trim() || (c.questions || '').trim());
  }

  // 回傳信息內容的 HTML（不含最上面的標題，標題由頁面本身顯示）
  function render(item) {
    const c = item.content || {};
    const out = [];
    const reading = readingText(item.bible);
    const pray = c.pray || {};
    if (reading || pray.ref || pray.text) {
      out.push((i) => section(i, '讀經', esc(reading ? reading + '。' : ''), (pray.ref || pray.text) ? `
        <div class="msg-pray"><span class="msg-pray-label">禱讀：</span>${pray.ref ? `<b class="msg-pray-ref">${esc(pray.ref)}</b>` : ''}
          <span class="msg-pray-text">${esc(pray.text || '')}</span></div>` : ''));
    }
    const hymn = c.hymn || {};
    if (hymn.title || (hymn.lyrics || '').trim()) {
      out.push((i) => section(i, '詩歌', esc(hymn.title || ''), (hymn.lyrics || '').trim()
        ? `<div class="msg-hymn">${hymnBlocks(hymn.lyrics)}</div>` : ''));
    }
    if ((c.message || '').trim()) {
      out.push((i) => section(i, '信息選讀', '', `<div class="msg-body">${messageBlocks(c.message)}</div>`));
    }
    const qs = questionList(c.questions);
    if (qs.length) {
      out.push((i) => section(i, '問題研討', '', `<ol class="msg-q">${qs.map((q, k) =>
        `<li><span class="msg-q-no">${ZH_Q[k] || k + 1}、</span><span>${esc(q)}</span></li>`).join('')}</ol>`));
    }
    return `<div class="msg">${out.map((f, i) => f(i)).join('')}</div>`;
  }

  // 「可 6:50~51」→ {b, c, v1, v2}
  function parseRef(ref) {
    const m = String(ref || '').trim().match(/^(.+?)\s*(\d+)\s*[:：]\s*(\d+)(?:\s*[~～\-－–—]\s*(\d+))?$/);
    if (!m) return null;
    const name = m[1].trim();
    const idx = B.BOOKS.findIndex((b) => b[0] === name || b[1] === name);
    if (idx < 0) return null;
    const v1 = Number(m[3]), v2 = Number(m[4] || m[3]);
    return { b: idx + 1, c: Number(m[2]), v1: Math.min(v1, v2), v2: Math.max(v1, v2) };
  }

  window.GM_MSG = { render, hasContent, readingText, parseRef, zhNum };
})();
