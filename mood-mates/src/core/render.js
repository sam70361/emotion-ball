/* ============================================================
 * render.js —— 渲染层（纯渲染，不含业务逻辑）
 *
 *   坐标系：viewBox 0 0 240 240，头部中心 C = 120
 *
 *   身体（高端质感）：
 *     4 停靠径向渐变（顶光→本色→边缘收深）+ 釉面高光斑 + 地面软投影，
 *     投影随弹跳升离地面自动收缩变淡
 *
 *   眼睛（两种模式，物理正确）：
 *     bean  豆眼：整个 lens 环即眼睑剪影，闭眼 = 剪影压扁（原有模式）
 *     iris  瞳孔眼：lens 环作为眼睑开口 clipPath，内部依次渲染
 *           眼白 → 虹膜（径向渐变）→ 瞳孔 → 定光源高光。
 *           闭眼 = 眼睑闭合裁掉整个眼球，瞳孔绝不会悬浮在闭眼之外；
 *           小眼（眯/扫读）藏白色高光、瞳孔按比例缩小；注视时瞳孔钳制在眼环 bbox 内。
 *           高光保持光源方位不动 —— 符合真实眼球转动的观感
 *
 *   五官 / 配饰：见 features.js（配饰联动系统）
 *   特效：见 fx.js（发射器 + 签名动作）
 *   球面投影：按眼睛当前高度采样身体轮廓局部半宽，经度换算 + 余弦压缩，
 *            自旋偏航绕到背面自动隐藏（cos <= 0.02 判定）
 *   zzz：睡眠状态右上角循环漂浮的字母粒子
 * ============================================================ */
(function () {
  'use strict';

  var MM = (window.MoodMates = window.MoodMates || {});
  var SVGNS = 'http://www.w3.org/2000/svg';
  var uid = 0;

  var C = 120;   /* 与 geometry.js 保持一致 */

  function el(tag, attrs) {
    var node = document.createElementNS(SVGNS, tag);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }
  function r2(v) { return Math.round(v * 100) / 100; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function shade(hex, amt) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var target = amt < 0 ? 0 : 255;
    var a = Math.abs(amt);
    r = Math.round(r + (target - r) * a);
    g = Math.round(g + (target - g) * a);
    b = Math.round(b + (target - b) * a);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  /* 轮廓环 → 平滑闭合曲线 path
   * Catmull-Rom → 三次贝塞尔：折线顶点在放大后会露出多边形棱角（锯齿感），
   * 用过点样条把每段换成 C 曲线，任意采样密度下边缘都圆润 */
  function ringPath(ring) {
    var n = ring.length;
    if (n < 3) return 'M0 0Z';
    var s = 'M' + ring[0][0].toFixed(2) + ' ' + ring[0][1].toFixed(2);
    for (var i = 0; i < n; i++) {
      var p0 = ring[(i - 1 + n) % n];
      var p1 = ring[i];
      var p2 = ring[(i + 1) % n];
      var p3 = ring[(i + 2) % n];
      s += 'C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(2) + ' ' + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(2) +
           ' ' + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(2) + ' ' + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(2) +
           ' ' + p2[0].toFixed(2) + ' ' + p2[1].toFixed(2);
    }
    return s + 'Z';
  }
  function centroid(ring) {
    var x = 0, y = 0;
    for (var i = 0; i < ring.length; i++) { x += ring[i][0]; y += ring[i][1]; }
    return [x / ring.length, y / ring.length];
  }
  /** 轮廓实际厚度 = 鞋带面积 / 包围盒宽度。
   *  拱形笑眼（∩）包围盒虽高但实际很薄，用厚度才能正确判定闭合感 */
  function ringThickness(ring) {
    var area = 0, minX = 1e9, maxX = -1e9;
    for (var i = 0; i < ring.length; i++) {
      var a = ring[i], b = ring[(i + 1) % ring.length];
      area += a[0] * b[1] - b[0] * a[1];
      if (a[0] < minX) minX = a[0];
      if (a[0] > maxX) maxX = a[0];
    }
    var w = Math.max(maxX - minX, 1);
    return Math.abs(area) / 2 / w;
  }
  function ringBBox(ring) {
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (var i = 0; i < ring.length; i++) {
      var p = ring[i];
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY, w: maxX - minX, h: maxY - minY };
  }
  /* 盒子过窄时取中点，避免 inset 后 lo > hi */
  function clampIn(v, lo, hi) {
    if (lo > hi) return (lo + hi) / 2;
    return clamp(v, lo, hi);
  }
  var BEAN_HL_MIN_H = 10;   /* 豆眼高光：有效可见高度低于此才隐藏（真正闭眼/笑成弧线） */
  var BEAN_HL_FULL_H = 26;  /* 高光点满尺寸的可见高度；更小的眼形按比例缩小高光点 */
  var IRIS_LASH = 0.26;     /* 睫线：effOpen 低于此隐藏虹膜/瞳孔/高光 */
  var IRIS_SMALL = 0.45;    /* 小眼：介于睫线与此之间只留虹膜 */

  /**
   * createBall(container, opts)
   *   opts.character —— 已解析的角色定义（引擎负责解析），包含：
   *     bodyRing / face / palette / eyeStyle / features / fxSkin / defaultEyeRing
   */
  function createBall(container, opts) {
    opts = opts || {};
    var id = 'mm' + (uid++);
    var lite = !!opts.lite;
    var ch = opts.character;
    var face = ch.face;
    var headRing = ch.bodyRing;
    var palette = ch.palette;
    var feats = ch.features || {};
    var pupilCfg = ch.eyeStyle.pupil || null;

    /* ---- 形状轮廓采样：每 2px 一行的 [minX, maxX]，供五官贴合任意剪影 ---- */
    var silMinY = 1e9, silMaxY = -1e9, silMaxW = 0;
    var i;
    for (i = 0; i < headRing.length; i++) {
      if (headRing[i][1] < silMinY) silMinY = headRing[i][1];
      if (headRing[i][1] > silMaxY) silMaxY = headRing[i][1];
    }
    var SIL_STEP = 2;
    var silRows = [];
    (function buildSil() {
      var rows = Math.ceil((silMaxY - silMinY) / SIL_STEP) + 1;
      for (var r = 0; r < rows; r++) {
        var y = silMinY + r * SIL_STEP;
        var lo = 1e9, hi = -1e9;
        for (var e = 0; e < headRing.length; e++) {
          var a = headRing[e], b = headRing[(e + 1) % headRing.length];
          var y0 = a[1], y1 = b[1];
          if ((y0 <= y && y1 >= y) || (y1 <= y && y0 >= y)) {
            var t = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
            var x = a[0] + (b[0] - a[0]) * t;
            if (x < lo) lo = x;
            if (x > hi) hi = x;
          }
        }
        if (lo > hi) { lo = C - 4; hi = C + 4; }
        silRows.push([lo, hi]);
        if (hi - lo > silMaxW) silMaxW = hi - lo;
      }
    })();
    function silAt(y) {
      var r = Math.round((clamp(y, silMinY, silMaxY) - silMinY) / SIL_STEP);
      return silRows[clamp(r, 0, silRows.length - 1)];
    }

    /* ---- SVG 骨架 ---- */
    var svg = el('svg', {
      viewBox: '0 0 240 240',
      width: '100%',
      height: '100%',
      role: 'img',
      'aria-label': opts.label || ch.name || 'Mood Mates 角色'
    });
    svg.style.display = 'block';
    svg.style.overflow = 'visible';

    var defs = el('defs', {});
    svg.appendChild(defs);

    /* 身体渐变：顶光 → 提亮 → 本色 → 边缘收深（伪 3D 体积） */
    var grad = el('radialGradient', { id: id + 'g', cx: '36%', cy: '26%', r: '86%' });
    var stops = [
      el('stop', { offset: '0%' }),
      el('stop', { offset: '38%' }),
      el('stop', { offset: '78%' }),
      el('stop', { offset: '100%' })
    ];
    stops.forEach(function (s) { grad.appendChild(s); });
    defs.appendChild(grad);

    /* 釉面高光渐变（白 → 透明） */
    var glossGrad = el('radialGradient', { id: id + 'gl', cx: '50%', cy: '42%', r: '58%' });
    glossGrad.appendChild(el('stop', { offset: '0%', 'stop-color': '#FFFFFF', 'stop-opacity': '0.9' }));
    glossGrad.appendChild(el('stop', { offset: '68%', 'stop-color': '#FFFFFF', 'stop-opacity': '0.22' }));
    glossGrad.appendChild(el('stop', { offset: '100%', 'stop-color': '#FFFFFF', 'stop-opacity': '0' }));
    defs.appendChild(glossGrad);

    /* 地面投影渐变（黑 → 透明） */
    var shGrad = el('radialGradient', { id: id + 'sh', cx: '50%', cy: '50%', r: '50%' });
    shGrad.appendChild(el('stop', { offset: '0%', 'stop-color': '#000000', 'stop-opacity': '0.9' }));
    shGrad.appendChild(el('stop', { offset: '72%', 'stop-color': '#000000', 'stop-opacity': '0.32' }));
    shGrad.appendChild(el('stop', { offset: '100%', 'stop-color': '#000000', 'stop-opacity': '0' }));
    defs.appendChild(shGrad);

    /* 虹膜渐变（瞳孔眼用）：上深下亮，模拟入射光在虹膜下缘的散射 */
    var irisGrad = null;
    if (pupilCfg) {
      var irisColor = pupilCfg.irisColor || palette.eye;
      irisGrad = el('radialGradient', { id: id + 'ir', cx: '50%', cy: '38%', r: '72%' });
      irisGrad.appendChild(el('stop', { offset: '0%', 'stop-color': shade(irisColor, -0.25) }));
      irisGrad.appendChild(el('stop', { offset: '62%', 'stop-color': irisColor }));
      irisGrad.appendChild(el('stop', { offset: '100%', 'stop-color': shade(irisColor, 0.28) }));
      defs.appendChild(irisGrad);
    }

    /* ---- 地面软投影（不随身体旋转，只跟位移 / 起跳收缩） ---- */
    var shadowRy = 7;
    var shadowCy = Math.min(silMaxY + 6, 234);
    var shadow = el('ellipse', {
      cx: C, cy: shadowCy,
      rx: r2(silMaxW * 0.36), ry: shadowRy,
      fill: 'url(#' + id + 'sh)', opacity: '0.16',
      'pointer-events': 'none'
    });
    svg.appendChild(shadow);

    var fxBack = el('g', { 'pointer-events': 'none' });
    svg.appendChild(fxBack);

    var bodyG = el('g', {});

    /* 背层配饰（帽子 / 提手等从身体后面探出的部分） */
    var featureCtx = {
      el: el, ringPath: ringPath, r2: r2, clamp: clamp, shade: shade,
      C: C, face: face, palette: palette, eyeStyle: ch.eyeStyle, silAt: silAt,
      silMinY: silMinY, silMaxY: silMaxY, defs: defs, uid: id
    };
    var featureLayer = MM.createFeatures
      ? MM.createFeatures(bodyG, feats, featureCtx)
      : null;
    if (featureLayer && featureLayer.back) bodyG.appendChild(featureLayer.back);

    var head = el('path', { d: ringPath(headRing), fill: 'url(#' + id + 'g)', stroke: 'none', 'stroke-width': '2' });
    bodyG.appendChild(head);

    /* 釉面高光斑：贴着剪影左上方，跟随身体一切变换；
     * 用身体剪影 clipPath 裁剪，避免在星形 / 云朵等凹形轮廓上溢出体外 */
    var glossAmt = palette.gloss != null ? palette.gloss : 0.3;
    var gloss = null;
    if (glossAmt > 0) {
      var glossClip = el('clipPath', { id: id + 'bc', clipPathUnits: 'userSpaceOnUse' });
      glossClip.appendChild(el('path', { d: ringPath(headRing) }));
      defs.appendChild(glossClip);
      /* 裁剪组不带 transform，确保 clip 与静态身体环精确对齐 */
      var glossWrap = el('g', { 'clip-path': 'url(#' + id + 'bc)', 'pointer-events': 'none' });
      gloss = el('ellipse', {
        cx: r2(C - silMaxW * 0.17),
        cy: r2(silMinY + (silMaxY - silMinY) * 0.2),
        rx: r2(silMaxW * 0.15),
        ry: r2((silMaxY - silMinY) * 0.1),
        fill: 'url(#' + id + 'gl)',
        opacity: String(glossAmt),
        transform: 'rotate(-24 ' + r2(C - silMaxW * 0.17) + ' ' + r2(silMinY + (silMaxY - silMinY) * 0.2) + ')'
      });
      glossWrap.appendChild(gloss);
      bodyG.appendChild(glossWrap);
    }

    /* 底部环境光遮蔽（AO）：身体下缘轻微压暗，增强体积贴地感 */
    var aoGrad = el('linearGradient', { id: id + 'ao', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
    aoGrad.appendChild(el('stop', { offset: '58%', 'stop-color': '#000000', 'stop-opacity': '0' }));
    aoGrad.appendChild(el('stop', { offset: '100%', 'stop-color': '#000000', 'stop-opacity': '0.14' }));
    defs.appendChild(aoGrad);
    var ao = el('path', { d: ringPath(headRing), fill: 'url(#' + id + 'ao)', 'pointer-events': 'none' });
    bodyG.appendChild(ao);

    /* 腮红在眼睛之下、身体之上 */
    if (featureLayer && featureLayer.mid) bodyG.appendChild(featureLayer.mid);

    var EYE_HALF = ch.eyeStyle.h / 2;

    /* ============ 眼睛构建 ============
     * bean：单 path（原有模式）
     * iris：g[clip] > 眼白 path + 虹膜 + 瞳孔 + 高光（clipPath 引用眼睑环） */
    function buildEye(k) {
      var ring0 = ch.defaultEyeRing[k];
      var base = centroid(ring0);
      var eye = { ring: ring0, c: base, base: base, k: k,
        defBBox: ringBBox(ring0), bbox: ringBBox(ring0), thick: ringThickness(ring0) };

      if (!pupilCfg) {
        /* ---- bean 豆眼 ---- */
        eye.mode = 'bean';
        eye.node = el('path', { fill: palette.eye, stroke: 'none', 'stroke-width': '1.6', d: ringPath(ring0) });
        if (ch.eyeStyle.highlight) {
          var hls = ch.eyeStyle.highlight;
          eye.hls = (Array.isArray(hls) ? hls : [hls]).map(function (h) {
            return {
              cfg: h,
              node: el('circle', {
                r: h.r || 3, fill: h.color || palette.eyeHighlight || '#FFFFFF',
                opacity: h.opacity != null ? h.opacity : 0.92, 'pointer-events': 'none'
              })
            };
          });
        }
        return eye;
      }

      /* ---- iris 瞳孔眼 ---- */
      eye.mode = 'iris';
      eye.thick = ringThickness(ring0);
      var clipId = id + 'ec' + k;
      var cp = el('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' });
      eye.lidClip = el('path', { d: ringPath(ring0) });
      cp.appendChild(eye.lidClip);
      defs.appendChild(cp);

      eye.node = el('g', {});
      var inner = el('g', { 'clip-path': 'url(#' + clipId + ')' });
      eye.inner = inner;

      /* 眼白（与眼睑开口同形同步缩放） */
      eye.socket = el('path', {
        d: ringPath(ring0),
        fill: pupilCfg.socket || '#FFFFFF'
      });
      inner.appendChild(eye.socket);

      /* 虹膜 + 瞳孔（正圆，不随眼睑压扁，闭眼时被裁剪） */
      var irisR = pupilCfg.irisR || EYE_HALF * 0.86;
      var pupilR = pupilCfg.pupilR || irisR * 0.52;
      eye.irisR = irisR;
      eye.pupilR = pupilR;
      eye.iris = el('circle', { r: irisR, fill: 'url(#' + id + 'ir)' });
      eye.pupil = el('circle', { r: pupilR, fill: pupilCfg.pupilColor || shade(pupilCfg.irisColor || palette.eye, -0.72) });
      inner.appendChild(eye.iris);
      inner.appendChild(eye.pupil);

      /* 定光源高光：主高光 + 副光点，不随眼球转动（光源方位不变） */
      var hlList = pupilCfg.highlights || [
        { dx: -irisR * 0.34, dy: -irisR * 0.4, r: irisR * 0.3 },
        { dx: irisR * 0.36, dy: irisR * 0.22, r: irisR * 0.13, opacity: 0.6 }
      ];
      eye.hlNodes = hlList.map(function (h) {
        var n = el('circle', {
          r: h.r, fill: h.color || '#FFFFFF',
          opacity: h.opacity != null ? h.opacity : 0.95,
          'pointer-events': 'none'
        });
        inner.appendChild(n);
        return { cfg: h, node: n };
      });

      eye.node.appendChild(inner);
      return eye;
    }

    var eyeL = buildEye(0);
    var eyeR = buildEye(1);
    bodyG.appendChild(eyeL.node);
    bodyG.appendChild(eyeR.node);
    if (eyeL.hls) eyeL.hls.forEach(function (h) { bodyG.appendChild(h.node); });
    if (eyeR.hls) eyeR.hls.forEach(function (h) { bodyG.appendChild(h.node); });

    /* 眉毛 / 嘴巴 / 前层配饰（眼镜领结等）在眼睛之上 */
    if (featureLayer && featureLayer.front) bodyG.appendChild(featureLayer.front);

    svg.appendChild(bodyG);

    var fxFront = el('g', { 'pointer-events': 'none' });
    svg.appendChild(fxFront);

    var BASE_C = [centroid(ch.defaultEyeRing[0]), centroid(ch.defaultEyeRing[1])];

    /* ---- zzz 睡眠粒子 ---- */
    var zzzNodes = null;
    if (!lite) {
      zzzNodes = [];
      for (var zi = 0; zi < 3; zi++) {
        var zn = el('text', {
          x: 0, y: 0, fill: palette.zzz || '#A8A296', opacity: '0',
          'font-family': "'Space Grotesk', 'Noto Sans SC', sans-serif",
          'font-weight': '700', 'font-style': 'italic', 'text-anchor': 'middle'
        });
        zn.textContent = 'z';
        fxFront.appendChild(zn);
        zzzNodes.push(zn);
      }
    }

    container.appendChild(svg);

    /* ---- 特效实例（fx.js：发射器 + 签名动作） ----
     * anchors：嘴 / 头顶 / 底部锚点与身体半宽，供签名动作发射器定位 */
    var mouthAnchorY = C + face.y + (((feats.mouth && feats.mouth.dy) || 36)) * face.sy;
    var fx = (!lite && MM.createFx)
      ? MM.createFx({
          defs: defs, back: fxBack, front: fxFront, C: C,
          skin: ch.fxSkin, palette: palette, el: el, r2: r2,
          anchors: {
            mouth: { x: C, y: mouthAnchorY },
            top: { x: C, y: silMinY },
            bottom: { x: C, y: silMaxY },
            halfW: silMaxW / 2
          }
        })
      : null;

    /* ---- 状态缓存 ---- */
    var curBodyColor = null;
    var curSketch = -1;
    var prevYaw = 0, prevNow = 0;

    function setBodyColor(color) {
      if (color === curBodyColor) return;
      curBodyColor = color;
      stops[0].setAttribute('stop-color', shade(color, 0.42));
      stops[1].setAttribute('stop-color', shade(color, 0.14));
      stops[2].setAttribute('stop-color', color);
      stops[3].setAttribute('stop-color', shade(color, -0.22));
      if (curSketch > 0.5) head.setAttribute('stroke', shade(color, -0.6));
    }

    /* ---- 眼睛：轮廓环形变 + 球面投影 + 分层眼球 ---- */
    function setEye(eye, pose, k, sketch, yaw) {
      var ring = pose.ring;
      if (ring && ring !== eye.ring) {
        eye.ring = ring;
        var d = ringPath(ring);
        if (eye.mode === 'bean') {
          eye.node.setAttribute('d', d);
        } else {
          eye.lidClip.setAttribute('d', d);
          eye.socket.setAttribute('d', d);
        }
        eye.c = centroid(ring);
        eye.bbox = ringBBox(ring);
        eye.thick = ringThickness(ring);
      }

      var base = eye.c || BASE_C[k];
      var open = clamp(pose.open, 0.02, 2.4);
      var syEye = clamp(pose.scaleY * face.eye, 0.02, 2.4);
      var sxBase = pose.scaleX * face.eye;

      /* bean 模式垂直缩放包含开合度；iris 模式开合度只压眼睑 */
      var syAll = eye.mode === 'bean' ? clamp(syEye * open, 0.02, 2.4) : syEye;

      var halfH = EYE_HALF * clamp(syEye * open, 0.02, 2.4) + 2;
      var ey0 = C + face.y + (base[1] - C) * face.sy + pose.y + pose.lookY;
      ey0 = clamp(ey0, silMinY + halfH, silMaxY - halfH);

      var sil = silAt(ey0);
      var cx0 = (sil[0] + sil[1]) / 2;
      var hw = Math.max((sil[1] - sil[0]) / 2, 12);

      var ox = face.x + (base[0] - C) * face.sx + pose.x + pose.lookX;
      var theta = clamp(ox / hw, -1.15, 1.15);
      var total = theta + (yaw || 0);
      var cn = Math.cos(total);
      if (cn <= 0.02) {
        eye.node.style.display = 'none';
        if (eye.hls) eye.hls.forEach(function (h) { h.node.style.display = 'none'; });
        return;
      }
      eye.node.style.display = '';
      var ex = cx0 + hw * Math.sin(total) * 0.985;
      var dyN = (ey0 - C) / 130;
      var fy = Math.sqrt(1 - dyN * dyN * 0.22);

      var tf =
        'translate(' + r2(ex) + ' ' + r2(ey0) + ')' +
        (pose.rotate ? ' rotate(' + r2(pose.rotate) + ')' : '') +
        ' scale(' + r2(sxBase * cn) + ' ' + r2(syAll * fy) + ')';
      var tfFull = tf + ' translate(' + r2(-base[0]) + ' ' + r2(-base[1]) + ')';
      eye.node.setAttribute('transform', tfFull);

      if (eye.mode === 'bean') {
        /* ---- bean：高光点贴同一变换；有效高度过低（眯/困/扫读）隐藏 ---- */
        if (eye.hls) {
          var boxH = eye.bbox ? eye.bbox.h : EYE_HALF * 2;
          var thickH = (eye.thick != null ? eye.thick : boxH) * 1.65;
          var visH = Math.min(boxH, thickH) * Math.abs(syAll * fy);
          var hideHl = visH <= BEAN_HL_MIN_H || sketch > 0.5;
          var defB = eye.defBBox || eye.bbox;
          var curB = eye.bbox || defB;
          var sxOff = defB && defB.w > 0.5 ? curB.w / defB.w : 1;
          var syOff = defB && defB.h > 0.5 ? curB.h / defB.h : 1;
          var c0 = eye.c || base;
          for (var hi = 0; hi < eye.hls.length; hi++) {
            var hl = eye.hls[hi];
            if (hideHl) {
              hl.node.style.display = 'none';
            } else {
              hl.node.style.display = '';
              /* 小眼形保留按比例缩小的瞳点，眼神不丢 */
              var hlScale = clamp(visH / BEAN_HL_FULL_H, 0.55, 1);
              var hlR = (hl.cfg.r || 3) * hlScale;
              if (hlR !== hl.lastR) {
                hl.node.setAttribute('r', r2(hlR));
                hl.lastR = hlR;
              }
              var hdx = (hl.cfg.dx || 0) * (k === 0 ? 1 : -1) * sxOff;
              var hdy = (hl.cfg.dy || 0) * syOff;
              /* 按当前眼环比例缩放偏移，并保证点心距 bbox 边缘 ≥ 半径 */
              if (curB) {
                hdx = clampIn(hdx, (curB.minX - c0[0]) + hlR, (curB.maxX - c0[0]) - hlR);
                hdy = clampIn(hdy, (curB.minY - c0[1]) + hlR, (curB.maxY - c0[1]) - hlR);
              }
              hl.node.setAttribute('transform', tf +
                ' translate(' + r2(hdx) + ' ' + r2(hdy) + ')');
            }
          }
        }
        var fill = sketch > 0.5 ? 'none' : pose.color;
        /* 线稿眼描边走主题墨色，深色瞳色在暗色页面上也保持可见 */
        var stroke = sketch > 0.5 ? 'var(--sketch-ink, ' + pose.color + ')' : '';
        if (fill !== eye.lastFill) { eye.node.setAttribute('fill', fill); eye.lastFill = fill; }
        if (stroke !== eye.lastStroke) { eye.node.style.stroke = stroke; eye.lastStroke = stroke; }
        return;
      }

      /* ---- iris：眼睑闭合裁剪 + 眼球滑动 ---- */

      /* 实际闭合判定：轮廓厚度 × 开合度。
       * 睫线模式（effOpen < 0.26）：深色睫线，藏起虹膜/瞳孔/高光；
       * 小眼模式（0.26~0.45）：保留虹膜与「按比例缩小的瞳孔」，只藏白色高光 ——
       * 深色瞳点在眯眼 / 扫读等小眼表情里不再整颗消失，眼神不丢 */
      var thick = eye.thick != null ? eye.thick : EYE_HALF * 2 * 0.7;
      var effOpen = open * thick / (EYE_HALF * 2);
      var lash = effOpen < IRIS_LASH;
      var small = !lash && effOpen < IRIS_SMALL;
      if (lash !== eye.lastLash || small !== eye.lastSmall) {
        eye.lastLash = lash;
        eye.lastSmall = small;
        eye.iris.style.display = lash ? 'none' : '';
        eye.pupil.style.display = lash ? 'none' : '';
        for (var lh = 0; lh < eye.hlNodes.length; lh++) {
          eye.hlNodes[lh].node.style.display = (lash || small) ? 'none' : '';
        }
      }
      /* 小眼档瞳孔按开合度缩放（最小 0.6 倍），全表情瞳点观感一致 */
      var pupilScl = lash ? 1 : clamp(effOpen / IRIS_SMALL, 0.6, 1);
      var pupilRNow = eye.pupilR * pupilScl;
      if (pupilRNow !== eye.lastPupilR) {
        eye.pupil.setAttribute('r', r2(pupilRNow));
        eye.lastPupilR = pupilRNow;
      }
      var socketFill = lash ? pose.color : (pupilCfg.socket || '#FFFFFF');
      if (socketFill !== eye.lastSocketFill) {
        eye.socket.setAttribute('fill', socketFill);
        eye.lastSocketFill = socketFill;
      }

      var lidTf = open >= 0.995 && open <= 1.005
        ? ''
        : 'translate(' + r2(base[0]) + ' ' + r2(base[1]) + ') scale(1 ' + r2(open) + ') translate(' + r2(-base[0]) + ' ' + r2(-base[1]) + ')';
      if (lidTf !== eye.lastLidTf) {
        if (lidTf) {
          eye.lidClip.setAttribute('transform', lidTf);
          eye.socket.setAttribute('transform', lidTf);
        } else {
          eye.lidClip.removeAttribute('transform');
          eye.socket.removeAttribute('transform');
        }
        eye.lastLidTf = lidTf;
      }

      /* 瞳孔额外滑动：比眼睑多走 50%，再按当前眼环 bbox 钳制，避免被眼睑裁成月牙 */
      var travel = eye.irisR * 0.5;
      var px = base[0] + clamp(pose.lookX * 0.5, -travel, travel);
      var py = base[1] + clamp(pose.lookY * 0.55, -travel, travel);
      var bb = eye.bbox;
      if (bb) {
        var pR = eye.pupilR || eye.irisR * 0.5;
        var iPad = (eye.irisR || pR) * 0.32;   /* 虹膜约束更松 */
        var padX = Math.max(pR, iPad);
        var visMinY = base[1] + (bb.minY - base[1]) * open;
        var visMaxY = base[1] + (bb.maxY - base[1]) * open;
        px = clampIn(px, bb.minX + padX, bb.maxX - padX);
        py = clampIn(py, visMinY + pR, visMaxY - pR);
      }
      var ballTf = 'translate(' + r2(px - base[0]) + ' ' + r2(py - base[1]) + ')';
      if (ballTf !== eye.lastBallTf) {
        eye.iris.setAttribute('transform', ballTf);
        eye.pupil.setAttribute('transform', ballTf);
        eye.lastBallTf = ballTf;
      }
      eye.iris.setAttribute('cx', r2(base[0]));
      eye.iris.setAttribute('cy', r2(base[1]));
      eye.pupil.setAttribute('cx', r2(base[0]));
      eye.pupil.setAttribute('cy', r2(base[1]));

      /* 定光源高光：位置相对眼心固定（镜像），不跟随眼球滑动 */
      for (var hj = 0; hj < eye.hlNodes.length; hj++) {
        var hn = eye.hlNodes[hj];
        hn.node.setAttribute('cx', r2(base[0] + (hn.cfg.dx || 0) * (k === 0 ? 1 : -1)));
        hn.node.setAttribute('cy', r2(base[1] + (hn.cfg.dy || 0)));
      }

      /* 眼睑着色：iris 模式下 pose.color 用作眼睑线色（sketch 模式描边） */
      var showInner = sketch <= 0.5;
      if (showInner !== eye.lastShowInner) {
        eye.inner.style.display = showInner ? '' : 'none';
        eye.lastShowInner = showInner;
      }
      if (sketch > 0.5) {
        if (!eye.sketchNode) {
          eye.sketchNode = el('path', { fill: 'none', 'stroke-width': '1.6' });
          eye.node.appendChild(eye.sketchNode);
        }
        eye.sketchNode.style.display = '';
        eye.sketchNode.setAttribute('d', ringPath(eye.ring));
        eye.sketchNode.style.stroke = 'var(--sketch-ink, ' + pose.color + ')';
        if (lidTf) eye.sketchNode.setAttribute('transform', lidTf);
        else eye.sketchNode.removeAttribute('transform');
      } else if (eye.sketchNode) {
        eye.sketchNode.style.display = 'none';
      }
    }

    /* ---- 每帧 ---- */
    function applyPose(pose) {
      var b = pose.body;
      var now = performance.now();
      var sketch = b.sketch || 0;

      /* 自旋表现：角度翻转优于折叠 —— 身体随偏航轻微倾斜 + 横向弹性压缩，
       * 像硬币旋转的透视感；避免只有五官滑动、身体纹丝不动的"纸片折叠"观感 */
      var yaw0 = b.yaw || 0;
      var spinTilt = 0, spinSqX = 1;
      if (yaw0 > 0.001 || yaw0 < -0.001) {
        spinTilt = 5 * Math.sin(yaw0);
        spinSqX = 0.88 + 0.12 * Math.abs(Math.cos(yaw0));
      }

      bodyG.setAttribute('transform',
        'translate(' + r2(C + b.x) + ' ' + r2(C + b.y) + ')' +
        ' rotate(' + r2((b.rotate || 0) + spinTilt) + ')' +
        ' scale(' + r2(b.scale * spinSqX) + ' ' + r2(b.scale) + ')' +
        ' translate(' + r2(-C) + ' ' + r2(-C) + ')');
      setBodyColor(b.color);

      /* 地面投影：跟随水平位移，升离地面（弹跳）时收缩变淡 */
      var lift = clamp(-b.y / 52, 0, 1);
      var shOp = sketch > 0.5 ? 0 : 0.16 * (1 - 0.55 * lift);
      shadow.setAttribute('opacity', shOp.toFixed(3));
      if (shOp > 0.001) {
        shadow.setAttribute('transform',
          'translate(' + r2(C + b.x * 0.7) + ' ' + shadowCy + ')' +
          ' scale(' + r2((1 - 0.3 * lift) * b.scale) + ' ' + r2(1 - 0.35 * lift) + ')' +
          ' translate(' + (-C) + ' ' + (-shadowCy) + ')');
      }

      if (sketch !== curSketch) {
        curSketch = sketch;
        if (sketch > 0.5) {
          /* 线稿描边优先取页面主题墨色 --sketch-ink（暗色页浅墨、亮色页深墨），
           * 无主题变量时回退体色加深 */
          head.setAttribute('fill', 'none');
          head.style.stroke = 'var(--sketch-ink, ' + shade(b.color, -0.6) + ')';
          head.setAttribute('stroke-opacity', '0.85');
          if (gloss) gloss.style.display = 'none';
          ao.style.display = 'none';
        } else {
          head.setAttribute('fill', 'url(#' + id + 'g)');
          head.style.stroke = '';
          if (gloss) gloss.style.display = '';
          ao.style.display = '';
        }
      }

      var yaw = b.yaw || 0;
      setEye(eyeL, pose.left, 0, sketch, yaw);
      setEye(eyeR, pose.right, 1, sketch, yaw);

      if (featureLayer) featureLayer.apply(pose, sketch, yaw, now);

      if (lite) return;

      var dt = prevNow ? clamp((now - prevNow) / 1000, 0.001, 0.05) : 1 / 60;
      prevNow = now;

      /* ---- zzz 睡眠粒子 ---- */
      if (zzzNodes) {
        var zOn = (b.zzz || 0) > 0;
        for (var z = 0; z < zzzNodes.length; z++) {
          var znode = zzzNodes[z];
          if (!zOn) {
            if (znode.getAttribute('opacity') !== '0') znode.setAttribute('opacity', '0');
            continue;
          }
          var zp = (now * 0.00033 + z / 3) % 1;
          var zo = (zp < 0.18 ? zp / 0.18 : 1 - (zp - 0.18) / 0.82) * 0.8 * b.zzz;
          znode.setAttribute('opacity', zo.toFixed(3));
          znode.setAttribute('font-size', (12 + zp * 11).toFixed(1));
          znode.setAttribute('transform',
            'translate(' + r2(186 + zp * 34 + 4 * Math.sin(zp * 9)) + ' ' + r2(52 - zp * 42) + ')' +
            ' rotate(' + r2(-10 + zp * 14) + ')');
        }
      }

      /* ---- 自旋角速度（特效触发源） ---- */
      var dYaw = yaw - prevYaw;
      if (!isFinite(dYaw) || Math.abs(dYaw) > 1.2) dYaw = 0;
      prevYaw = yaw;
      var vel = dYaw / dt;

      if (fx) {
        fx.update(dt, now, {
          yaw: yaw, dYaw: dYaw, vel: vel,
          orbitWant: (b.orbit || 0) > 0,
          bodyX: b.x, bodyY: b.y
        });
      }
    }

    function burst(count) {
      if (fx) fx.burst(count);
    }
    /* 签名动作（云絮绽放 / 星星爆闪），返回 false 表示该皮肤无签名 */
    function signature(strength) {
      return fx && fx.signature ? fx.signature(strength) : false;
    }

    function destroy() {
      if (fx) fx.destroy();
      if (svg.parentNode) svg.parentNode.removeChild(svg);
    }

    return { svg: svg, applyPose: applyPose, burst: burst, signature: signature, destroy: destroy,
      signatureMouth: fx && fx.signatureMouth, signatureMouthMs: fx && fx.signatureMouthMs };
  }

  MM.createBall = createBall;
  MM.util = { shade: shade, ringPath: ringPath, centroid: centroid };
})();
