/* ============================================================
 * engine.js —— 驱动层（依赖 geometry / render / features / fx；消费 emotions.js 纯数据）
 *
 * 职责：
 *   1. 角色注册中心 MoodMates.characters：角色数据包 → 解析出几何 / 眼环族 / 嘴形族
 *   2. 表情注册中心 MoodMates.config：校验 / 语义槽位 / 导入导出（全角色共享基座）
 *   3. EmotionEngine：rAF 状态机 + 动画原语 + 弹簧插值 + 兜底 + 待机策略
 *   4. 对外 SDK：MoodMates.create(el, opts) → engine 实例
 *
 * 对外 API（宿主只依赖这一层）：
 *   const mate = MoodMates.create(el, { character:'nimbo', emotion:'02', idle:true });
 *   mate.setEmotion('30');
 *   mate.handleAIMessage({ emotionId:'30', tips:'正在思考' });   // 或 JSON 字符串
 *   mate.on('change'|'tips'|'error', cb);
 *   mate.startTour(ids, interval) / mate.stopTour();
 *   mate.registerEmotion(config); mate.destroy();
 *   MoodMates.characters.register(def) / list();
 *   MoodMates.config.exportConfig() / importConfig(json);
 *
 * 表情配置中的语义化设计（与具体角色解耦）：
 *   pool  用眼形槽位名（'calm'/'happy'/…），每个角色用自己的眼环族实现
 *   mouth 用嘴形槽位名（'smile'/'o'/…），随表情切换弹性形变
 *   颜色  用 '@token'（'@base'/'@blush'/'@angry'/…）查角色色板 states 表
 * ============================================================ */
(function () {
  'use strict';

  var MM = (window.MoodMates = window.MoodMates || {});
  var GEO = MM.geo;
  var TAU = Math.PI * 2;
  var FALLBACK_ID = '02';

  /* ---------------- 基础工具 ---------------- */

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /* 临界阻尼弹簧步进，子步 1/120 保证数值稳定 */
  function spring(v0) { return { x: v0, v: 0, t: v0 }; }
  function springStep(s, w, z, dt) {
    s.v += (-2 * z * w * s.v - w * w * (s.x - s.t)) * dt;
    s.x += s.v * dt;
    if (!isFinite(s.x) || !isFinite(s.v)) { s.x = s.t; s.v = 0; }
  }

  /* 两组轮廓环逐点插值 */
  function lerpRing(a, b, t) {
    var out = new Array(a.length);
    for (var i = 0; i < a.length; i++) {
      out[i] = [a[i][0] + (b[i][0] - a[i][0]) * t, a[i][1] + (b[i][1] - a[i][1]) * t];
    }
    return out;
  }

  /* 弹跳：4 段递减抛物线 */
  var BOUNCE_SEGS = [{ h: 48, d: 0.5 }, { h: 28, d: 0.382 }, { h: 14, d: 0.27 }, { h: 6, d: 0.177 }];
  var BOUNCE_TOTAL = BOUNCE_SEGS.reduce(function (s, q) { return s + q.d; }, 0);

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function (v) {
      return clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
    }).join('');
  }
  function lerpColor(a, b, t) {
    if (a === b) return b;
    var A = hexToRgb(a), B = hexToRgb(b);
    return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
  }

  /* ---------------- 角色注册中心 ---------------- */

  var characters = new Map();
  var charOrder = [];

  /** 角色色板 states 缺省表：未提供的语义色一律回退主体色 */
  var STATE_KEYS = ['base', 'dim', 'soft', 'blush', 'angry', 'alert', 'off'];

  function resolveCharacter(raw) {
    if (raw._resolved) return raw._resolved;
    var eyeStyle = Object.assign(
      { dx: 30, cy: 96, w: 26, h: 34, taper: 0.5, tilt: 0, bend: 0, highlight: null, pupil: null },
      raw.eyeStyle || {}
    );
    var family = GEO.buildEyeFamily(eyeStyle);
    /* 角色自定义眼形轮廓（每表情专属轮廓组）：raw.eyeShapes = { 名字: lens 参数 } */
    if (raw.eyeShapes) {
      for (var esk in raw.eyeShapes) {
        family[esk] = GEO.buildCustomEyePair(raw.eyeShapes[esk], eyeStyle);
      }
    }
    var mouthBase = { w: (raw.features && raw.features.mouth && raw.features.mouth.w) || 26 };
    var mouthShapes = {};
    GEO.mouthSlots.forEach(function (slot) {
      mouthShapes[slot] = GEO.buildMouth(slot, mouthBase);
    });
    /* 角色自定义嘴形轮廓：raw.mouthShapes = { 名字: mouthLens 参数 } */
    if (raw.mouthShapes) {
      for (var msk in raw.mouthShapes) {
        mouthShapes[msk] = GEO.buildCustomMouth(Object.assign({ w: mouthBase.w }, raw.mouthShapes[msk]));
      }
    }
    var palette = Object.assign({ eye: '#233038', eyeHighlight: '#FFFFFF' }, raw.palette || {});
    palette.states = Object.assign({}, raw.palette && raw.palette.states);
    STATE_KEYS.forEach(function (k) {
      if (!palette.states[k]) palette.states[k] = palette.body;
    });

    var resolved = {
      id: raw.id,
      name: raw.name,
      en: raw.en || null,
      industry: raw.industry || 'general',
      desc: raw.desc || '',
      bodyRing: GEO.buildBody(raw.body),
      face: Object.assign({ x: 0, y: 0, sx: 1, sy: 1, eye: 1 }, raw.face || {}),
      palette: palette,
      eyeStyle: eyeStyle,
      eyeFamily: family,
      mouthShapes: mouthShapes,
      defaultEyeRing: family.calm,
      features: raw.features || {},
      fxSkin: raw.fxSkin || 'cloudpuff',
      emotions: raw.emotions || null,
      raw: raw
    };
    raw._resolved = resolved;
    return resolved;
  }

  /* 身体轮廓变体：raw.variants = { 变体id: { name, en, body } }。
   * 变体只替换 bodyRing（剪影），眼形 / 色板 / 表情编排全部共享 */
  function resolveVariant(raw, vid) {
    var base = resolveCharacter(raw);
    if (!vid || !raw.variants || !raw.variants[vid]) return base;
    raw._variantCache = raw._variantCache || {};
    if (!raw._variantCache[vid]) {
      var v = raw.variants[vid];
      raw._variantCache[vid] = Object.assign({}, base, {
        variant: vid,
        bodyRing: v.body ? GEO.buildBody(v.body) : base.bodyRing
      });
    }
    return raw._variantCache[vid];
  }

  MM.characters = {
    register: function (raw) {
      if (!raw || typeof raw.id !== 'string' || !raw.id.trim()) {
        return { ok: false, errors: ['角色缺少合法 id'] };
      }
      if (!raw.body || !raw.body.type) {
        return { ok: false, id: raw.id, errors: ['角色缺少 body.type（身体生成器）'] };
      }
      try {
        resolveCharacter(raw);
        if (raw.variants) {
          for (var vk in raw.variants) resolveVariant(raw, vk);
        }
      } catch (e) {
        return { ok: false, id: raw.id, errors: [e.message] };
      }
      if (!characters.has(raw.id)) charOrder.push(raw.id);
      characters.set(raw.id, raw);
      return { ok: true, id: raw.id };
    },
    get: function (id, variant) {
      var raw = characters.get(id);
      return raw ? resolveVariant(raw, variant) : null;
    },
    /** 列出角色的身体轮廓变体（不含默认轮廓） */
    variants: function (id) {
      var raw = characters.get(id);
      if (!raw || !raw.variants) return [];
      return Object.keys(raw.variants).map(function (k) {
        var v = raw.variants[k];
        return { id: k, name: v.name || k, en: v.en || null };
      });
    },
    list: function () {
      return charOrder.map(function (id) { return resolveCharacter(characters.get(id)); });
    },
    defaultId: function () { return charOrder[0] || null; }
  };

  /* ---------------- Pose：默认值 / 合并 / 插值 ---------------- */

  var DEFAULT_BODY = {
    x: 0, y: 0, scale: 1, rotate: 0, color: '@base', breathe: 0.01,
    spinFx: 0, confetti: 0, sketch: 0,
    zzz: 0,      /* 睡眠字母粒子（0~1） */
    orbit: 0     /* 常驻环绕粒子（0~1） */
  };
  var DEFAULT_EYE = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0, open: 1, color: '@eye', lookX: 0, lookY: 0 };
  var DEFAULT_FACE = {
    blush: 0, browVis: 0, browTilt: 0, browRaise: 0,
    mouthX: 0, mouthY: 0, mouthSX: 1, mouthSY: 1
  };

  function defaultPose() {
    return {
      body: Object.assign({}, DEFAULT_BODY),
      left: Object.assign({}, DEFAULT_EYE),
      right: Object.assign({}, DEFAULT_EYE),
      face: Object.assign({}, DEFAULT_FACE)
    };
  }
  function clonePose(p) {
    return {
      body: Object.assign({}, p.body),
      left: Object.assign({}, p.left),
      right: Object.assign({}, p.right),
      face: Object.assign({}, p.face)
    };
  }

  /** 把配置片段（body / eyes.both|left|right / face）合并到 pose 上（原地修改） */
  function applySpec(pose, spec) {
    if (!spec) return pose;
    if (spec.body) Object.assign(pose.body, spec.body);
    if (spec.face) Object.assign(pose.face, spec.face);
    var e = spec.eyes;
    if (e) {
      if (e.both) { Object.assign(pose.left, e.both); Object.assign(pose.right, e.both); }
      if (e.left) Object.assign(pose.left, e.left);
      if (e.right) Object.assign(pose.right, e.right);
    }
    return pose;
  }

  var POSE_PARTS = ['body', 'left', 'right', 'face'];

  function lerpPose(a, b, t) {
    var out = defaultPose();
    POSE_PARTS.forEach(function (part) {
      var pa = a[part], pb = b[part], po = out[part];
      for (var k in pb) {
        var vb = pb[k];
        if (typeof vb === 'number') po[k] = lerp(pa[k] != null ? pa[k] : vb, vb, t);
        else if (k === 'color') po[k] = lerpColor(pa[k] || vb, vb, t);
        else po[k] = vb;
      }
    });
    return out;
  }

  /* ---------------- 动画原语 ---------------- */

  var ANIM_TYPES = {
    /** 正弦漂移 / 呼吸 / 扫视 */
    sine: function (a, t) {
      return a.amp * Math.sin(TAU * t / (a.period || 2000) + (a.phase || 0));
    },
    /** 节奏缩放：0 → amp 平滑往复 */
    pulse: function (a, t) {
      return a.amp * 0.5 * (1 - Math.cos(TAU * t / (a.period || 1000) + (a.phase || 0)));
    },
    /** 随机小抖动（多正弦伪噪声），decay 毫秒内衰减到 0 */
    jitter: function (a, t, eng) {
      var s = t / 1000 * (a.speed || 8);
      var v = (Math.sin(s * 3.1 + eng._seed) +
               Math.sin(s * 5.7 + eng._seed * 2.3) +
               Math.sin(s * 9.3 + eng._seed * 4.1)) / 3 * a.amp;
      if (a.decay) v *= clamp(1 - t / a.decay, 0, 1);
      return v;
    },
    /** 三角波快速来回扫动 */
    scan: function (a, t) {
      var per = a.period || 800;
      var p = ((t + (a.phaseMs || 0)) % per) / per;
      var tri = p < 0.5 ? p * 4 - 1 : 3 - p * 4;
      return a.amp * tri;
    },
    /** 张望：平滑方波，两端各停留片刻再换边 */
    glance: function (a, t) {
      var per = a.period || 3600;
      var ph = TAU * (((t + (a.phaseMs || 0)) % per) / per) + (a.phase || 0);
      return a.amp * Math.tanh(2.8 * Math.sin(ph));
    },
    /** 周期眨眼；相位叠加实例随机种子，多实例不同步 */
    blink: function (a, t, eng) {
      var interval = a.interval || 3800, dur = a.dur || 200;
      var p = (t + (a.phaseMs || 0) + (eng ? eng._seed * 97 : 0)) % interval;
      if (p >= dur) return 0;
      return -(a.depth == null ? 1 : a.depth) * Math.sin(Math.PI * (p / dur));
    }
  };

  function applyAnim(pose, a, t, eng) {
    var fn = ANIM_TYPES[a.type];
    if (!fn) return;
    var v = fn(a, t, eng);
    var targets =
      a.target === 'eyes' ? [pose.left, pose.right] :
      a.target === 'body' ? [pose.body] :
      a.target === 'face' ? [pose.face] :
      a.target === 'left' ? [pose.left] :
      a.target === 'right' ? [pose.right] : [];
    for (var i = 0; i < targets.length; i++) {
      var tg = targets[i];
      if (a.prop === 'scale') {
        if (tg === pose.body) tg.scale += v;
        else { tg.scaleX += v; tg.scaleY += v; }
      } else if (a.prop in tg) {
        tg[a.prop] += v;
      }
    }
  }

  /* ---------------- 表情注册中心（全角色共享的原始配置） ---------------- */

  var GROUPS = (window.EMOTION_GROUPS || [
    { key: 'life', name: '生命周期' },
    { key: 'emotion', name: '情绪反应' },
    { key: 'agent', name: '代理工作状态' },
    { key: 'custom', name: '自定义' }
  ]).slice();

  var registry = new Map();   /* id → raw */
  var order = [];
  var configVersion = 0;

  function knownGroup(g) {
    return GROUPS.some(function (x) { return x.key === g; });
  }

  function validate(raw) {
    var errs = [];
    if (!raw || typeof raw !== 'object') { errs.push('配置必须是对象'); return errs; }
    if (typeof raw.id !== 'string' || !raw.id.trim()) errs.push('缺少合法的字符串 id');
    if (typeof raw.name !== 'string' || !raw.name.trim()) errs.push('缺少 name');
    if (!knownGroup(raw.group)) errs.push('group 不合法：' + raw.group);
    if (raw.pool != null) {
      /* 槽位名允许角色自定义轮廓（eyeShapes），此处只做类型校验，
       * 未知名字在 normalizeFor 按角色眼环族过滤兜底 */
      if (!Array.isArray(raw.pool)) errs.push('pool 必须是眼形槽位名数组');
      else raw.pool.forEach(function (s, i) {
        if (typeof s !== 'string') errs.push('pool[' + i + '] 必须是眼形槽位名字符串');
      });
    }
    if (raw.mouth != null && typeof raw.mouth !== 'string') {
      errs.push('mouth 必须是嘴形槽位名字符串');
    }
    if (raw.anims != null) {
      if (!Array.isArray(raw.anims)) errs.push('anims 必须是数组');
      else raw.anims.forEach(function (a, i) {
        if (!a || !ANIM_TYPES[a.type]) errs.push('anims[' + i + '] 未知动画类型：' + (a && a.type));
      });
    }
    if (raw.sequence != null && !Array.isArray(raw.sequence.frames)) {
      errs.push('sequence.frames 必须是数组');
    }
    return errs;
  }

  function register(raw) {
    var errs = validate(raw);
    if (errs.length) return { ok: false, id: raw && raw.id, errors: errs };
    if (!registry.has(raw.id)) order.push(raw.id);
    registry.set(raw.id, raw);
    configVersion++;
    return { ok: true, id: raw.id };
  }

  /* ---- 角色覆盖合并：角色数据里的 emotions[id] 片段浅合并进原始配置 ---- */
  function mergeRaw(base, over) {
    if (!over) return base;
    var out = Object.assign({}, base, over);
    if (base.body || over.body) out.body = Object.assign({}, base.body, over.body);
    if (base.face || over.face) out.face = Object.assign({}, base.face, over.face);
    if (base.eyes || over.eyes) {
      out.eyes = {};
      ['both', 'left', 'right'].forEach(function (k) {
        if ((base.eyes && base.eyes[k]) || (over.eyes && over.eyes[k])) {
          out.eyes[k] = Object.assign({}, base.eyes && base.eyes[k], over.eyes && over.eyes[k]);
        }
      });
    }
    return out;
  }

  /* ---- 语义色解析：'@token' → 角色色板 states / 特殊键 ---- */
  function resolveColor(v, ch) {
    if (typeof v !== 'string' || v.charAt(0) !== '@') return v;
    var key = v.slice(1);
    if (key === 'eye') return ch.palette.eye;
    return ch.palette.states[key] || ch.palette.body;
  }
  function resolvePoseColors(pose, ch) {
    pose.body.color = resolveColor(pose.body.color, ch);
    pose.left.color = resolveColor(pose.left.color, ch);
    pose.right.color = resolveColor(pose.right.color, ch);
    return pose;
  }

  /** 按角色归一化一条表情配置：深合并默认姿态，预生成 sequence 每帧完整 pose */
  function normalizeFor(raw, ch) {
    raw = mergeRaw(raw, ch.emotions && ch.emotions[raw.id]);
    var base = resolvePoseColors(applySpec(defaultPose(), raw), ch);
    var pool = (raw.pool || ['calm', 'calm2']).filter(function (s) { return ch.eyeFamily[s]; });
    if (!pool.length) pool = ['calm'];
    var def = {
      id: raw.id, name: raw.name, group: raw.group,
      desc: raw.desc || '',
      en: raw.en || null,
      gaze: raw.gaze !== false,
      transition: raw.transition != null ? raw.transition : 500,
      pool: pool,
      poolMs: raw.poolMs || [9000, 16000],
      poolSpeed: raw.poolSpeed || 6,
      blinkMs: raw.blinkMs !== undefined ? raw.blinkMs : [6000, 14000],
      openness: raw.openness != null ? raw.openness : 1,
      antics: !!raw.antics,
      mouth: raw.mouth && ch.mouthShapes[raw.mouth] ? raw.mouth : 'flat',
      base: base,
      anims: (raw.anims || []).map(function (a) { return Object.assign({}, a); }),
      sequence: null,
      raw: raw
    };
    if (raw.sequence) {
      var frames = raw.sequence.frames.map(function (f) {
        return { at: f.at || 0, pose: resolvePoseColors(applySpec(clonePose(base), f), ch) };
      }).sort(function (x, y) { return x.at - y.at; });
      def.sequence = { frames: frames, settle: raw.sequence.settle || 'base' };
    }
    return def;
  }

  MM.config = {
    register: register,
    getRaw: function (id) { return registry.get(id) || null; },
    list: function (group) {
      return order.map(function (id) { return registry.get(id); })
        .filter(function (d) { return !group || d.group === group; });
    },
    groups: function () {
      return GROUPS.map(function (g) { return { key: g.key, name: g.name, en: g.en || g.name }; });
    },
    version: function () { return configVersion; },
    exportConfig: function () {
      return JSON.stringify(order.map(function (id) { return registry.get(id); }), null, 2);
    },
    importConfig: function (json) {
      var data;
      try {
        data = typeof json === 'string' ? JSON.parse(json) : json;
      } catch (e) {
        return { ok: false, added: 0, errors: ['JSON 解析失败：' + e.message] };
      }
      var arr = Array.isArray(data) ? data : [data];
      var added = 0, errors = [];
      arr.forEach(function (raw) {
        var r = register(raw);
        if (r.ok) added++;
        else errors.push('[' + ((raw && raw.id) || '?') + '] ' + r.errors.join('；'));
      });
      return { ok: errors.length === 0, added: added, errors: errors };
    }
  };

  /* ---------------- 全局共享 rAF 时钟（多实例单循环） ---------------- */

  var ticker = {
    set: new Set(),
    raf: 0,
    add: function (e) {
      this.set.add(e);
      if (!this.raf) this.raf = requestAnimationFrame(ticker.loop);
    },
    remove: function (e) { this.set.delete(e); },
    loop: function (now) {
      ticker.raf = 0;
      ticker.set.forEach(function (e) { e._tick(now); });
      if (ticker.set.size) ticker.raf = requestAnimationFrame(ticker.loop);
    }
  };

  /* ---------------- EmotionEngine ---------------- */

  function Engine(target, opts) {
    opts = opts || {};
    var el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) throw new Error('MoodMates.create：找不到容器元素');

    var chId = opts.character || MM.characters.defaultId();
    var ch = MM.characters.get(chId, opts.variant);
    if (!ch) throw new Error('MoodMates.create：未注册任何角色（先加载 src/characters/*.js）');
    this.character = ch;

    this.ball = MM.createBall(el, Object.assign({}, opts, {
      character: ch,
      lite: opts.lite != null ? opts.lite : opts.autostart === false
    }));
    this._seed = Math.random() * 100;
    this._events = {};
    this._gaze = { x: 0, y: 0, tx: 0, ty: 0 };
    this._style = { sketch: 0 };
    this._theme = opts.color
      ? { body: opts.color, eyes: opts.eyeColor || '#FFFFFF' }
      : null;
    this._eyeScale = opts.eyeScale || 1;
    this._lastTick = 0;
    this._spin = null;

    /* ---- 按角色归一化的表情缓存 ---- */
    this._defs = new Map();
    this._defsVersion = -1;

    /* ---- 眼环形变系统（槽位驱动） ---- */
    var calm = ch.eyeFamily.calm;
    this._ringSrc = [calm[0], calm[1]];
    this._ringDst = [calm[0], calm[1]];
    this._ringCur = this._ringDst;
    this._ringSpring = spring(1);
    this._ringSpeed = 7;
    this._exprSlot = 'calm';
    this._poolPos = 0;
    this._poolNext = 0;

    /* ---- 嘴形形变系统 ---- */
    var flat = ch.mouthShapes.flat;
    this._mouthSrc = flat;
    this._mouthDst = flat;
    this._mouthCur = flat;
    this._mouthSpring = spring(1);
    this._mouthSlot = 'flat';
    this._mouthHoldUntil = 0;

    /* ---- 眨眼系统 ---- */
    this._open = spring(1);
    this._blinkQ = [];
    this._blinkNext = Infinity;
    /* ---- 待机小动作 ---- */
    this._anticNext = 0;
    this._bounceAt = -1;

    this._def = null;
    this._lastPose = null;
    this._prevPose = null;
    this._transStart = 0;
    this._transDur = 0;
    this._emoStart = 0;
    this._seq = null;
    this._active = false;
    this._touring = false;
    this._tourTimer = 0;
    this._fallbackId = opts.fallbackId || FALLBACK_ID;
    this._lastActivity = performance.now();

    if (opts.idle) {
      this._idle = Object.assign(
        { standbyAfter: 60000, sleepAfter: 180000, standbyId: '02', sleepId: '00' },
        opts.idle === true ? {} : opts.idle
      );
    } else {
      this._idle = null;
    }

    this.setEmotion(opts.emotion || this._fallbackId, { auto: true });
    if (opts.autostart !== false) this.setActive(true);
    else this.renderStatic();
  }

  Engine.prototype = {

    /* ---------- 事件 ---------- */
    on: function (evt, cb) {
      (this._events[evt] = this._events[evt] || []).push(cb);
      return this;
    },
    off: function (evt, cb) {
      var list = this._events[evt];
      if (list) {
        var i = list.indexOf(cb);
        if (i >= 0) list.splice(i, 1);
      }
      return this;
    },
    _emit: function (evt, payload) {
      (this._events[evt] || []).slice().forEach(function (cb) {
        try { cb(payload); } catch (e) { console.error(e); }
      });
    },

    get emotionId() { return this._def ? this._def.id : null; },
    get touring() { return this._touring; },

    /** 取按本角色归一化的表情定义（带版本失效缓存） */
    _getDef: function (id) {
      if (this._defsVersion !== MM.config.version()) {
        this._defs.clear();
        this._defsVersion = MM.config.version();
      }
      if (this._defs.has(id)) return this._defs.get(id);
      var raw = MM.config.getRaw(id);
      if (!raw) return null;
      var def = normalizeFor(raw, this.character);
      this._defs.set(id, def);
      return def;
    },

    /* ---------- 核心：切换表情（含兜底） ---------- */
    setEmotion: function (id, o) {
      o = o || {};
      var def = this._getDef(id);
      if (!def) {
        console.warn('[MoodMates] 未知表情 ID "' + id + '"，回退到待机 (' + this._fallbackId + ')');
        this._emit('error', { message: '未知表情 ID "' + id + '"，已回退待机', id: id });
        def = this._getDef(this._fallbackId);
        if (!def) return false;
      }
      var now = performance.now();
      var prevId = this._def ? this._def.id : null;
      this._prevPose = this._lastPose ? clonePose(this._lastPose) : null;
      this._def = def;
      this._emoStart = now;
      this._transStart = now;
      this._transDur = this._prevPose ? def.transition : 0;
      this._seq = def.sequence
        ? { frames: def.sequence.frames, settle: def.sequence.settle, done: false }
        : null;
      if (!o.auto) this._lastActivity = now;

      this._poolPos = 0;
      this._mouthHoldUntil = 0;
      this._setExpr(def.pool[0], def.poolSpeed >= 10 ? 10 : 8);
      this._setMouth(def.mouth, 8);
      this._poolNext = now + rand(def.poolMs[0], def.poolMs[1]);
      if (prevId !== null && prevId !== def.id && def.blinkMs) this._blinkNow(now);
      this._blinkNext = def.blinkMs ? now + rand(def.blinkMs[0], def.blinkMs[1]) : Infinity;
      this._anticNext = now + rand(2500, 5000);

      this._emit('change', { id: def.id, def: def, auto: !!o.auto });
      /* spinFx / confetti 是进入表情时的一次性事件；
       * 有签名动作的角色用自己的风格庆祝（云絮绽放 / 星星爆闪），
       * 没有签名动作的皮肤才回退到通用自旋 */
      if (this._active) {
        var fx = def.base.body;
        if (fx.spinFx > 0 && !this.signature(fx.spinFx >= 1 ? 1 : 0.7)) {
          this.spin(fx.spinFx >= 1 ? 2 : 1);
        }
        if (fx.confetti > 0) this.burst(20);
      }
      if (!this._active) this.renderStatic();
      return true;
    },

    /** AI 对接入口：接受对象或 JSON 字符串 { emotionId, tips } */
    handleAIMessage: function (msg) {
      var obj = msg;
      if (typeof msg === 'string') {
        try { obj = JSON.parse(msg); }
        catch (e) {
          this._emit('error', { message: 'AI 消息 JSON 解析失败，已回退待机', raw: msg });
          this.setEmotion(this._fallbackId);
          return false;
        }
      }
      if (!obj || typeof obj !== 'object' || typeof obj.emotionId !== 'string') {
        this._emit('error', { message: 'AI 消息缺少 emotionId 字段，已回退待机', raw: msg });
        this.setEmotion(this._fallbackId);
        return false;
      }
      var ok = this.setEmotion(obj.emotionId);
      if (obj.tips) this._emit('tips', { text: String(obj.tips) });
      return ok;
    },

    /* ---------- 自动巡演 ---------- */
    startTour: function (ids, interval) {
      this.stopTour();
      if (!ids || !ids.length) return;
      interval = interval || 2500;
      this._touring = true;
      var self = this, i = 0;
      this.setEmotion(ids[0], { auto: true });
      this._tourTimer = setInterval(function () {
        i = (i + 1) % ids.length;
        self.setEmotion(ids[i], { auto: true });
      }, interval);
    },
    stopTour: function () {
      if (this._tourTimer) { clearInterval(this._tourTimer); this._tourTimer = 0; }
      this._touring = false;
      this._lastActivity = performance.now();
    },

    resetIdle: function () { this._lastActivity = performance.now(); },

    /* 注视目标：横向 ±24、纵向 ±15（viewBox 坐标） */
    setGaze: function (nx, ny) {
      this._gaze.tx = clamp(nx, -1, 1) * 24;
      this._gaze.ty = clamp(ny, -1, 1) * 15;
      return this;
    },
    clearGaze: function () {
      this._gaze.tx = 0;
      this._gaze.ty = 0;
      return this;
    },
    setStyle: function (style) {
      Object.assign(this._style, style || {});
      if (!this._active) this.renderStatic();
      return this;
    },

    /* 自旋（点击交互）：弹簧追整数圈，达速后由特效层甩出粒子 */
    spin: function (turns, dir) {
      if (this._spin) return this;
      var d = dir || (Math.random() < 0.5 ? -1 : 1);
      this._spin = { x: 0, v: 0, t: Math.max(1, Math.round(turns || 1)) * TAU * d };
      return this;
    },
    /* 撒花：一次性物理粒子爆发 */
    burst: function (count) {
      if (this.ball.burst) this.ball.burst(count);
      return this;
    },
    /* 签名动作：角色专属交互（云絮绽放 / 星星爆闪）
     * 返回 false 表示该角色皮肤没有签名动作 */
    signature: function (strength) {
      var ok = this.ball.signature ? !!this.ball.signature(strength) : false;
      /* 皮肤可声明 signatureMouth：触发签名时嘴形临时覆盖，到期弹回当前表情嘴形 */
      if (ok && this.ball.signatureMouth) {
        this._mouthHoldUntil = performance.now() + (this.ball.signatureMouthMs || 1400);
        this._setMouth(this.ball.signatureMouth, 10);
      }
      return ok;
    },
    /* 庆祝组合（舞台点击交互）：签名动作 + 随机肢体动作 + 撒花，
     * 让点击反馈与球球的"甩带 + 烟花"同量级，而非只有单一签名动作 */
    celebrate: function (strength) {
      var s = strength == null ? 1 : strength;
      this.signature(s);
      var r = Math.random();
      if (r < 0.5) this.spin(1);
      else if (r < 0.85) this.bounce();
      this.burst(Math.round(10 + 8 * s));
      return this;
    },
    /* 弹跳（4 段递减抛物线） */
    bounce: function () {
      if (this._bounceAt < 0) this._bounceAt = performance.now();
      return this;
    },

    /* 切换眼环槽位：把当前插值冻结为新起点，弹簧从 0 重新弹向 1 */
    _setExpr: function (slot, speed) {
      if (slot === this._exprSlot && this._ringSpring.x >= 0.999) return;
      var pair = this.character.eyeFamily[slot];
      if (!pair) return;
      var s = clamp(this._ringSpring.x, 0, 1);
      this._ringSrc = [
        lerpRing(this._ringSrc[0], this._ringDst[0], s),
        lerpRing(this._ringSrc[1], this._ringDst[1], s)
      ];
      this._ringDst = [pair[0], pair[1]];
      this._ringSpring.x = 0;
      this._ringSpring.v = 0;
      this._ringSpring.t = 1;
      this._ringSpeed = speed || 7;
      this._exprSlot = slot;
    },

    /* 切换嘴形槽位（同眼环逻辑） */
    _setMouth: function (slot, speed) {
      if (slot === this._mouthSlot && this._mouthSpring.x >= 0.999) return;
      var ring = this.character.mouthShapes[slot];
      if (!ring) return;
      var s = clamp(this._mouthSpring.x, 0, 1);
      this._mouthSrc = lerpRing(this._mouthSrc, this._mouthDst, s);
      this._mouthDst = ring;
      this._mouthSpring.x = 0;
      this._mouthSpring.v = 0;
      this._mouthSpring.t = 1;
      this._mouthSlot = slot;
    },

    /* 眨眼关键帧：合上 → 停 70ms → 睁到 1.08 过冲 → 300ms 落回 1 */
    _blinkNow: function (t) {
      this._blinkQ.push(
        { at: t, v: 0.05 }, { at: t + 70, v: 0.05 },
        { at: t + 150, v: 1.08 }, { at: t + 300, v: 1 }
      );
      if (Math.random() < 0.14) {
        this._blinkQ.push({ at: t + 370, v: 0.05 }, { at: t + 480, v: 1 });
      }
    },

    registerEmotion: function (raw) { return MM.config.register(raw); },

    /* ---------- 生命周期 ---------- */
    setActive: function (on) {
      if (on === this._active) return;
      this._active = on;
      if (on) ticker.add(this);
      else ticker.remove(this);
    },
    replay: function () {
      if (this._def) this.setEmotion(this._def.id, { auto: true });
    },
    /** 静态渲染一帧 */
    renderStatic: function () {
      this._transDur = 0;
      this._ringSpring.x = 1;
      this._ringSpring.v = 0;
      this._mouthSpring.x = 1;
      this._mouthSpring.v = 0;
      this._open.x = this._def ? this._def.openness : 1;
      this._open.v = 0;
      var seq = this._seq;
      this._seq = null;
      this._tick(performance.now());
      this._seq = seq;
    },
    destroy: function () {
      this.stopTour();
      this.setActive(false);
      this._events = {};
      this.ball.destroy();
    },

    /* ---------- 每帧 ---------- */
    _tick: function (now) {
      this._dt = this._lastTick ? clamp((now - this._lastTick) / 1000, 0.001, 0.05) : 1 / 60;
      this._lastTick = now;
      if (this._idle && !this._touring) this._checkIdle(now);
      var pose = this._compose(now, 0);
      this.ball.applyPose(pose);
      this._lastPose = pose;
    },

    _checkIdle: function (now) {
      var idle = this._idle;
      var elapsed = now - this._lastActivity;
      var cur = this.emotionId;
      if (elapsed >= idle.sleepAfter) {
        if (cur !== idle.sleepId) this.setEmotion(idle.sleepId, { auto: true });
      } else if (elapsed >= idle.standbyAfter) {
        if (cur !== idle.standbyId && cur !== idle.sleepId) {
          this.setEmotion(idle.standbyId, { auto: true });
        }
      }
    },

    /** 合成当前帧姿态：base → sequence → animators → 过渡插值 */
    _compose: function (now, depth) {
      var def = this._def;
      var t = now - this._emoStart;
      var pose;

      if (this._seq) {
        var res = this._seqPose(t, now);
        if (res === 'switch') {
          return depth < 4 ? this._compose(now, depth + 1) : clonePose(this._def.base);
        }
        pose = res || clonePose(def.base);
      } else {
        pose = clonePose(def.base);
      }

      /* 内置呼吸（相位用绝对时间，切换表情不跳变） */
      var br = pose.body.breathe || 0;
      if (br) {
        var ph = TAU * now / 3600;
        pose.body.scale += br * Math.sin(ph);
        pose.body.y += br * 55 * Math.sin(ph + 0.6);
      }

      for (var i = 0; i < def.anims.length; i++) applyAnim(pose, def.anims[i], t, this);

      pose.body.sketch = Math.max(pose.body.sketch || 0, this._style.sketch || 0);

      var dt = this._dt || 1 / 60;

      /* ---- 表情池轮换 ---- */
      if (this._active && now >= this._poolNext) {
        if (def.pool.length > 1) {
          this._poolPos = (this._poolPos + 1 + Math.floor(rand(0, def.pool.length - 1))) % def.pool.length;
          this._setExpr(def.pool[this._poolPos], def.poolSpeed);
        }
        this._poolNext = now + rand(def.poolMs[0], def.poolMs[1]);
      }

      /* ---- 眨眼调度 ---- */
      if (this._active && def.blinkMs && now >= this._blinkNext) {
        this._blinkNow(now);
        this._blinkNext = now + rand(def.blinkMs[0], def.blinkMs[1]);
      }
      var openKey = null;
      while (this._blinkQ.length && now >= this._blinkQ[0].at) {
        openKey = this._blinkQ[0].v;
        this._blinkQ.shift();
      }
      this._open.t = openKey != null ? openKey : (this._blinkQ.length ? this._open.t : def.openness);

      /* ---- 待机小动作：优先角色签名动作（轻量版），无签名才通用自旋 ---- */
      if (this._active && def.antics && now >= this._anticNext) {
        if (!this._spin && this._bounceAt < 0) {
          var pick = Math.random();
          if (pick < 0.45) {
            if (!this.signature(0.55)) this.spin(1);
          }
          else if (pick < 0.8) this.bounce();
          else this._blinkNow(now);
        }
        this._anticNext = now + rand(9000, 18000);
      }

      /* 签名嘴形覆盖到期：弹回当前表情槽位（表情切换已清 hold，不会串嘴） */
      if (this._mouthHoldUntil && now >= this._mouthHoldUntil) {
        this._mouthHoldUntil = 0;
        this._setMouth(def.mouth, 8);
      }

      /* ---- 弹簧整步（子步 1/120）：眼形变 / 嘴形变 / 开合 / 自旋 ---- */
      var steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      var j = dt / steps;
      for (var si = 0; si < steps; si++) {
        springStep(this._ringSpring, this._ringSpeed, 1, j);
        springStep(this._mouthSpring, 9, 1, j);
        springStep(this._open, 26, 1, j);
        if (this._spin) {
          springStep(this._spin, 6.2, 1, j);
          if (Math.abs(this._spin.t - this._spin.x) < 0.01 && Math.abs(this._spin.v) < 0.05) {
            this._spin = null;
          }
        }
      }
      pose.body.yaw = this._spin ? this._spin.x : 0;

      /* ---- 弹跳位移 ---- */
      if (this._bounceAt >= 0) {
        var be = (now - this._bounceAt) / 1000;
        if (be >= BOUNCE_TOTAL) {
          this._bounceAt = -1;
        } else {
          var acc = 0, bi = 0;
          while (bi < BOUNCE_SEGS.length && be >= acc + BOUNCE_SEGS[bi].d) { acc += BOUNCE_SEGS[bi].d; bi++; }
          var seg = BOUNCE_SEGS[Math.min(bi, BOUNCE_SEGS.length - 1)];
          var bn = (be - acc) / seg.d;
          pose.body.y += -4 * seg.h * bn * (1 - bn);
        }
      }

      /* ---- 当前眼环 / 嘴环：形变中逐点插值，静止后复用目标引用 ---- */
      if (this._ringSpring.x < 0.999 || this._ringSpring.v > 0.001 || this._ringSpring.v < -0.001) {
        var rs = clamp(this._ringSpring.x, 0, 1.35);
        this._ringCur = [
          lerpRing(this._ringSrc[0], this._ringDst[0], rs),
          lerpRing(this._ringSrc[1], this._ringDst[1], rs)
        ];
      } else if (this._ringCur !== this._ringDst) {
        this._ringCur = this._ringDst;
      }
      pose.left.ring = this._ringCur[0];
      pose.right.ring = this._ringCur[1];

      if (this._mouthSpring.x < 0.999 || Math.abs(this._mouthSpring.v) > 0.001) {
        var ms = clamp(this._mouthSpring.x, 0, 1.25);
        this._mouthCur = lerpRing(this._mouthSrc, this._mouthDst, ms);
      } else if (this._mouthCur !== this._mouthDst) {
        this._mouthCur = this._mouthDst;
      }
      pose.face.mouthRing = this._mouthCur;

      /* 鼠标注视：帧率无关的指数平滑 */
      var k = 1 - Math.exp(-5.66 * dt);
      var gx = def.gaze !== false ? this._gaze.tx : 0;
      var gy = def.gaze !== false ? this._gaze.ty : 0;
      this._gaze.x += (gx - this._gaze.x) * k;
      this._gaze.y += (gy - this._gaze.y) * k;
      pose.left.lookX += this._gaze.x;
      pose.right.lookX += this._gaze.x;
      pose.left.lookY += this._gaze.y;
      pose.right.lookY += this._gaze.y;
      pose.face.mouthX += this._gaze.x * 0.35;
      pose.face.mouthY += this._gaze.y * 0.28;

      /* 常驻眼神微漂移 */
      if (def.gaze !== false) {
        var w = now / 1000;
        pose.left.lookX += 1.4 * Math.sin(0.42 * w) + 0.5 * Math.sin(1.0 * w);
        pose.right.lookX += 1.4 * Math.sin(0.42 * w + 1) + 0.5 * Math.sin(1.0 * w + 2);
        pose.left.lookY += 0.9 * Math.sin(0.58 * w);
        pose.right.lookY += 0.9 * Math.sin(0.58 * w + 1);
      }

      /* 小尺寸实例放大眼睛占比 */
      if (this._eyeScale !== 1) {
        pose.left.scaleX *= this._eyeScale;
        pose.left.scaleY *= this._eyeScale;
        pose.right.scaleX *= this._eyeScale;
        pose.right.scaleY *= this._eyeScale;
        pose.face.mouthSX *= this._eyeScale;
        pose.face.mouthSY *= this._eyeScale;
      }

      /* 实例主题色（team mate）：体色恒为主题色，眼睛仅覆盖默认色 */
      if (this._theme) {
        pose.body.color = this._theme.body;
        var chEye = this.character.palette.eye;
        if (pose.left.color === chEye) pose.left.color = this._theme.eyes;
        if (pose.right.color === chEye) pose.right.color = this._theme.eyes;
      }

      /* 开合度 = 配置基础值 × 眨眼弹簧 */
      var openS = clamp(this._open.x, 0.02, 1.5);
      pose.left.open = clamp(pose.left.open, 0, 1.3) * openS;
      pose.right.open = clamp(pose.right.open, 0, 1.3) * openS;
      pose.left.scaleX = Math.max(pose.left.scaleX, 0.05);
      pose.left.scaleY = Math.max(pose.left.scaleY, 0.05);
      pose.right.scaleX = Math.max(pose.right.scaleX, 0.05);
      pose.right.scaleY = Math.max(pose.right.scaleY, 0.05);

      /* 表情切换过渡插值 */
      var tt = now - this._transStart;
      if (this._transDur > 0 && tt < this._transDur && this._prevPose) {
        var mouthRing = pose.face.mouthRing;
        pose = lerpPose(this._prevPose, pose, easeInOutCubic(tt / this._transDur));
        pose.face.mouthRing = mouthRing;   /* 环形变由弹簧负责，不参与姿态插值 */
        pose.left.ring = this._ringCur[0];
        pose.right.ring = this._ringCur[1];
      }
      return pose;
    },

    /** sequence 采样；播完按 settle 处理（hold / base / next） */
    _seqPose: function (t, now) {
      var seq = this._seq;
      var frames = seq.frames;
      var last = frames[frames.length - 1];

      if (t >= last.at) {
        if (!seq.done) {
          seq.done = true;
          var s = seq.settle;
          if (s === 'base') {
            this._prevPose = this._lastPose ? clonePose(this._lastPose) : clonePose(last.pose);
            this._transStart = now;
            this._transDur = this._def.transition || 500;
            this._seq = null;
            return null;
          }
          if (s && typeof s === 'object' && s.next) {
            this.setEmotion(s.next, { auto: true });
            return 'switch';
          }
        }
        return clonePose(last.pose);
      }

      if (t <= frames[0].at) return clonePose(frames[0].pose);
      for (var i = 0; i < frames.length - 1; i++) {
        var a = frames[i], b = frames[i + 1];
        if (t >= a.at && t < b.at) {
          var k = easeInOutCubic((t - a.at) / (b.at - a.at));
          return lerpPose(a.pose, b.pose, k);
        }
      }
      return clonePose(last.pose);
    }
  };

  /* ---------------- 对外入口 ---------------- */

  MM.create = function (target, opts) { return new Engine(target, opts); };
  MM.version = '1.0.0';

  /* 载入种子配置（emotions.js 在本脚本之前加载） */
  if (Array.isArray(window.EMOTION_SEED)) {
    window.EMOTION_SEED.forEach(function (raw) {
      var r = register(raw);
      if (!r.ok) console.warn('[MoodMates] 种子配置无效：', r.id, r.errors);
    });
  }
})();
