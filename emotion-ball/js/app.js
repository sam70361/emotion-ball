/* ============================================================
 * app.js —— 交互层(表情馆站点外壳,只依赖 EmotionBall SDK + EB_I18N)
 *
 * 职责:
 *   开屏 Hero(半遮罩线稿 bot + 进场甩彩带 + 视口停帧)
 *   双视图模式(陈列墙 / 画册长廊)与左右 / 键盘翻页
 *   分组 Tab、缩略图流、自动巡演、团队小球
 *   设置抽屉(形状 / 线稿 / 巡演 / AI 模拟 / 配置导入导出)
 *   中英双语、明暗主题、参数 localStorage 持久化
 * ============================================================ */
(function () {
  'use strict';

  var EB = window.EmotionBall;
  var I = window.EB_I18N;
  var $ = function (id) { return document.getElementById(id); };

  /* ---------------- 偏好读写 ---------------- */
  var PREF_KEY = 'eb.prefs';
  var prefs = { lang: 'zh', theme: 'dark', mode: 'wall', shape: 'blob', sketch: false, tourMs: 2500 };
  try {
    Object.assign(prefs, JSON.parse(localStorage.getItem(PREF_KEY) || '{}'));
  } catch (e) { /* 偏好损坏时用默认值 */ }
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
  var elTabs = $('tabs');
  var elThumbZone = $('thumbZone');
  var elThumbFlow = $('thumbFlow');
  var elToast = $('toast');
  var elDrawer = $('drawer');
  var elDrawerMask = $('drawerMask');
  var elTourToggle = $('tourToggle');
  var elTourInterval = $('tourInterval');
  var elSketchToggle = $('sketchToggle');
  var elShapeSelect = $('shapeSelect');
  var elAiInput = $('aiInput');
  var elLangToggle = $('langToggle');
  var elThemeToggle = $('themeToggle');

  /* ---------------- 站点状态 ---------------- */
  var currentTab = 'all';
  var selectedId = '02';
  var thumbs = [];            /* [{ id, def, engine, cell, nameSpan }] */
  var cellById = new Map();
  var babyBtns = [];          /* [{ btn, role, emotion }] */
  var main = null;
  var hero = null;
  var tipsTimer = 0;
  var toastTimer = 0;
  var lastErrorAt = -1;   /* 兜底告警时间戳:避免成功提示覆盖刚弹出的错误提示 */

  /* ---------------- 文案工具:按当前语言取表情 / 分组显示名 ---------------- */
  function dispName(def) {
    return I.lang === 'en' && def.en && def.en.name ? def.en.name : def.name;
  }
  function dispDesc(def) {
    return I.lang === 'en' && def.en && def.en.desc ? def.en.desc : (def.desc || '');
  }
  function groupName(g) {
    return I.lang === 'en' ? (g.en || g.name) : g.name;
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
  var gazeTargets = [];   /* [{ engine, el, rect, rectAt }] */
  function watchGaze(engine, el) {
    gazeTargets.push({ engine: engine, el: el, rect: null, rectAt: 0 });
  }
  function unwatchGaze(el) {
    gazeTargets = gazeTargets.filter(function (t) { return t.el !== el; });
  }
  /* 布局变化(视图切换 / 窗口缩放 / 主题字体)后强制重取矩形 */
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

  /* ---------------- 主小球(切换身体形状时重建实例) ---------------- */
  function createMain(shape) {
    var emotion = main ? main.emotionId : selectedId;
    if (main) {
      main.destroy();
      unwatchGaze(elStage);
    }
    main = EB.create(elStage, {
      emotion: emotion,
      shape: shape || 'blob',
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
    window.EB_MAIN = main;   /* 控制台调试句柄 */
  }

  /* ---------------- 元信息 + 页码 ---------------- */
  function currentDefs() {
    return EB.config.list(currentTab === 'all' ? null : currentTab);
  }
  function selectedIndex() {
    var defs = currentDefs();
    for (var i = 0; i < defs.length; i++) if (defs[i].id === selectedId) return i;
    return -1;
  }
  function updateMeta(def) {
    if (!def) def = EB.config.get(selectedId);
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

  /* 选中缩略图滚动居中(画册横向 / 陈列墙纵向),只滚内部容器不带动页面 */
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

  /* ---------------- 左右翻页(按当前 Tab 过滤列表循环) ---------------- */
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
      if (elDrawer.classList.contains('open')) closeDrawer();
      else closeStage();
    }
  });

  /* ---------------- 自定义下拉:原生 select 隐藏保留(值与 change 事件不变),
   * 浮层负责展示,保证下拉面板完全跟随主题 ---------------- */
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

    /* 按原生 option 重建浮层选项与触发器文案(语言切换 / 程序改值后调用) */
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
    /* 程序改值(初始化 / 导入配置)后同步触发器 */
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

  /* ---------------- 分组 Tab ---------------- */
  function tabList() {
    var groups = EB.config.groups().filter(function (g) {
      return EB.config.list(g.key).length > 0;
    });
    return [{ key: 'all', name: I.t('tabAll'), en: I.t('tabAll') }].concat(groups);
  }

  function buildTabs() {
    elTabs.innerHTML = '';
    tabList().forEach(function (g) {
      var count = g.key === 'all'
        ? EB.config.list().length
        : EB.config.list(g.key).length;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tab' + (g.key === currentTab ? ' active' : '');
      btn.dataset.key = g.key;
      btn.innerHTML = '<span>' + groupName(g) + '</span><span class="tab-count">' + count + '</span>';
      btn.addEventListener('click', function () {
        if (currentTab === g.key) return;
        currentTab = g.key;
        Array.prototype.forEach.call(elTabs.children, function (t) {
          t.classList.toggle('active', t.dataset.key === g.key);
        });
        buildThumbs();
        updateMeta();
        if (main.touring) restartTour();
      });
      elTabs.appendChild(btn);
    });
  }

  /* ---------------- 缩略图流(陈列墙网格 / 画册长廊共用一份实例) ---------------- */
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

      /* 缩略球:非激活(零帧成本),hover 时才注册进共享时钟播放动画 */
      var engine = EB.create(thumbEl, {
        emotion: def.id,
        autostart: false,
        label: dispName(def) + ' ' + I.t('thumbSuffix')
      });

      cell.addEventListener('mouseenter', function () {
        engine.setActive(true);
        engine.replay();
      });
      cell.addEventListener('mouseleave', function () {
        engine.setActive(false);
        engine.setEmotion(def.id, { auto: true });  /* 复位为静态基础姿态 */
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

  /* ---------------- 画册长廊:鼠标按住左右拖拽滚动 ----------------
   * 位移超过阈值才捕获指针进入拖拽,避免影响缩略图的正常点击 */
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

  /* ---------------- 语言 ---------------- */
  function applyI18n() {
    I.set(prefs.lang);
    document.documentElement.lang = prefs.lang === 'en' ? 'en' : 'zh-CN';
    document.title = I.t('docTitle');
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = I.t(nodes[i].getAttribute('data-i18n'));
    }
    elLangToggle.textContent = I.t('langBtn');
    $('settingsToggle').title = I.t('settingsBtn');
    $('drawerClose').setAttribute('aria-label', I.t('drawerClose'));
    $('navPrev').title = I.t('prevEmotion');
    $('navNext').title = I.t('nextEmotion');
    $('stageClose').title = I.t('stageClose');
    $('babyList').parentElement.setAttribute('aria-label', I.t('babiesLabel'));
    elThemeToggle.title = prefs.theme === 'dark' ? I.t('themeToLight') : I.t('themeToDark');
    buildTabs();
    relabelThumbs();
    updateMeta();
    babyBtns.forEach(function (b) {
      var def = EB.config.get(b.emotion);
      b.btn.title = b.role + ' · ' + (def ? dispName(def) : b.emotion) + '(' + I.t('babyClick') + ')';
    });
    refreshDD();   /* 下拉浮层文案跟随语言 */
  }
  elLangToggle.addEventListener('click', function () {
    prefs.lang = prefs.lang === 'zh' ? 'en' : 'zh';
    savePrefs();
    applyI18n();
    refreshGazeRects();
  });

  /* ---------------- 设置抽屉 ---------------- */
  function openDrawer() {
    elDrawer.classList.add('open');
    elDrawer.setAttribute('aria-hidden', 'false');
    elDrawerMask.hidden = false;
    requestAnimationFrame(function () { elDrawerMask.classList.add('show'); });
  }
  function closeDrawer() {
    closeAllDD();
    elDrawer.classList.remove('open');
    elDrawer.setAttribute('aria-hidden', 'true');
    elDrawerMask.classList.remove('show');
    setTimeout(function () { elDrawerMask.hidden = true; }, 300);
  }
  $('settingsToggle').addEventListener('click', openDrawer);
  $('drawerClose').addEventListener('click', closeDrawer);
  elDrawerMask.addEventListener('click', closeDrawer);

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

  /* ---------------- 线稿 / 形状 ---------------- */
  elSketchToggle.addEventListener('change', function () {
    prefs.sketch = elSketchToggle.checked;
    savePrefs();
    main.setStyle({ sketch: prefs.sketch ? 1 : 0 });
    toast(I.t(prefs.sketch ? 'toastSketchOn' : 'toastSketchOff'), prefs.sketch ? 'ok' : '');
  });

  elShapeSelect.addEventListener('change', function () {
    prefs.shape = elShapeSelect.value;
    savePrefs();
    if (main.touring) stopTourUI();
    createMain(prefs.shape);
    var key = { blob: 'shapeBlob', wedge: 'shapeWedge', gem: 'shapeGem' }[prefs.shape];
    toast(I.t('toastShape', { name: I.t(key || prefs.shape) }), 'ok');
  });

  /* ---------------- AI 对接模拟 ---------------- */
  function sendAI() {
    var raw = elAiInput.value.trim();
    if (!raw) return;
    if (main.touring) stopTourUI();
    var before = performance.now();
    var ok = main.handleAIMessage(raw);
    if (ok) openStage();
    if (ok && lastErrorAt < before) toast(I.t('toastAiSent') + ': ' + raw, 'ok');
  }
  $('aiSend').addEventListener('click', sendAI);
  elAiInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') sendAI();
  });
  $('aiSampleErr').addEventListener('click', function () {
    elAiInput.value = I.lang === 'en'
      ? '{"emotionId":"34","tips":"API call failed, check the network"}'
      : '{"emotionId":"34","tips":"调用接口失败,请检查网络"}';
    sendAI();
  });
  $('aiSampleBad').addEventListener('click', function () {
    elAiInput.value = I.lang === 'en'
      ? '{"emotionId":"99","tips":"an emotion id that does not exist"}'
      : '{"emotionId":"99","tips":"这是一个不存在的表情ID"}';
    sendAI();
  });

  /* ---------------- 配置导出 / 导入 ---------------- */
  $('btnExport').addEventListener('click', function () {
    var blob = new Blob([EB.config.exportConfig()], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'emotion-ball-config.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast(I.t('toastExported', { n: EB.config.list().length }), 'ok');
  });
  var elImportFile = $('importFile');
  $('btnImport').addEventListener('click', function () { elImportFile.click(); });
  elImportFile.addEventListener('change', function () {
    var file = elImportFile.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var res = EB.config.importConfig(String(reader.result));
      buildTabs();
      buildThumbs();
      updateMeta();
      if (res.ok) toast(I.t('toastImportOk', { n: res.added }), 'ok');
      else toast(I.t('toastImportFail', { n: res.added, err: res.errors.join('；') }), 'danger');
    };
    reader.readAsText(file);
    elImportFile.value = '';
  });

  /* ---------------- 团队小球 ---------------- */
  var BABIES = [
    { role: 'Chief',   color: '#54B9A6', emotion: '19' },
    { role: 'Sales',   color: '#F19D38', emotion: '32' },
    { role: 'Inbox',   color: '#6464EF', emotion: '31' },
    { role: 'Account', color: '#885CF5', emotion: '35' },
    { role: 'Scout',   color: '#3C82F6', emotion: '40' },
    { role: 'Expense', color: '#ED712E', emotion: '30' },
    { role: 'Ops',     color: '#4A9E8F', emotion: '16', shape: 'wedge' },
    { role: 'Lab',     color: '#C75C8A', emotion: '03', shape: 'gem' }
  ];
  function buildBabies() {
    var list = $('babyList');
    BABIES.forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'baby';
      list.appendChild(btn);
      var engine = EB.create(btn, {
        emotion: b.emotion,
        color: b.color,
        shape: b.shape || 'blob',
        lite: true,
        eyeScale: 1.7,
        label: b.role
      });
      watchGaze(engine, btn);
      btn.addEventListener('click', function () {
        if (main.touring) stopTourUI();
        engine.spin(1);
        main.setEmotion(b.emotion);
      });
      babyBtns.push({ btn: btn, role: b.role, emotion: b.emotion });
    });
  }

  /* ---------------- 品牌 LOGO 小球:顶栏迷你实例,注视鼠标,点击甩彩带 ---------------- */
  function buildBrand() {
    var elBrand = $('brandBall');
    var brand = EB.create(elBrand, {
      emotion: '02',
      lite: true,
      eyeScale: 1.7,
      label: 'Emotion Ball'
    });
    watchGaze(brand, elBrand);
    elBrand.addEventListener('click', function () { brand.spin(1); });
  }

  /* ---------------- 开屏 Hero:半遮罩线稿 bot ---------------- */
  function buildHero() {
    hero = EB.create($('heroBot'), {
      emotion: '02',
      shape: 'blob',
      label: 'Emotion Ball'
    });
    hero.setStyle({ sketch: 1 });
    watchGaze(hero, $('heroBot'));

    /* 进场甩一轮彩带;之后由 '02' 的待机 antics 周期性触发 */
    setTimeout(function () { hero.spin(2); }, 700);

    $('heroBot').addEventListener('click', function () { hero.spin(1); });

    /* 滚出视口自动停帧省资源,回到视口恢复 */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        hero.setActive(entries[0].isIntersecting);
      }, { threshold: 0.05 }).observe($('hero'));
    }

    $('heroCta').addEventListener('click', function () {
      $('gallery').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* ---------------- 舞台交互 ---------------- */
  elStage.addEventListener('click', function () { main.spin(1); });

  /* 任何用户交互都重置待机计时 */
  ['pointerdown', 'keydown'].forEach(function (evt) {
    document.addEventListener(evt, function () { main.resetIdle(); }, { passive: true });
  });

  /* ---------------- 初始化 ---------------- */
  I.set(prefs.lang);
  setTheme(prefs.theme, true);
  setMode(prefs.mode);
  elShapeSelect.value = prefs.shape;
  elSketchToggle.checked = !!prefs.sketch;
  elTourInterval.value = String(prefs.tourMs);
  if (!elTourInterval.value) { elTourInterval.value = '2500'; prefs.tourMs = 2500; }
  enhanceSelect(elShapeSelect);
  enhanceSelect(elTourInterval);

  createMain(prefs.shape);
  buildBabies();
  buildBrand();
  buildHero();
  applyI18n();   /* 内部完成 buildTabs + relabel;首帧前先建缩略图 */
  buildThumbs();
  updateMeta();
  highlightSelected();
})();
