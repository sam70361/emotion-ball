/* ============================================================
 * features.js —— 五官与配饰联动层
 *
 * 五官：
 *   嘴巴：24 点 lens 环，engine 逐点插值后传入（pose.face.mouthRing），
 *        本层负责贴合剪影的横向经度换算与背面隐藏（与眼睛同一套投影）
 *   腮红：两枚椭圆，透明度由 pose.face.blush（0~1）驱动，害羞时拉满
 *   眉毛：两条 lens 短条，角度 / 抬升由 pose.face.browTilt / browRaise 驱动
 *
 * 配饰联动系统：配饰不是写死的静态 path，而是带绑定的组件 ——
 *   kind: 'glasses'  眼镜：镜框由角色实际眼位 / 眼形自动求出（autoFit），
 *                    追随目光 75%（眼睛在镜片内滑动，有视差层次），
 *                    眨眼时镜框轻微下滑回弹，镜片周期性扫过高光（glint）
 *   kind: 'path'     自定义 path：anchor（'face' 投影贴脸 / 'abs' 身体坐标）
 *                    + micro 微动效（float 漂浮 / swing 摇摆）
 *
 * 由 render.js 调用：
 *   var layer = MM.createFeatures(bodyG, feats, ctx)
 *   layer.back / layer.mid / layer.front —— 三个挂载点（可为 null）
 *   layer.apply(pose, sketch, yaw, now)  —— 每帧更新
 * ============================================================ */
(function () {
  'use strict';

  var MM = (window.MoodMates = window.MoodMates || {});
  var TAU = Math.PI * 2;

  function createFeatures(bodyG, feats, ctx) {
    var el = ctx.el, ringPath = ctx.ringPath, r2 = ctx.r2, clamp = ctx.clamp, shade = ctx.shade;
    var C = ctx.C, face = ctx.face, palette = ctx.palette, eyeStyle = ctx.eyeStyle;

    var back = null, mid = null, front = el('g', { 'pointer-events': 'none' });
    var updaters = [];   /* 每帧回调集合（配饰联动） */

    function ensureBack() {
      if (!back) back = el('g', { 'pointer-events': 'none' });
      return back;
    }

    /* 横向经度换算（与眼睛同一套投影），返回 null 表示已绕到背面 */
    function project(ox, oy, yaw) {
      var sil = ctx.silAt(oy);
      var cx0 = (sil[0] + sil[1]) / 2;
      var hw = Math.max((sil[1] - sil[0]) / 2, 12);
      var theta = clamp(ox / hw, -1.15, 1.15);
      var total = theta + (yaw || 0);
      var cn = Math.cos(total);
      if (cn <= 0.02) return null;
      return { x: cx0 + hw * Math.sin(total) * 0.985, cn: cn };
    }

    /* 眼睛在板面坐标上的静态锚点（配饰 autoFit 的基准） */
    function eyeAnchor(side) {   /* side: -1 左 / 1 右 */
      return {
        ox: face.x + side * eyeStyle.dx * face.sx,             /* 相对中线偏移 */
        y: C + face.y + (eyeStyle.cy - C) * face.sy            /* 板面纵坐标 */
      };
    }

    /* micro 微动效求值：返回 { dy, rot } */
    function microVal(micro, now, seed) {
      if (!micro) return { dy: 0, rot: 0 };
      var ph = TAU * now / (micro.period || 3000) + (seed || 0);
      if (micro.type === 'float') return { dy: (micro.amp != null ? micro.amp : 1.6) * Math.sin(ph), rot: 0 };
      if (micro.type === 'swing') return { dy: 0, rot: (micro.amp != null ? micro.amp : 4) * Math.sin(ph) };
      return { dy: 0, rot: 0 };
    }

    /* ================= 配饰构建器 ================= */

    var ACC_BUILDERS = {

      /* ---- 眼镜：autoFit 双镜框 + 鼻梁 + 外侧短脚 + 扫光 ---- */
      glasses: function (acc) {
        var aL = eyeAnchor(-1), aR = eyeAnchor(1);
        var rr = (Math.max(eyeStyle.w, eyeStyle.h) / 2) * face.eye * (acc.fit != null ? acc.fit : 1.22) + 2;
        var color = acc.color || '#C9A24B';
        var sw = acc.strokeWidth != null ? acc.strokeWidth : 2.6;

        var g = el('g', { 'pointer-events': 'none' });
        var lensG = [null, null];
        var glintNodes = [];

        [aL, aR].forEach(function (a, idx) {
          var lg = el('g', {});
          /* 镜片玻璃感：极淡白填充 */
          lg.appendChild(el('circle', { r: r2(rr), fill: '#FFFFFF', 'fill-opacity': 0.07 }));
          /* 镜框 */
          lg.appendChild(el('circle', {
            r: r2(rr), fill: 'none', stroke: color, 'stroke-width': sw
          }));
          /* 扫光：细亮条，clip 在镜片内 */
          var clipId = ctx.uid + 'gls' + idx;
          var cp = el('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' });
          cp.appendChild(el('circle', { cx: 0, cy: 0, r: r2(rr - sw / 2) }));
          ctx.defs.appendChild(cp);
          var glintWrap = el('g', { 'clip-path': 'url(#' + clipId + ')' });
          var glint = el('rect', {
            x: r2(-rr * 0.22), y: r2(-rr * 1.6), width: r2(rr * 0.34), height: r2(rr * 3.2),
            fill: '#FFFFFF', opacity: 0.55, transform: 'rotate(24)'
          });
          glintWrap.appendChild(glint);
          lg.appendChild(glintWrap);
          glintNodes.push(glint);
          lensG[idx] = lg;
          g.appendChild(lg);
        });

        /* 鼻梁弧 + 外侧短镜脚（静态形状，随组变换） */
        var bridge = el('path', { fill: 'none', stroke: color, 'stroke-width': sw, 'stroke-linecap': 'round' });
        var armL = el('path', { fill: 'none', stroke: color, 'stroke-width': sw, 'stroke-linecap': 'round' });
        var armR = el('path', { fill: 'none', stroke: color, 'stroke-width': sw, 'stroke-linecap': 'round' });
        g.appendChild(bridge);
        g.appendChild(armL);
        g.appendChild(armR);

        var slide = 0;   /* 眨眼下滑的弹性状态 */

        return {
          node: g,
          layer: 'front',
          update: function (pose, sketch, yaw, now) {
            var f = pose.face || {};
            var openMin = Math.min(pose.left.open != null ? pose.left.open : 1,
                                   pose.right.open != null ? pose.right.open : 1);
            /* 眨眼下滑：闭眼程度驱动目标位移，指数平滑回弹 */
            var slideT = clamp(1 - openMin, 0, 1) * 1.8;
            slide += (slideT - slide) * 0.25;

            /* 追随目光 75% + 微漂浮 */
            var mv = microVal(acc.micro || { type: 'float', amp: 0.7, period: 3400 }, now, 1.3);
            var lookX = (pose.left.lookX || 0) * 0.75;
            var lookY = (pose.left.lookY || 0) * 0.75;
            var byv = (aL.y + aR.y) / 2 + lookY + slide + mv.dy;

            var pL = project(aL.ox + lookX, byv, yaw);
            var pR = project(aR.ox + lookX, byv, yaw);
            if (!pL && !pR) { g.style.display = 'none'; return; }
            g.style.display = '';
            g.setAttribute('opacity', sketch > 0.5 ? '0.55' : '1');

            var scl = face.eye;
            [pL, pR].forEach(function (p, idx) {
              var lg = lensG[idx];
              if (!p) { lg.style.display = 'none'; return; }
              lg.style.display = '';
              lg.setAttribute('transform',
                'translate(' + r2(p.x) + ' ' + r2(byv) + ') scale(' + r2(p.cn * scl) + ' ' + r2(scl) + ')');
            });

            /* 扫光：每 glintPeriod 一次，0.5s 内从左扫到右 */
            var per = acc.glintPeriod || 5200;
            var gp = (now % per) / per;
            var sweep = gp < 0.1 ? gp / 0.1 : -1;
            for (var gi = 0; gi < glintNodes.length; gi++) {
              if (sweep < 0) { glintNodes[gi].setAttribute('opacity', '0'); continue; }
              glintNodes[gi].setAttribute('opacity', (0.5 * Math.sin(Math.PI * sweep)).toFixed(3));
              glintNodes[gi].setAttribute('transform',
                'translate(' + r2((sweep * 2 - 1) * rr * 1.3) + ' 0) rotate(24)');
            }

            /* 鼻梁：两镜片内缘之间的上拱弧；镜脚：外缘向外上方短线 */
            if (pL && pR) {
              var x1 = pL.x + rr * pL.cn * scl, x2 = pR.x - rr * pR.cn * scl;
              bridge.style.display = '';
              bridge.setAttribute('d',
                'M' + r2(x1) + ' ' + r2(byv) +
                ' Q' + r2((x1 + x2) / 2) + ' ' + r2(byv - rr * 0.55) + ' ' + r2(x2) + ' ' + r2(byv));
            } else {
              bridge.style.display = 'none';
            }
            if (pL) {
              var xa = pL.x - rr * pL.cn * scl;
              armL.style.display = '';
              armL.setAttribute('d', 'M' + r2(xa) + ' ' + r2(byv) + ' L' + r2(xa - 7 * pL.cn) + ' ' + r2(byv - 3));
            } else armL.style.display = 'none';
            if (pR) {
              var xb = pR.x + rr * pR.cn * scl;
              armR.style.display = '';
              armR.setAttribute('d', 'M' + r2(xb) + ' ' + r2(byv) + ' L' + r2(xb + 7 * pR.cn) + ' ' + r2(byv - 3));
            } else armR.style.display = 'none';
          }
        };
      },

      /* ---- 自定义 path：anchor 'abs'（身体坐标，默认）/ 'face'（贴脸投影） ---- */
      path: function (acc) {
        var node = el('path', {
          d: acc.d,
          fill: acc.fill || 'none',
          stroke: acc.stroke || 'none',
          'stroke-width': acc.strokeWidth != null ? acc.strokeWidth : 0,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          opacity: acc.opacity != null ? acc.opacity : 1
        });
        var seed = acc.seed != null ? acc.seed : Math.random() * TAU;

        return {
          node: node,
          layer: acc.layer || 'front',
          update: function (pose, sketch, yaw, now) {
            var mv = microVal(acc.micro, now, seed);
            if (acc.anchor === 'face') {
              var byv = C + face.y + (acc.dy || 0) * face.sy + mv.dy;
              var p = project((acc.dx || 0) * face.sx, byv, yaw);
              if (!p) { node.style.display = 'none'; return; }
              node.style.display = '';
              node.setAttribute('transform',
                'translate(' + r2(p.x) + ' ' + r2(byv) + ')' +
                (mv.rot ? ' rotate(' + r2(mv.rot) + ')' : '') +
                ' scale(' + r2(p.cn) + ' 1)');
            } else if (acc.micro) {
              node.setAttribute('transform',
                'translate(' + r2(acc.dx || 0) + ' ' + r2((acc.dy || 0) + mv.dy) + ')' +
                (mv.rot ? ' rotate(' + r2(mv.rot) + ' ' + r2(acc.pivotX || C) + ' ' + r2(acc.pivotY || C) + ')' : ''));
            } else if (acc.transform) {
              node.setAttribute('transform', acc.transform);
            }
          }
        };
      }
    };

    (feats.accessories || []).forEach(function (acc) {
      var kind = acc.kind || 'path';
      var builder = ACC_BUILDERS[kind];
      if (!builder) { console.warn('[MoodMates] 未知配饰类型：' + kind); return; }
      var built = builder(acc);
      var target = (acc.layer || built.layer) === 'back' ? ensureBack() : front;
      target.appendChild(built.node);
      if (built.update) updaters.push(built.update);
    });

    /* ---------------- 腮红 ---------------- */
    var blushL = null, blushR = null, blushCfg = null;
    if (feats.blush !== false) {
      blushCfg = Object.assign(
        { dx: 34, dy: 26, rx: 11, ry: 6.5, color: palette.blush || '#F2A9A0', max: 0.85 },
        feats.blush === true ? {} : (feats.blush || {})
      );
      mid = el('g', { 'pointer-events': 'none' });
      blushL = el('ellipse', { rx: blushCfg.rx, ry: blushCfg.ry, fill: blushCfg.color, opacity: '0' });
      blushR = el('ellipse', { rx: blushCfg.rx, ry: blushCfg.ry, fill: blushCfg.color, opacity: '0' });
      mid.appendChild(blushL);
      mid.appendChild(blushR);
    }

    /* ---------------- 眉毛 ---------------- */
    var browL = null, browR = null, browCfg = null, browRing = null;
    if (feats.brows) {
      browCfg = Object.assign(
        { w: 16, h: 3.4, gap: 10, color: palette.eye, always: false, bend: 0.35 },
        feats.brows === true ? {} : feats.brows
      );
      browRing = MM.geo.lens(0, 0, { w: browCfg.w, h: browCfg.h, bend: browCfg.bend, taper: 0.7 });
      browL = el('path', { d: ringPath(browRing), fill: browCfg.color });
      browR = el('path', { d: ringPath(browRing), fill: browCfg.color });
      front.appendChild(browL);
      front.appendChild(browR);
    }

    /* ---------------- 嘴巴 ---------------- */
    var mouthNode = null, mouthCfg = null, lastMouthRing = null;
    if (feats.mouth) {
      mouthCfg = Object.assign(
        { dy: 36, color: palette.mouth || palette.eye },
        feats.mouth === true ? {} : feats.mouth
      );
      mouthNode = el('path', { fill: mouthCfg.color, stroke: 'none' });
      front.appendChild(mouthNode);
    }

    /* ---------------- 每帧 ---------------- */
    function apply(pose, sketch, yaw, now) {
      var f = pose.face || {};

      /* 腮红：跟随眼位左右对称，透明度 = blush 值 × 上限 */
      if (blushL) {
        var bv = clamp(f.blush || 0, 0, 1) * blushCfg.max * (sketch > 0.5 ? 0.4 : 1);
        if (bv < 0.01) {
          blushL.setAttribute('opacity', '0');
          blushR.setAttribute('opacity', '0');
        } else {
          /* 腮红贴在脸颊上，跟随目光 25%（比眼睛弱，形成层次） */
          var blshX = (pose.left.lookX || 0) * 0.25;
          var by = C + face.y + blushCfg.dy * face.sy + (pose.left.lookY || 0) * 0.25;
          var pL = project(-blushCfg.dx * face.sx + blshX, by, yaw);
          var pR = project(blushCfg.dx * face.sx + blshX, by, yaw);
          blushL.setAttribute('opacity', pL ? bv.toFixed(3) : '0');
          blushR.setAttribute('opacity', pR ? bv.toFixed(3) : '0');
          if (pL) blushL.setAttribute('transform', 'translate(' + r2(pL.x) + ' ' + r2(by) + ') scale(' + r2(pL.cn) + ' 1)');
          if (pR) blushR.setAttribute('transform', 'translate(' + r2(pR.x) + ' ' + r2(by) + ') scale(' + r2(pR.cn) + ' 1)');
        }
      }

      /* 眉毛：位于双眼上方，tilt 内外反向（怒），raise 抬升（惊）；
       * 联动：跟随目光 80%（与眼球同向微移），闭眼时随眼睑放松下垂 */
      if (browL) {
        var vis = clamp(Math.max(f.browVis || 0, browCfg.always ? 1 : 0), 0, 1);
        if (vis < 0.02) {
          browL.setAttribute('opacity', '0');
          browR.setAttribute('opacity', '0');
        } else {
          var bx = browCfg.dx != null ? browCfg.dx : 26;
          var openB = Math.min(pose.left.open != null ? pose.left.open : 1,
                               pose.right.open != null ? pose.right.open : 1);
          var relax = clamp(1 - openB, 0, 1) * 2.6;   /* 闭眼放松下垂 */
          var blkX = (pose.left.lookX || 0) * 0.8;
          var blkY = (pose.left.lookY || 0) * 0.8;
          var byv = C + face.y + ((browCfg.dyTop != null ? browCfg.dyTop : -30) - (f.browRaise || 0)) * face.sy + blkY + relax;
          var tilt = f.browTilt || 0;
          var qL = project(-bx * face.sx + blkX, byv, yaw);
          var qR = project(bx * face.sx + blkX, byv, yaw);
          browL.setAttribute('opacity', qL ? vis.toFixed(3) : '0');
          browR.setAttribute('opacity', qR ? vis.toFixed(3) : '0');
          if (qL) browL.setAttribute('transform',
            'translate(' + r2(qL.x) + ' ' + r2(byv) + ') rotate(' + r2(-tilt) + ') scale(' + r2(qL.cn * face.eye) + ' ' + r2(face.eye) + ')');
          if (qR) browR.setAttribute('transform',
            'translate(' + r2(qR.x) + ' ' + r2(byv) + ') rotate(' + r2(tilt) + ') scale(' + r2(qR.cn * face.eye) + ' ' + r2(face.eye) + ')');
        }
      }

      /* 嘴巴：engine 传入形变后的 mouthRing（局部坐标，中心 0,0）。
       * 线稿模式不画嘴 —— 只留轮廓与眼睑线，画面更接近手绘草稿 */
      if (mouthNode) {
        var ring = f.mouthRing;
        if (ring && ring !== lastMouthRing) {
          lastMouthRing = ring;
          mouthNode.setAttribute('d', ringPath(ring));
        }
        var my = C + face.y + (mouthCfg.dy + (f.mouthY || 0)) * face.sy;
        var pm = project((f.mouthX || 0) * face.sx, my, yaw);
        if (!pm || sketch > 0.5) {
          mouthNode.style.display = 'none';
        } else {
          mouthNode.style.display = '';
          mouthNode.setAttribute('transform',
            'translate(' + r2(pm.x) + ' ' + r2(my) + ')' +
            ' scale(' + r2((f.mouthSX || 1) * pm.cn * face.eye) + ' ' + r2((f.mouthSY || 1) * face.eye) + ')');
        }
      }

      /* 配饰联动更新 */
      for (var ui = 0; ui < updaters.length; ui++) {
        updaters[ui](pose, sketch, yaw, now);
      }
    }

    return { back: back, mid: mid, front: front, apply: apply };
  }

  MM.createFeatures = createFeatures;
})();
