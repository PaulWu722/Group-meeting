// 管理頁：登入、編寫／修改／刪除每週信息
(() => {
  'use strict';
  const { $, esc, fmtDate, fmtSize, bibleText, toast, parseDate, ymd, today } = window.GM;
  const API = window.GM_API;
  const B = window.GM_BIBLE;
  const MSG = window.GM_MSG;
  const PASS_KEY = 'groupmeet-admin-pass';
  const DRAFT_KEY = 'groupmeet-draft-v1';

  let pass = sessionStorage.getItem(PASS_KEY) || '';
  let items = [];
  let editing = null; // 正在編輯的那一筆
  let busy = false;
  let filling = false; // 程式在填表單時，不要存草稿

  const showError = (el, msg) => { el.textContent = msg || ''; el.hidden = !msg; };

  // ---------- 登入 ----------
  async function tryLogin(p, silent) {
    try {
      await API.login(p);
      pass = p;
      sessionStorage.setItem(PASS_KEY, p);
      $('#login').hidden = true;
      $('#editor').hidden = false;
      $('#preview-card').hidden = false;
      $('#list-card').hidden = false;
      $('#logout').hidden = false;
      await refresh();
      resetForm(true);
    } catch (e) {
      sessionStorage.removeItem(PASS_KEY);
      if (!silent) showError($('#login-error'), e.message);
    }
  }
  $('#login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    showError($('#login-error'), '');
    tryLogin($('#pass').value, false);
  });
  $('#logout').addEventListener('click', () => { sessionStorage.removeItem(PASS_KEY); location.reload(); });

  async function refresh() {
    items = await API.list();
    renderList();
  }

  // ---------- 讀經段落 ----------
  const bookOptions = (sel) => {
    const group = (from, to, name) => `<optgroup label="${name}">${B.BOOKS.slice(from, to).map((b, i) =>
      `<option value="${from + i + 1}"${from + i + 1 === sel ? ' selected' : ''}>${b[0]}</option>`).join('')}</optgroup>`;
    return group(0, 39, '舊約') + group(39, 66, '新約');
  };
  const chapterOptions = (bookNo, sel) => {
    const n = B.book(bookNo).chapters;
    let h = '';
    for (let c = 1; c <= n; c++) h += `<option value="${c}"${c === sel ? ' selected' : ''}>${c}</option>`;
    return h;
  };

  function addSeg(seg) {
    const s = B.normalize(seg || { b: 43, c1: 1, c2: 1 });
    const row = document.createElement('div');
    row.className = 'seg-row';
    row.innerHTML = `
      <select class="s-book" aria-label="書卷">${bookOptions(s.b)}</select>
      <div class="s-range">
        <select class="s-c1" aria-label="從第幾章">${chapterOptions(s.b, s.c1)}</select>
        <span>～</span>
        <select class="s-c2" aria-label="到第幾章">${chapterOptions(s.b, s.c2)}</select>
        <span class="s-unit">${s.b === 19 ? '篇' : '章'}</span>
      </div>
      <button type="button" class="icon-x" aria-label="移除這段">×</button>`;
    $('#segs').appendChild(row);
    updateSegHint();
  }

  $('#segs').addEventListener('change', (e) => {
    const row = e.target.closest('.seg-row');
    if (!row) return;
    const bSel = row.querySelector('.s-book'), c1 = row.querySelector('.s-c1'), c2 = row.querySelector('.s-c2');
    if (e.target === bSel) {
      const b = Number(bSel.value);
      c1.innerHTML = chapterOptions(b, 1);
      c2.innerHTML = chapterOptions(b, 1);
      row.querySelector('.s-unit').textContent = b === 19 ? '篇' : '章';
    } else if (e.target === c1 && Number(c2.value) < Number(c1.value)) {
      c2.value = c1.value;
    } else if (e.target === c2 && Number(c2.value) < Number(c1.value)) {
      c1.value = c2.value;
    }
    changed();
  });
  $('#segs').addEventListener('click', (e) => {
    if (e.target.closest('.icon-x')) { e.target.closest('.seg-row').remove(); updateSegHint(); changed(); }
  });
  $('#add-seg').addEventListener('click', () => {
    const rows = readSegs();
    addSeg(rows.length ? nextAfter(rows[rows.length - 1], 1) : guessNext()[0] || { b: 43, c1: 1, c2: 1 });
    changed();
  });
  function updateSegHint() {
    $('#add-seg').textContent = $('#segs').children.length ? '＋ 再加一段經文' : '＋ 新增讀經進度';
  }
  const readSegs = () => [...$('#segs').children].map((row) => ({
    b: Number(row.querySelector('.s-book').value),
    c1: Number(row.querySelector('.s-c1').value),
    c2: Number(row.querySelector('.s-c2').value),
  }));

  // 依上一段的長度，接著往下讀（讀完一卷就接下一卷）
  function nextAfter(seg, len) {
    const s = B.normalize(seg);
    let b = s.b, c1 = s.c2 + 1;
    if (c1 > s.book.chapters) { b = s.b === 66 ? 1 : s.b + 1; c1 = 1; }
    const max = B.book(b).chapters;
    return { b, c1, c2: Math.min(max, c1 + (len || s.c2 - s.c1 + 1) - 1) };
  }
  // 新增時，預設接續最近一週的進度
  function guessNext() {
    const last = items.find((x) => Array.isArray(x.bible) && x.bible.length);
    if (!last) return [];
    return last.bible.map(B.normalize).filter(Boolean).map((s) => nextAfter(s, s.c2 - s.c1 + 1));
  }

  // ---------- 禱讀：輸入「可 6:50~51」自動帶入恢復本經文 ----------
  $('#pray-fill').addEventListener('click', async () => {
    const ref = MSG.parseRef($('#f-pray-ref').value);
    if (!ref) { toast('請輸入像「可 6:50~51」這樣的經節', 'error'); return; }
    const bk = B.book(ref.b);
    if (ref.c > bk.chapters) { toast(`${bk.name}只有 ${bk.chapters} 章`, 'error'); return; }
    const btn = $('#pray-fill');
    btn.disabled = true;
    try {
      const verses = (await B.loadChapter(ref.b, ref.c)).filter((v) => v.n >= ref.v1 && v.n <= ref.v2);
      if (!verses.length) throw new Error(`${bk.name}第 ${ref.c} 章沒有這幾節`);
      $('#f-pray-text').value = verses.map((v) => v.text.replace(/\[([^\]]*)\]/g, '$1')).join('');
      changed();
    } catch (e) {
      toast(/[一-鿿]/.test(e.message) ? e.message : '經文載入失敗，請再試一次', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- 表單內容 ----------
  const CONTENT_FIELDS = ['f-series', 'f-subtitle', 'f-pray-ref', 'f-pray-text', 'f-hymn-title', 'f-hymn', 'f-message', 'f-questions'];
  const val = (id) => $('#' + id).value.trim();

  function readContent() {
    const c = {
      series: val('f-series'),
      subtitle: val('f-subtitle'),
      pray: { ref: val('f-pray-ref'), text: val('f-pray-text') },
      hymn: { title: val('f-hymn-title'), lyrics: $('#f-hymn').value.replace(/\s+$/, '') },
      message: $('#f-message').value.replace(/\s+$/, ''),
      questions: val('f-questions'),
    };
    if (!c.pray.ref && !c.pray.text) delete c.pray;
    if (!c.hymn.title && !c.hymn.lyrics) delete c.hymn;
    Object.keys(c).forEach((k) => { if (c[k] === '') delete c[k]; });
    return c;
  }

  function fillContent(c = {}) {
    $('#f-series').value = c.series || '';
    $('#f-subtitle').value = c.subtitle || '';
    $('#f-pray-ref').value = (c.pray && c.pray.ref) || '';
    $('#f-pray-text').value = (c.pray && c.pray.text) || '';
    $('#f-hymn-title').value = (c.hymn && c.hymn.title) || '';
    $('#f-hymn').value = (c.hymn && c.hymn.lyrics) || '';
    $('#f-message').value = c.message || '';
    $('#f-questions').value = c.questions || '';
  }

  const readForm = () => ({
    id: editing && editing.id,
    date: $('#f-date').value,
    title: $('#f-title').value.trim(),
    note: $('#f-note').value.trim(),
    bible: readSegs(),
    content: readContent(),
  });

  // ---------- 預覽 ----------
  function renderPreview() {
    const d = readForm();
    const item = { title: d.title, bible: d.bible, content: d.content, note: d.note };
    const c = d.content;
    $('#preview').innerHTML = `
      <div class="cur-head">
        <div class="cur-meta"><span class="cur-date">${d.date ? esc(fmtDate(d.date)) : ''}</span></div>
        ${c.series ? `<p class="cur-series">${esc(c.series)}</p>` : ''}
        <h1>${esc(d.title) || '<span class="muted">（標題）</span>'}</h1>
        ${c.subtitle ? `<p class="cur-sub">${esc(c.subtitle)}</p>` : ''}
        ${d.note ? `<p class="cur-note">${esc(d.note)}</p>` : ''}
      </div>
      <div class="tab-panel">${MSG.hasContent(item) || d.bible.length ? MSG.render(item)
        : '<p class="empty-note">在上面填寫內容，這裡會即時顯示。</p>'}</div>`;
  }

  // ---------- 草稿（只存新增中的內容，避免沒發布就關掉網頁） ----------
  let saveT = null;
  function changed() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      renderPreview();
      if (!editing && !filling) localStorage.setItem(DRAFT_KEY, JSON.stringify(readForm()));
    }, 300);
  }
  $('#item-form').addEventListener('input', changed);
  $('#draft-clear').addEventListener('click', () => {
    localStorage.removeItem(DRAFT_KEY);
    resetForm(false);
  });

  function defaultDate() {
    const latest = items[0];
    if (latest) {
      const d = parseDate(latest.meet_date);
      d.setDate(d.getDate() + 7);
      const next = ymd(d);
      if (next >= today()) return next;
    }
    return today();
  }

  function resetForm(useDraft) {
    filling = true;
    editing = null;
    $('#editor-title').textContent = '新增一週';
    $('#submit-btn').textContent = '發布';
    $('#cancel-edit').hidden = true;
    $('#segs').innerHTML = '';
    let draft = null;
    if (useDraft) { try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch { draft = null; } }
    if (draft) {
      $('#f-date').value = draft.date || defaultDate();
      $('#f-title').value = draft.title || '';
      $('#f-note').value = draft.note || '';
      (draft.bible || []).forEach(addSeg);
      fillContent(draft.content || {});
    } else {
      $('#f-date').value = defaultDate();
      $('#f-title').value = '';
      $('#f-note').value = '';
      guessNext().forEach(addSeg);
      const lastSeries = (items.find((x) => x.content && x.content.series) || {}).content;
      fillContent({ series: lastSeries ? lastSeries.series : '' });
    }
    $('#draft-note').hidden = !draft;
    updateSegHint();
    showError($('#form-error'), '');
    renderPreview();
    filling = false;
  }

  function startEdit(it) {
    filling = true;
    editing = it;
    $('#editor-title').textContent = `修改：${fmtDate(it.meet_date)}`;
    $('#submit-btn').textContent = '儲存修改';
    $('#cancel-edit').hidden = false;
    $('#draft-note').hidden = true;
    $('#f-date').value = it.meet_date;
    $('#f-title').value = it.title;
    $('#f-note').value = it.note || '';
    $('#segs').innerHTML = '';
    (it.bible || []).forEach(addSeg);
    fillContent(it.content || {});
    updateSegHint();
    showError($('#form-error'), '');
    renderPreview();
    filling = false;
    $('#editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('#cancel-edit').addEventListener('click', () => resetForm(true));

  $('#item-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    showError($('#form-error'), '');
    const data = readForm();
    if (!editing && !data.bible.length && !MSG.hasContent({ content: data.content })) {
      showError($('#form-error'), '請至少填寫讀經進度或信息內容');
      return;
    }
    busy = true;
    const btn = $('#submit-btn');
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '儲存中…';
    try {
      const wasEditing = !!editing;
      items = wasEditing ? await API.update(pass, data) : await API.add(pass, data);
      if (!wasEditing) localStorage.removeItem(DRAFT_KEY);
      toast(wasEditing ? '已儲存修改' : '已發布 ✓', 'ok');
      renderList();
      resetForm(false);
    } catch (err) {
      showError($('#form-error'), err.message);
      if (/密碼錯誤/.test(err.message)) setTimeout(() => location.reload(), 1500);
    } finally {
      busy = false;
      btn.disabled = false;
      if (btn.textContent.endsWith('…')) btn.textContent = label;
    }
  });

  // ---------- 列表 ----------
  function renderList() {
    $('#list-count').textContent = items.length ? `共 ${items.length} 週` : '';
    $('#admin-list').innerHTML = items.map((x) => {
      const bt = bibleText(x.bible);
      const hasMsg = MSG.hasContent(x);
      return `<li class="admin-item" data-id="${esc(x.id)}">
        <div class="ai-main">
          <div class="ai-date">${esc(fmtDate(x.meet_date))}</div>
          <div class="ai-title">${esc(x.title)}</div>
          <div class="ai-sub muted">
            ${bt ? `<span>📖 ${esc(bt)}</span>` : '<span>📖 未設定進度</span>'}
            ${hasMsg ? '<span>📝 已有信息內容</span>' : ''}
            ${x.file_path ? `<span>📄 ${esc(x.file_name || 'PDF')}${x.file_size ? '・' + fmtSize(x.file_size) : ''}</span>` : ''}
          </div>
        </div>
        <div class="ai-actions">
          <a class="btn ghost small" href="./#${encodeURIComponent(x.id)}" target="_blank" rel="noopener">查看</a>
          <button type="button" class="btn ghost small" data-act="edit">修改</button>
          <button type="button" class="btn danger small" data-act="del">刪除</button>
        </div>
      </li>`;
    }).join('') || '<li class="empty-note">還沒有發布任何信息</li>';
  }

  $('#admin-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const it = items.find((x) => x.id === btn.closest('.admin-item').dataset.id);
    if (!it) return;
    if (btn.dataset.act === 'edit') { startEdit(it); return; }
    if (!confirm(`確定要刪除「${fmtDate(it.meet_date)} ${it.title}」？\n無法復原。`)) return;
    btn.disabled = true;
    try {
      items = await API.remove(pass, it.id);
      if (editing && editing.id === it.id) resetForm(true);
      renderList();
      toast('已刪除');
    } catch (err) {
      btn.disabled = false;
      toast(err.message, 'error');
    }
  });

  CONTENT_FIELDS.forEach((id) => { if (!$('#' + id)) console.warn('missing field', id); });
  window.GM.demoBanner();
  if (pass) tryLogin(pass, true);
})();
