// 首頁的動態：開場載入、穿過玻璃卡進到內容、內容浮現、導覽列換色、游標
// 需要 GSAP + ScrollTrigger；載不到時整頁改成靜態顯示（html.no-fx）。
(() => {
  'use strict';
  const { $, $$ } = window.GM;
  const gsap = window.gsap;
  const ST = window.ScrollTrigger;
  const hasFx = !!(gsap && ST);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;

  // ---- 動態參數 ----
  const PIN_SCREENS_DESKTOP = 1.5; // 穿過卡片要捲幾個螢幕高
  const PIN_SCREENS_MOBILE = 1;
  const DOLLY = 0.18;              // 鏡頭往前推的比例
  const TILT_Y = -24;              // 卡片一開始側轉的角度
  const TILT_X = 4;
  const COVER = 1.2;               // 卡片放大到蓋過螢幕後再多出的比例
  const NAV_DARK_AT = 0.76;
  const READY_IN = [0.79, 0.81];   // 內容淡入的區間
  const READY_PLAY = 0.8;
  const READY_REVERSE = 0.74;
  const COPY_RISE = 120;           // 標題往上移的距離（設計單位）

  const seg = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
  const inOut = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);

  const el = {
    nav: $('#nav'), hero: $('#hero'), media: $('#media'), over: $('#over'), scene: $('#scene'),
    glass: $('#card-glass'), light: $('#card-light'), portal: $('#card-portal'),
    rim: $('#portal-rim'), fill: $('#portal-fill'), copy: $('#hero-copy'),
    pre: $('#preloader'), preNum: $('#pre-num'), preCounter: $('#pre-counter'),
    content: $('#content'), msg: $('#hero-msg'),
    col: $('.hero-col'),
  };

  // scale：夜景從中央長出來；face：卡片上的光；flash：卡緣閃一下；p：捲動進度
  const state = { scale: 0, face: 0, flash: 0, p: 0 };
  let box = null; // 版面量測（沒有 transform 時的位置）
  let st = null;
  let readyTl = null;
  let revealed = false;
  let started = false;

  function measure() {
    box = {
      W: el.media.offsetWidth, H: el.media.offsetHeight,
      x: el.glass.offsetLeft, y: el.glass.offsetTop, w: el.glass.offsetWidth, h: el.glass.offsetHeight,
    };
  }

  // 依 state 擺好夜景與卡片
  function render() {
    if (!box) measure();
    const { W, H, x, y, w, h } = box;
    const p = reduce ? 0 : state.p;
    el.media.style.transform = el.over.style.transform = state.scale === 1 ? 'none' : `scale(${state.scale})`;
    const cx = x + w / 2, cy = y + h / 2;
    const d = 1 + DOLLY * inOut(seg(p, 0, 0.7));
    const turn = inOut(seg(p, 0, 0.45));
    const grow = seg(p, 0.5, 0.82) ** 3;
    el.scene.style.transformOrigin = `${cx}px ${cy}px`;
    el.scene.style.transform = `scale(${d})`;
    const s0 = d * (1 + 0.06 * turn);
    const cover = Math.max(H / h, W / w) * COVER;
    const s = s0 + (cover - s0) * grow;
    const tx = (W / 2 - cx) * grow, ty = (H / 2 - cy) * grow;
    const t = `translate(${tx.toFixed(2)}px,${ty.toFixed(2)}px) scale(${s.toFixed(4)}) perspective(1400px) `
      + `rotateY(${(TILT_Y * (1 - turn)).toFixed(3)}deg) rotateX(${(TILT_X * (1 - turn)).toFixed(3)}deg)`;
    el.glass.style.transform = el.light.style.transform = el.portal.style.transform = t;
    el.light.style.opacity = state.face * (1 - seg(p, 0.15, 0.4));
    el.rim.style.opacity = Math.max(state.flash, seg(p, 0.1, 0.4));
    el.fill.style.opacity = seg(p, 0.35, 0.62);
  }

  // ---- 把一行字拆成一個個 span（中文一字一個、英文一詞一個） ----
  function splitWords(node, text) {
    node.textContent = '';
    node.setAttribute('aria-label', text);
    const tokens = String(text).match(/[A-Za-z0-9][A-Za-z0-9'’.:~\-]*|\s+|[\s\S]/g) || [];
    tokens.forEach((tk) => {
      if (/^\s+$/.test(tk)) { node.appendChild(document.createTextNode(tk)); return; }
      const sp = document.createElement('span');
      sp.className = 'w';
      sp.setAttribute('aria-hidden', 'true');
      sp.dataset.word = '';
      sp.textContent = tk;
      node.appendChild(sp);
    });
    return $$('[data-word]', node);
  }
  const stagger = (n) => Math.min(0.09, 1.1 / Math.max(1, n));

  // ---- 導覽列 ----
  function setTheme(dark) {
    const v = dark ? 'dark' : 'light';
    if (el.nav.dataset.theme !== v) el.nav.dataset.theme = v;
  }
  function updateActive() {
    let key = '';
    if (el.nav.dataset.theme === 'dark') {
      const arch = $('#archive');
      const inArchive = arch && !arch.hidden && arch.getBoundingClientRect().top < innerHeight * 0.45;
      key = inArchive ? 'archive' : (window.GM_APP ? window.GM_APP.tab() : 'pdf');
    }
    $$('[data-nav]', el.nav).forEach((a) => a.classList.toggle('active', a.dataset.nav === key));
  }

  // ---- 內容浮現（標題一字一字、其他淡入） ----
  function buildReady() {
    if (!hasFx) return;
    if (readyTl) readyTl.kill();
    const words = $$('#cur-title [data-word]');
    const items = $$('[data-ready="item"]').filter((n) => !n.hidden);
    const bodies = $$('[data-ready="body"]').filter((n) => !n.hidden);
    const wordmark = $('[data-ready="wordmark"]');
    const tl = gsap.timeline({ paused: true });
    if (reduce) {
      tl.fromTo([wordmark, ...words, ...items, ...bodies], { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power1.out' }, 0);
    } else {
      tl.fromTo(words, { opacity: 0, filter: 'blur(12px)', yPercent: 25 },
        { opacity: 1, filter: 'blur(0px)', yPercent: 0, duration: 0.7, ease: 'power2.out', stagger: stagger(words.length), clearProps: 'filter,transform' }, 0.15);
      tl.fromTo(wordmark, { opacity: 0 }, { opacity: 1, duration: 1, ease: 'power1.out' }, 0.4);
      items.forEach((n, i) => tl.fromTo(n, { opacity: 0, filter: 'blur(10px)' },
        { opacity: 1, filter: 'blur(0px)', duration: 0.6, ease: 'power2.out', clearProps: 'filter' }, 0.1 + i * 0.1));
      tl.fromTo(bodies, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out', clearProps: 'transform' }, 0.55);
    }
    readyTl = tl;
    tl.progress(1).progress(revealed ? 1 : 0);
  }

  function setRevealed(on) {
    if (on === revealed) return;
    revealed = on;
    if (!readyTl) return;
    if (on) readyTl.timeScale(1).play();
    else readyTl.timeScale(2).reverse();
  }

  // ---- 捲動：把進度套到畫面上 ----
  function applyScroll() {
    const p = state.p;
    if (reduce) {
      const o = seg(p, 0.75, 0.95);
      el.content.style.opacity = o;
      el.content.style.visibility = o === 0 ? 'hidden' : 'visible';
      setTheme(o === 1);
      setRevealed(o === 1 ? true : p < 0.75 ? false : revealed);
    } else {
      render();
      el.copy.style.transform = `translateY(calc(${(-COPY_RISE * seg(p, 0.2, 0.8)).toFixed(2)} * var(--u)))`;
      // 手機的標題在上方，往上移會撞到導覽列，所以邊移邊淡出
      el.col.style.opacity = innerWidth < 1024 ? 1 - seg(p, 0.22, 0.5) : '';
      const o = seg(p, READY_IN[0], READY_IN[1]);
      el.content.style.opacity = o;
      el.content.style.visibility = o === 0 ? 'hidden' : 'visible';
      setTheme(p >= NAV_DARK_AT);
      if (p >= READY_PLAY) setRevealed(true);
      else if (p < READY_REVERSE) setRevealed(false);
    }
    updateActive();
  }

  function createScroll() {
    ST.config({ ignoreMobileResize: true });
    const proxy = { p: 0 };
    const tween = gsap.to(proxy, {
      p: 1, ease: 'none',
      onUpdate: () => { state.p = proxy.p; applyScroll(); },
    });
    st = ST.create({
      trigger: el.hero,
      start: 'top top',
      end: () => '+=' + Math.round(innerHeight * (innerWidth < 1024 ? PIN_SCREENS_MOBILE : PIN_SCREENS_DESKTOP)),
      pin: true,
      scrub: reduce ? true : 0.6,
      invalidateOnRefresh: true,
      animation: tween,
      onRefresh: () => { measure(); applyScroll(); },
    });
    window.addEventListener('scroll', updateActive, { passive: true });
  }

  const unlock = () => { root.removeAttribute('data-locked'); if (st) ST.refresh(); };

  // ---- 載入進度 ----
  let numTo = null;
  const num = { v: 0 };
  let shown = 0;
  const showNum = () => { el.preNum.textContent = String(Math.round(num.v)).padStart(2, '0'); };
  function progress(frac) {
    if (!hasFx || reduce) return;
    if (!numTo) numTo = gsap.quickTo(num, 'v', { duration: 0.4, ease: 'power1.out', onUpdate: showNum });
    shown = Math.max(shown, frac * 90);
    numTo(shown);
  }

  // ---- 開場 ----
  function start(ok) {
    if (started) return;
    started = true;
    if (!ok) { // 載入失敗或沒有資料：直接顯示說明
      root.classList.add('no-hero');
      root.removeAttribute('data-locked');
      el.nav.style.opacity = 1;
      setTheme(true);
      return;
    }
    if (!hasFx) { root.removeAttribute('data-locked'); setTheme(false); return; }

    const words = $$('#hero-title [data-word]');
    const blurIn = (sel, from) => [sel, { opacity: 0, filter: `blur(${from}px)` },
      { opacity: 1, filter: 'blur(0px)', duration: 0.6, ease: 'power2.out', clearProps: 'filter' }];
    measure();
    createScroll();
    buildReady();

    if (reduce) {
      state.scale = 1; state.face = 1;
      render();
      el.pre.style.display = 'none';
      gsap.set('#hero-title', { opacity: 1 });
      gsap.fromTo([el.media, el.over, el.nav, '[data-intro="badge"]', ...words, '[data-intro="buttons"]', '[data-intro="lead"]'],
        { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power1.out', onComplete: unlock });
      return;
    }

    if (numTo) numTo.tween.kill();
    const tl = gsap.timeline({ onUpdate: render });
    tl.to(num, { v: 100, duration: 0.5, ease: 'power1.out', onUpdate: showNum }, 0)
      .to(el.preCounter, { opacity: 0, duration: 0.15, ease: 'power1.in' }, 0.5)
      .to(state, { scale: 1, duration: 0.85, ease: 'power2.out' }, 0.6)
      .to('.pre-wordmark', { opacity: 0, duration: 0.4, ease: 'power1.out' }, 0.7)
      .to(state, { keyframes: { face: [0, 0.8, 0.15, 1, 0.55, 1] }, duration: 0.45, ease: 'none' }, 1.05)
      .to(state, { keyframes: { flash: [0, 1, 0] }, duration: 0.7, ease: 'power1.out' }, 1.05)
      .fromTo(...blurIn('[data-intro="badge"]', 10), 1.1)
      .fromTo(...blurIn(el.nav, 8), 1.15)
      .set('#hero-title', { opacity: 1 }, 1.25)
      .fromTo(words, { opacity: 0, filter: 'blur(12px)', yPercent: 25 },
        { opacity: 1, filter: 'blur(0px)', yPercent: 0, duration: 0.7, ease: 'power2.out', stagger: stagger(words.length), clearProps: 'filter,transform' }, 1.25)
      .fromTo(...blurIn('[data-intro="buttons"]', 10), 1.55)
      .fromTo(...blurIn('[data-intro="lead"]', 10), 1.85)
      .call(() => { el.pre.style.display = 'none'; unlock(); }, null, 2.3);
  }

  // ---- 捲到內容／往期 ----
  const behavior = () => (reduce ? 'auto' : 'smooth');
  function toContent() {
    const top = st ? st.end + 1 : el.content.getBoundingClientRect().top + scrollY;
    window.scrollTo({ top, behavior: behavior() });
  }
  function toArchive() {
    const arch = $('#archive');
    if (!arch || arch.hidden) { toContent(); return; }
    const navH = el.nav.offsetHeight;
    const top = arch.getBoundingClientRect().top + scrollY - navH - 12;
    window.scrollTo({ top: Math.max(top, st ? st.end + 1 : 0), behavior: behavior() });
  }
  $('#nav-logo').addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: behavior() });
  });

  // ---- 游標（只在有滑鼠的裝置） ----
  function initCursor() {
    const disc = $('#cursor');
    if (!disc || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    root.classList.add('has-cursor');
    let tx = 0, ty = 0, x = 0, y = 0, last = 0, raf = 0, placed = false;
    const tick = (now) => {
      const k = 1 - 0.7 ** ((now - last) / 16.67);
      last = now;
      x += (tx - x) * k; y += (ty - y) * k;
      disc.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%)`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.1 ? requestAnimationFrame(tick) : 0;
    };
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      tx = e.clientX; ty = e.clientY;
      if (!placed) { placed = true; x = tx; y = ty; }
      disc.classList.add('on');
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
    }, { passive: true });
    document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) disc.classList.remove('on'); });
  }

  // ---- 啟動 ----
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  if (!hasFx) root.classList.add('no-fx');
  if (reduce) root.classList.add('reduce');
  initCursor();
  if (hasFx) {
    let rT = 0;
    window.addEventListener('resize', () => {
      clearTimeout(rT);
      rT = setTimeout(() => { measure(); if (started) applyScroll(); }, 120);
    });
  }

  window.GM_FX = {
    progress, start, splitWords, buildReady, toContent, toArchive, updateActive,
    get revealed() { return revealed; },
  };
})();
