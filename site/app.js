/* ============================================================
 * app.js —— 总馆交互层（同一外壳驱动两套引擎:MoodMates + EmotionBall）
 *
 * 职责:
 *   球球 / 云宝 / 亮亮 三角色同台切换(角色选段置于工具栏上方)
 *   开屏 Hero 与顶栏 LOGO 随当前角色同步
 *   双视图模式(陈列墙 / 画册);分组 / 身体轮廓 / 巡演间隔为下拉,
 *   线稿 / 巡演为开关,全部与模式切换同层(无设置抽屉)
 *   中英双语、明暗主题、参数 localStorage 持久化
 * ============================================================ */
(function () {
  'use strict';

  var MM = window.MoodMates;
  var EB = window.EmotionBall;
  var I = window.MM_I18N;
  var $ = function (id) { return document.getElementById(id); };

  /* ---------------- 双引擎适配 ----------------
   * 云宝 / 亮亮 → MoodMates 引擎;球球 → EmotionBall 引擎。
   * 两套 SDK 的实例方法与 config 接口对齐,外壳只经由下面几个
   * 适配函数访问引擎,其余逻辑对引擎来源无感知 */
  var BALL_CHAR = { id: 'ball', name: '球球', en: { name: 'Ball' }, industry: 'learn' };
  /* 球球默认排第一位 */
  function allChars() { return [BALL_CHAR].concat(MM.characters.list()); }
  function getChar(id) { return id === 'ball' ? BALL_CHAR : MM.characters.get(id); }
  function cfgOf(id) { return id === 'ball' ? EB.config : MM.config; }
  function cfg() { return cfgOf(prefs.character); }
  function rawDef(id) {
    var c = cfg();
    return c.getRaw ? c.getRaw(id) : c.get(id);
  }
  function createInst(el, opts) {
    var o = Object.assign({}, opts);
    if (o.character === 'ball') {
      delete o.character;
      /* 球球的「身体轮廓」映射到 EmotionBall 的 shape 选项 */
      if (o.variant) o.shape = o.variant;
      delete o.variant;
      return EB.create(el, o);
    }
    return MM.create(el, o);
  }

  /* 各角色可选身体形状:球球 = EB 三种形态;云宝/亮亮 = MM 变体注册表。
   * 首项(默认形状)按角色命名,直接代表形状本身 */
  var BASE_SHAPES = {
    ball: { name: '球形', en: { name: 'Round' } },
    nimbo: { name: '云朵', en: { name: 'Cloud' } },
    twinkle: { name: '星星', en: { name: 'Star' } }
  };
  var BALL_VARIANTS = [
    { id: 'wedge', name: '三角', en: { name: 'Wedge' } },
    { id: 'gem', name: '菱形', en: { name: 'Gem' } }
  ];
  function charVariants(id) {
    return id === 'ball' ? BALL_VARIANTS : MM.characters.variants(id);
  }

  /* ---------------- 偏好读写 ---------------- */
  var PREF_KEY = 'eg.prefs.v2';   /* v2:默认角色改为球球,旧偏好整体作废 */
  var prefs = { lang: 'zh', theme: 'dark', mode: 'wall', character: 'ball', sketch: false, tourMs: 2500, variants: {} };
  try {
    Object.assign(prefs, JSON.parse(localStorage.getItem(PREF_KEY) || '{}'));
  } catch (e) { /* 偏好损坏时用默认值 */ }
  if (!getChar(prefs.character)) prefs.character = 'ball';
  if (!prefs.variants || typeof prefs.variants !== 'object') prefs.variants = {};
  function savePrefs() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* 隐私模式忽略 */ }
  }

  /* ---------------- DOM 引用 ---------------- */
  var elStage = $('stage');
  var elTips = $('tips');
  var elEmoId = $('emoId');
  var elEmoName = $('emoName');
  var elEmoDesc = $('emoDesc');
  var elPager = $('pager');
  var elGroupSelect = $('groupSelect');
  var elThumbZone = $('thumbZone');
  var elThumbFlow = $('thumbFlow');
  var elCastRow = $('castRow');
  var elToast = $('toast');
  var elTourToggle = $('tourToggle');
  var elTourInterval = $('tourInterval');
  var elSketchToggle = $('sketchToggle');
  var elVariantSelect = $('variantSelect');
  var elLangToggle = $('langToggle');
  var elThemeToggle = $('themeToggle');

  /* ---------------- 站点状态 ---------------- */
  var currentTab = 'all';
  var selectedId = '02';
  var thumbs = [];            /* [{ id, def, engine, cell, nameSpan }] */
  var cellById = new Map();
  var castCards = [];         /* [{ id, btn, nameEl, indEl, ch }] */
  var main = null;
  var hero = null;
  var tipsTimer = 0;
  var toastTimer = 0;
  var lastErrorAt = -1;

  /* ---------------- 文案工具 ---------------- */
  function dispName(def) {
    return I.lang === 'en' && def.en && def.en.name ? def.en.name : def.name;
  }
  function dispDesc(def) {
    return I.lang === 'en' && def.en && def.en.desc ? def.en.desc : (def.desc || '');
  }
  function groupName(g) {
    return I.lang === 'en' ? (g.en || g.name) : g.name;
  }
  function charName(ch) {
    return I.lang === 'en' && ch.en && ch.en.name ? ch.en.name : ch.name;
  }

  /* ---------------- Toast ---------------- */
  function toast(text, kind) {
    clearTimeout(toastTimer);
    elToast.textContent = text;
    elToast.className = 'toast show' + (kind ? ' ' + kind : '');
    toastTimer = setTimeout(function () { elToast.className = 'toast'; }, 3600);
  }

  /* ---------------- tips 气泡 ---------------- */
  function showTips(text) {
    clearTimeout(tipsTimer);
    elTips.textContent = text;
    elTips.classList.add('show');
    tipsTimer = setTimeout(function () { elTips.classList.remove('show'); }, 3200);
  }

  /* ---------------- 鼠标注视:window 级 pointermove,矩形缓存 200ms ---------------- */
  var gazeTargets = [];
  function watchGaze(engine, el) {
    gazeTargets.push({ engine: engine, el: el, rect: null, rectAt: 0 });
  }
  function unwatchGaze(el) {
    gazeTargets = gazeTargets.filter(function (t) { return t.el !== el; });
  }
  function refreshGazeRects() {
    gazeTargets.forEach(function (t) { t.rect = null; });
  }
  function clamp06(v) { return v < -0.6 ? -0.6 : (v > 0.6 ? 0.6 : v); }
  window.addEventListener('pointermove', function (e) {
    var now = performance.now();
    for (var i = 0; i < gazeTargets.length; i++) {
      var t = gazeTargets[i];
      if (!t.rect || now - t.rectAt > 200) {
        t.rect = t.el.getBoundingClientRect();
        t.rectAt = now;
      }
      var r = t.rect;
      if (!r.width || !r.height) continue;
      t.engine.setGaze(
        clamp06((e.clientX - (r.left + r.width / 2)) / r.width) / 0.6,
        clamp06((e.clientY - (r.top + r.height / 2)) / r.height) / 0.6
      );
    }
  }, { passive: true });
  document.addEventListener('pointerleave', function () {
    gazeTargets.forEach(function (t) { t.engine.clearGaze(); });
  });
  window.addEventListener('resize', refreshGazeRects, { passive: true });
  window.addEventListener('scroll', refreshGazeRects, { passive: true });

  /* ---------------- 主角色(切换角色时重建实例) ---------------- */
  function createMain(charId) {
    var emotion = main ? main.emotionId : selectedId;
    if (main) {
      main.destroy();
      unwatchGaze(elStage);
    }
    main = createInst(elStage, {
      character: charId,
      variant: prefs.variants[charId] || '',
      emotion: emotion,
      idle: { standbyAfter: 60000, sleepAfter: 180000 },
      label: I.t('stageLabel')
    });
    main.setStyle({ sketch: elSketchToggle.checked ? 1 : 0 });
    main.on('change', function (e) {
      selectedId = e.id;
      updateMeta(e.def);
      highlightSelected();
      centerSelected();
    });
    main.on('tips', function (e) { showTips(e.text); });
    main.on('error', function (e) { lastErrorAt = performance.now(); toast(e.message, 'danger'); });
    watchGaze(main, elStage);
    window.EG_MAIN = main;   /* 控制台调试句柄 */
  }

  /* ---------------- 角色切换 ---------------- */
  function switchCharacter(charId, opts) {
    opts = opts || {};
    if (!getChar(charId)) return;
    prefs.character = charId;
    savePrefs();
    if (main && main.touring) stopTourUI();
    createMain(charId);
    fillGroupSelect();   /* 两套引擎各有独立表情注册中心,切角色时重建分组 */
    buildThumbs();
    updateMeta();
    fillVariantSelect();
    highlightCast();
    buildBrand();        /* 顶栏 LOGO 与开屏线稿随当前角色同步 */
    buildHero();
    if (!opts.silent) {
      toast(I.t('toastCharacter', { name: charName(getChar(charId)) }), 'ok');
    }
  }

  function highlightCast() {
    castCards.forEach(function (c) {
      c.btn.classList.toggle('selected', c.id === prefs.character);
    });
  }

  function buildCast() {
    elCastRow.innerHTML = '';
    castCards = [];
    allChars().forEach(function (ch) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cast';

      var avatar = document.createElement('div');
      avatar.className = 'cast-avatar';
      btn.appendChild(avatar);

      var nameEl = document.createElement('span');
      nameEl.className = 'cast-name';
      btn.appendChild(nameEl);

      var indEl = document.createElement('span');
      indEl.className = 'cast-industry';
      btn.appendChild(indEl);

      elCastRow.appendChild(btn);

      var engine = createInst(avatar, {
        character: ch.id,
        emotion: '02',
        lite: true,
        eyeScale: 1.35,
        label: ch.name
      });
      watchGaze(engine, avatar);

      btn.addEventListener('click', function () {
        if (!engine.signature || !engine.signature(0.7)) engine.spin(1);
        if (prefs.character !== ch.id) switchCharacter(ch.id);
      });

      castCards.push({ id: ch.id, btn: btn, nameEl: nameEl, indEl: indEl, ch: ch });
    });
    relabelCast();
    highlightCast();
  }

  function relabelCast() {
    castCards.forEach(function (c) {
      c.nameEl.textContent = charName(c.ch);
      c.indEl.textContent = I.t('industry_' + c.ch.industry);
      c.btn.title = charName(c.ch) + ' · ' + I.t('castClick');
    });
  }

  /* ---------------- 元信息 + 页码 ---------------- */
  function currentDefs() {
    return cfg().list(currentTab === 'all' ? null : currentTab);
  }
  function selectedIndex() {
    var defs = currentDefs();
    for (var i = 0; i < defs.length; i++) if (defs[i].id === selectedId) return i;
    return -1;
  }
  function updateMeta(def) {
    if (!def) def = rawDef(selectedId);
    if (!def) return;
    elEmoId.textContent = 'ID ' + def.id;
    elEmoName.textContent = dispName(def);
    elEmoDesc.textContent = dispDesc(def);
    var defs = currentDefs();
    var idx = selectedIndex();
    elPager.textContent = (idx >= 0 ? String(idx + 1).padStart(2, '0') : '--') +
      ' / ' + String(defs.length).padStart(2, '0');
  }

  function highlightSelected() {
    cellById.forEach(function (cell, id) {
      cell.classList.toggle('selected', id === selectedId);
    });
  }

  /* ---------------- 陈列墙大图弹窗 ---------------- */
  function stageOpen() { return document.body.classList.contains('stage-open'); }
  function openStage() {
    if (!document.body.classList.contains('mode-wall') || stageOpen()) return;
    document.body.classList.add('stage-open');
    refreshGazeRects();
  }
  function closeStage() {
    if (!stageOpen()) return;
    document.body.classList.remove('stage-open');
    refreshGazeRects();
  }
  $('stageClose').addEventListener('click', closeStage);
  document.querySelector('.stage-zone').addEventListener('click', function (e) {
    if (e.target === e.currentTarget) closeStage();
  });

  /* 选中缩略图滚动居中 */
  function centerSelected() {
    var cell = cellById.get(selectedId);
    if (!cell) return;
    if (document.body.classList.contains('mode-album')) {
      elThumbZone.scrollTo({
        left: cell.offsetLeft - (elThumbZone.clientWidth - cell.offsetWidth) / 2,
        behavior: 'smooth'
      });
    } else {
      var top = cell.offsetTop - elThumbZone.offsetTop;
      if (top < elThumbZone.scrollTop || top + cell.offsetHeight > elThumbZone.scrollTop + elThumbZone.clientHeight) {
        elThumbZone.scrollTo({
          top: top - (elThumbZone.clientHeight - cell.offsetHeight) / 2,
          behavior: 'smooth'
        });
      }
    }
  }

  /* ---------------- 左右翻页 ---------------- */
  function step(delta) {
    var defs = currentDefs();
    if (!defs.length) return;
    if (main.touring) stopTourUI();
    var idx = selectedIndex();
    var next = idx < 0
      ? (delta > 0 ? 0 : defs.length - 1)
      : (idx + delta + defs.length) % defs.length;
    main.setEmotion(defs[next].id);
    openStage();
  }
  $('navPrev').addEventListener('click', function () { step(-1); });
  $('navNext').addEventListener('click', function () { step(1); });

  document.addEventListener('keydown', function (e) {
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { step(1); e.preventDefault(); }
    else if (e.key === 'Escape') {
      if (closeAllDD()) return;
      closeStage();
    }
  });

  /* ---------------- 自定义下拉 ---------------- */
  var ddList = [];

  function enhanceSelect(sel) {
    var dd = document.createElement('div');
    dd.className = 'dd';
    sel.parentNode.insertBefore(dd, sel);
    dd.appendChild(sel);

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'dd-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    var pop = document.createElement('div');
    pop.className = 'dd-pop';
    pop.setAttribute('role', 'listbox');
    dd.appendChild(trigger);
    dd.appendChild(pop);

    function rebuild() {
      pop.innerHTML = '';
      Array.prototype.forEach.call(sel.options, function (opt) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dd-item' + (opt.value === sel.value ? ' selected' : '');
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-selected', opt.value === sel.value ? 'true' : 'false');
        var label = document.createElement('span');
        label.textContent = opt.textContent;
        btn.appendChild(label);
        var check = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        check.setAttribute('class', 'dd-check');
        check.setAttribute('viewBox', '0 0 24 24');
        check.setAttribute('width', '14');
        check.setAttribute('height', '14');
        check.innerHTML = '<path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';
        btn.appendChild(check);
        btn.addEventListener('click', function () {
          close();
          if (sel.value !== opt.value) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change'));
          }
          rebuild();
        });
        pop.appendChild(btn);
      });
      var cur = sel.options[sel.selectedIndex];
      trigger.textContent = cur ? cur.textContent : '';
    }

    function close() {
      dd.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    }
    function open() {
      closeAllDD();
      rebuild();
      dd.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
    }
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (dd.classList.contains('open')) close(); else open();
    });
    sel.addEventListener('change', rebuild);

    ddList.push({ dd: dd, rebuild: rebuild, close: close });
    rebuild();
  }

  function closeAllDD() {
    var any = false;
    ddList.forEach(function (i) {
      if (i.dd.classList.contains('open')) { any = true; i.close(); }
    });
    return any;
  }
  function refreshDD() {
    ddList.forEach(function (i) { i.rebuild(); });
  }
  document.addEventListener('click', function (e) {
    ddList.forEach(function (i) {
      if (!i.dd.contains(e.target)) i.close();
    });
  });

  /* ---------------- 表情分组(下拉) ---------------- */
  function tabList() {
    var groups = cfg().groups().filter(function (g) {
      return cfg().list(g.key).length > 0;
    });
    return [{ key: 'all', name: I.t('tabAll'), en: I.t('tabAll') }].concat(groups);
  }

  function fillGroupSelect() {
    var list = tabList();
    if (!list.some(function (g) { return g.key === currentTab; })) currentTab = 'all';
    elGroupSelect.innerHTML = '';
    list.forEach(function (g) {
      var count = g.key === 'all'
        ? cfg().list().length
        : cfg().list(g.key).length;
      var opt = document.createElement('option');
      opt.value = g.key;
      opt.textContent = groupName(g) + ' (' + count + ')';
      elGroupSelect.appendChild(opt);
    });
    elGroupSelect.value = currentTab;
    refreshDD();
  }

  elGroupSelect.addEventListener('change', function () {
    if (currentTab === elGroupSelect.value) return;
    currentTab = elGroupSelect.value;
    buildThumbs();
    updateMeta();
    if (main.touring) restartTour();
  });

  /* ---------------- 缩略图流(当前角色的表情墙) ---------------- */
  function buildThumbs() {
    thumbs.forEach(function (t) { t.engine.destroy(); });
    thumbs = [];
    cellById.clear();
    elThumbFlow.innerHTML = '';

    currentDefs().forEach(function (def) {
      var cell = document.createElement('div');
      cell.className = 'cell';
      cell.title = dispName(def) + ':' + dispDesc(def);

      var thumbEl = document.createElement('div');
      thumbEl.className = 'thumb';
      cell.appendChild(thumbEl);

      var label = document.createElement('div');
      label.className = 'cell-label';
      var cid = document.createElement('span');
      cid.className = 'cid';
      cid.textContent = def.id;
      var nameSpan = document.createElement('span');
      nameSpan.textContent = dispName(def);
      label.appendChild(cid);
      label.appendChild(nameSpan);
      cell.appendChild(label);

      /* 缩略角色:非激活(零帧成本),hover 时才注册进共享时钟播放动画 */
      var engine = createInst(thumbEl, {
        character: prefs.character,
        variant: prefs.variants[prefs.character] || '',
        emotion: def.id,
        autostart: false,
        label: dispName(def) + ' ' + I.t('thumbSuffix')
      });
      if (prefs.sketch) engine.setStyle({ sketch: 1 });

      cell.addEventListener('mouseenter', function () {
        engine.setActive(true);
        engine.replay();
      });
      cell.addEventListener('mouseleave', function () {
        engine.setActive(false);
        engine.setEmotion(def.id, { auto: true });
      });
      cell.addEventListener('click', function () {
        if (main.touring) stopTourUI();
        main.setEmotion(def.id);
        openStage();
      });

      elThumbFlow.appendChild(cell);
      thumbs.push({ id: def.id, def: def, engine: engine, cell: cell, nameSpan: nameSpan });
      cellById.set(def.id, cell);
    });

    highlightSelected();
    centerSelected();
  }

  /* ---------------- 画册长廊:鼠标按住左右拖拽滚动 ---------------- */
  (function () {
    var down = false, dragging = false, startX = 0, startLeft = 0, pid = 0;
    elThumbZone.addEventListener('pointerdown', function (e) {
      if (!document.body.classList.contains('mode-album')) return;
      down = true; dragging = false;
      startX = e.clientX;
      startLeft = elThumbZone.scrollLeft;
      pid = e.pointerId;
    });
    elThumbZone.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - startX;
      if (!dragging && Math.abs(dx) > 6) {
        dragging = true;
        elThumbZone.classList.add('dragging');
        try { elThumbZone.setPointerCapture(pid); } catch (err) { /* 指针已释放 */ }
      }
      if (dragging) elThumbZone.scrollLeft = startLeft - dx;
    });
    function endDrag() {
      down = false;
      if (dragging) {
        dragging = false;
        elThumbZone.classList.remove('dragging');
      }
    }
    elThumbZone.addEventListener('pointerup', endDrag);
    elThumbZone.addEventListener('pointercancel', endDrag);
  })();

  /* 语言切换时就地更新标签,不重建引擎实例 */
  function relabelThumbs() {
    thumbs.forEach(function (t) {
      t.nameSpan.textContent = dispName(t.def);
      t.cell.title = dispName(t.def) + ':' + dispDesc(t.def);
    });
  }

  /* ---------------- 视图模式 ---------------- */
  function setMode(mode) {
    prefs.mode = mode === 'album' ? 'album' : 'wall';
    savePrefs();
    document.body.classList.remove('stage-open');
    document.body.classList.toggle('mode-wall', prefs.mode === 'wall');
    document.body.classList.toggle('mode-album', prefs.mode === 'album');
    $('modeWall').classList.toggle('active', prefs.mode === 'wall');
    $('modeAlbum').classList.toggle('active', prefs.mode === 'album');
    refreshGazeRects();
    requestAnimationFrame(centerSelected);
  }
  $('modeWall').addEventListener('click', function () { setMode('wall'); });
  $('modeAlbum').addEventListener('click', function () { setMode('album'); });

  /* ---------------- 主题 ---------------- */
  function setTheme(theme, silent) {
    prefs.theme = theme === 'light' ? 'light' : 'dark';
    savePrefs();
    document.documentElement.setAttribute('data-theme', prefs.theme);
    elThemeToggle.title = prefs.theme === 'dark' ? I.t('themeToLight') : I.t('themeToDark');
    if (!silent) toast(I.t(prefs.theme === 'dark' ? 'toastThemeDark' : 'toastThemeLight'));
  }
  elThemeToggle.addEventListener('click', function () {
    setTheme(prefs.theme === 'dark' ? 'light' : 'dark');
  });

  /* ---- 身体形状下拉：常显;首项为角色默认形状名(球形 / 云朵 / 星星) ---- */
  function variantName(v) {
    return I.lang === 'en' && v.en && v.en.name ? v.en.name : v.name;
  }
  function fillVariantSelect() {
    elVariantSelect.innerHTML = '';
    var base = BASE_SHAPES[prefs.character] || { name: charName(getChar(prefs.character)) };
    var opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = variantName(base);
    elVariantSelect.appendChild(opt0);
    var vars = charVariants(prefs.character);
    vars.forEach(function (v) {
      var opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = variantName(v);
      elVariantSelect.appendChild(opt);
    });
    /* 本地存储可能残留已下线的变体 id:赋给 select 匹配不到任何 option
     * 会显示空白,校验后回落到默认形状 */
    var stored = prefs.variants[prefs.character] || '';
    if (stored && !vars.some(function (v) { return v.id === stored; })) {
      prefs.variants[prefs.character] = '';
      stored = '';
      savePrefs();
    }
    elVariantSelect.value = stored;
    refreshDD();
  }

  function applyI18n() {
    I.set(prefs.lang);
    document.documentElement.lang = prefs.lang === 'en' ? 'en' : 'zh-CN';
    document.title = I.t('docTitle');
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = I.t(nodes[i].getAttribute('data-i18n'));
    }
    elLangToggle.textContent = I.t('langBtn');
    $('navPrev').title = I.t('prevEmotion');
    $('navNext').title = I.t('nextEmotion');
    $('stageClose').title = I.t('stageClose');
    elThemeToggle.title = prefs.theme === 'dark' ? I.t('themeToLight') : I.t('themeToDark');
    fillGroupSelect();
    relabelThumbs();
    relabelCast();
    updateMeta();
    fillVariantSelect();
    refreshDD();
  }
  elLangToggle.addEventListener('click', function () {
    prefs.lang = prefs.lang === 'zh' ? 'en' : 'zh';
    savePrefs();
    applyI18n();
    refreshGazeRects();
  });

  /* ---------------- 自动巡演 ---------------- */
  function restartTour() {
    var ids = currentDefs().map(function (d) { return d.id; });
    main.startTour(ids, prefs.tourMs);
  }
  function stopTourUI() {
    main.stopTour();
    elTourToggle.checked = false;
  }
  function tabName(key) {
    var t = tabList().find(function (g) { return g.key === key; });
    return t ? groupName(t) : key;
  }
  elTourToggle.addEventListener('change', function () {
    if (elTourToggle.checked) {
      restartTour();
      openStage();
      toast(I.t('toastTourOn', { name: tabName(currentTab), n: currentDefs().length }), 'ok');
    } else {
      main.stopTour();
      toast(I.t('toastTourOff'));
    }
  });
  elTourInterval.addEventListener('change', function () {
    prefs.tourMs = parseInt(elTourInterval.value, 10) || 2500;
    savePrefs();
    if (main.touring) restartTour();
  });

  /* ---------------- 线稿 / 身体形状 ---------------- */
  /* 线稿同时作用于主舞台与全部预览缩略图 */
  function applySketch() {
    var v = prefs.sketch ? 1 : 0;
    main.setStyle({ sketch: v });
    thumbs.forEach(function (t) { t.engine.setStyle({ sketch: v }); });
  }
  elSketchToggle.addEventListener('change', function () {
    prefs.sketch = elSketchToggle.checked;
    savePrefs();
    applySketch();
    toast(I.t(prefs.sketch ? 'toastSketchOn' : 'toastSketchOff'), prefs.sketch ? 'ok' : '');
  });

  elVariantSelect.addEventListener('change', function () {
    prefs.variants[prefs.character] = elVariantSelect.value;
    savePrefs();
    if (main.touring) stopTourUI();
    createMain(prefs.character);
    buildThumbs();
    buildBrand();
    buildHero();
    var cur = elVariantSelect.options[elVariantSelect.selectedIndex];
    toast(I.t('toastVariant', { name: cur ? cur.textContent : '' }), 'ok');
  });

  /* ---------------- 品牌 LOGO 角色:顶栏迷你实例(随当前角色) ---------------- */
  var brand = null;
  function buildBrand() {
    var elBrand = $('brandBall');
    if (brand) {
      brand.destroy();
      unwatchGaze(elBrand);
    }
    brand = createInst(elBrand, {
      character: prefs.character,
      variant: prefs.variants[prefs.character] || '',
      emotion: '02',
      lite: true,
      eyeScale: 1.7,
      label: 'Emotion Gallery'
    });
    watchGaze(brand, elBrand);
  }
  $('brandBall').addEventListener('click', function () {
    if (!brand) return;
    if (!brand.signature || !brand.signature(0.6)) brand.spin(1);
  });

  /* ---------------- 开屏 Hero:半遮罩线稿角色(随当前角色) ---------------- */
  function buildHero() {
    var elHeroBot = $('heroBot');
    if (hero) {
      hero.destroy();
      unwatchGaze(elHeroBot);
    }
    hero = createInst(elHeroBot, {
      character: prefs.character,
      variant: prefs.variants[prefs.character] || '',
      emotion: '02',
      label: 'Emotion Gallery'
    });
    hero.setStyle({ sketch: 1 });
    watchGaze(hero, elHeroBot);
  }

  /* Hero 的一次性布线:入场动作 / 点击 / 可见性 / CTA */
  setTimeout(function () {
    if (hero && (!hero.signature || !hero.signature(1))) hero.spin(2);
  }, 700);
  $('heroBot').addEventListener('click', function () {
    if (!hero) return;
    if (!hero.signature || !hero.signature(0.8)) hero.spin(1);
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      if (hero) hero.setActive(entries[0].isIntersecting);
    }, { threshold: 0.05 }).observe($('hero'));
  }
  $('heroCta').addEventListener('click', function () {
    $('gallery').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ---------------- 舞台交互 ---------------- */
  elStage.addEventListener('click', function () {
    /* MoodMates 角色走庆祝组合（签名 + 肢体 + 撒花）；球球保持签名/自旋 */
    if (main.celebrate) main.celebrate(1);
    else if (!main.signature || !main.signature(1)) main.spin(1);
  });

  /* 任何用户交互都重置待机计时 */
  ['pointerdown', 'keydown'].forEach(function (evt) {
    document.addEventListener(evt, function () { main.resetIdle(); }, { passive: true });
  });

  /* ---------------- 初始化 ---------------- */
  I.set(prefs.lang);
  setTheme(prefs.theme, true);
  setMode(prefs.mode);
  elSketchToggle.checked = !!prefs.sketch;
  elTourInterval.value = String(prefs.tourMs);
  if (!elTourInterval.value) { elTourInterval.value = '2500'; prefs.tourMs = 2500; }
  enhanceSelect(elGroupSelect);
  enhanceSelect(elVariantSelect);
  enhanceSelect(elTourInterval);

  createMain(prefs.character);
  buildCast();
  buildBrand();
  buildHero();
  applyI18n();
  buildThumbs();
  updateMeta();
  highlightSelected();
})();
