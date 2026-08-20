/* ============================================================
 * fx.js —— 特效层（发射器 + 签名动作 + 轨道粒子）
 *
 * 三类粒子：
 *   轨道粒子 orbit：低倾角轨道匀速环绕（"思考中"常驻）+ 自旋甩尾
 *   爆发粒子 burst：一次性物理粒子（速度衰减 + 微重力，"撒花"）
 *   发射粒子 emit ：签名动作专属 —— 每种皮肤有自己的发射锚点与行为脚本
 *
 * 签名动作（signature，替代千篇一律的"转圈甩粒子"）：
 *   cloudpuff 云絮绽放：身体四周噗噗冒出一圈蓬松小云朵，摇曳上飘后消散
 *   stardust 星星爆闪：环身星芒逐个弹出闪烁；思考轨道混入旋转铅笔
 *
 * 深度处理：轨道粒子按 z 值在 front / back 两层切换，
 * 绕到身体背面自动被身体遮挡，保留 3D 环绕感。
 * ============================================================ */
(function () {
  'use strict';

  var MM = (window.MoodMates = window.MoodMates || {});
  var SVGNS = 'http://www.w3.org/2000/svg';
  var TAU = Math.PI * 2;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function el(tag, attrs) {
    var node = document.createElementNS(SVGNS, tag);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }

  /* ---------------- 通用小形状 ---------------- */

  /* 四芒星 */
  var SPARK_PATH = 'M0 -1 C0.12 -0.22 0.22 -0.12 1 0 C0.22 0.12 0.12 0.22 0 1 C-0.12 0.22 -0.22 0.12 -1 0 C-0.22 -0.12 -0.12 -0.22 0 -1 Z';
  /* 五角星 */
  var STAR_PATH = (function () {
    var pts = [];
    for (var e = 0; e < 10; e++) {
      var a = -Math.PI / 2 + e * Math.PI / 5;
      var r = e % 2 === 0 ? 1 : 0.42;
      pts.push((Math.cos(a) * r).toFixed(3) + ' ' + (Math.sin(a) * r).toFixed(3));
    }
    return 'M' + pts.join('L') + 'Z';
  })();
  /* 铅笔（朝右） */
  var PENCIL_PATH = 'M-1 -0.16 L0.5 -0.16 L1 0 L0.5 0.16 L-1 0.16 Z M-1 -0.16 L-0.78 -0.16 L-0.78 0.16 L-1 0.16 Z';

  /* ---------------- 皮肤定义 ----------------
   * colors        默认配色（palette.fx 可覆盖）
   * makeOrbitNode 轨道粒子节点（单位尺寸，transform 缩放）
   * makeBurstNode 撒花粒子节点
   * orbitSpecial  可选：思考轨道中混入的特殊粒子（如铅笔），几率 chance
   * signature(api, strength)  签名动作：用 api.emit 发射行为粒子 */
  var SKINS = {

    /* ===== 云絮（云宝 · 通用）===== */
    cloudpuff: {
      colors: ['#C3D4F2', '#9FB3D6', '#F5D889', '#9A8AE8'],
      orbitSize: [2.8, 4.4],
      burstSize: [3, 5.4],
      makeOrbitNode: function (c) { return el('circle', { r: 1, fill: c, opacity: 0.9 }); },
      makeBurstNode: function (c) {
        return Math.random() < 0.3
          ? el('path', { d: SPARK_PATH, fill: c })
          : el('circle', { r: 1, fill: c, opacity: 0.9 });
      },
      /* 云絮绽放：身体四周噗噗冒出一圈蓬松小云朵——带过冲的弹性弹出、
       * 摇曳上飘、末段收缩淡出；每朵出生时伴一圈"噗"的空气涟漪，
       * 云朵之间点缀微光四芒星。小云朵为多圆拼合的迷你云剪影
       * （组透明度整体淡入淡出，拼接处无叠色缝），左上叠受光提亮，
       * 与主体"左上光源"一致。全部锚定身体中心 + 实时身体位移 */
      signature: function (api, strength) {
        var n = Math.round(6 + 4 * strength);
        var halfW = (api.anchors && api.anchors.halfW) || 104;

        /* 迷你云剪影：底部扁圆 + 三团圆弧，单位尺寸，transform 缩放 */
        function puffNode(base) {
          var g = el('g', {});
          g.appendChild(el('ellipse', { cx: 0, cy: 0.32, rx: 1.02, ry: 0.5, fill: base }));
          g.appendChild(el('circle', { cx: -0.58, cy: 0.06, r: 0.56, fill: base }));
          g.appendChild(el('circle', { cx: 0.04, cy: -0.26, r: 0.64, fill: base }));
          g.appendChild(el('circle', { cx: 0.62, cy: 0.1, r: 0.5, fill: base }));
          g.appendChild(el('circle', { cx: -0.2, cy: -0.34, r: 0.34, fill: '#FFFFFF', opacity: 0.55 }));
          g.appendChild(el('circle', { cx: 0.3, cy: -0.12, r: 0.22, fill: '#FFFFFF', opacity: 0.35 }));
          return g;
        }

        for (var i = 0; i < n; i++) {
          (function (i) {
            var ang = TAU * i / n + rand(-0.25, 0.25);
            var rr = halfW * rand(0.98, 1.24);
            var x0 = api.C + Math.cos(ang) * rr;
            var y0 = api.C + Math.sin(ang) * rr * 0.9;
            var size = rand(7, 12);
            var sway = rand(2.5, 5) * (Math.random() < 0.5 ? -1 : 1);
            var phase = rand(0, TAU);
            var rise = rand(26, 46);
            var tilt = rand(4, 10) * (Math.random() < 0.5 ? -1 : 1);
            /* 云絮底色取比本体略深的雾蓝，深浅主题下都可辨 */
            var base = Math.random() < 0.55 ? '#CBD9F4' : '#AFC4EC';
            var delay = i * 70;

            /* "噗"——出生点的空气涟漪，快速扩散淡出 */
            api.emit(el('circle', { fill: 'none', stroke: '#9FB3D6', 'stroke-width': 1.2 }), {
              delay: delay, x: x0, y: y0,
              max: 0.42,
              step: function (p, dt, u) {
                var x = x0 + api.state.bodyX, y = y0 + api.state.bodyY;
                p.node.setAttribute('cx', x.toFixed(2));
                p.node.setAttribute('cy', y.toFixed(2));
                p.node.setAttribute('r', (size * (0.4 + 1.5 * u)).toFixed(2));
                p.node.setAttribute('opacity', (0.45 * (1 - u)).toFixed(3));
              }
            });

            /* 小云朵本体：过冲弹出 → 缓升摇曳 → 收缩淡出 */
            api.emit(puffNode(base), {
              delay: delay, x: x0, y: y0,
              max: rand(1.1, 1.5),
              step: function (p, dt, u) {
                var s;
                if (u < 0.18) { var k = u / 0.18; s = 1.18 * (1 - Math.pow(1 - k, 3)); }
                else if (u < 0.34) { s = 1.18 - 0.18 * (u - 0.18) / 0.16; }
                else { s = 1; }
                if (u > 0.72) { s *= 1 - 0.5 * (u - 0.72) / 0.28; }
                var x = x0 + api.state.bodyX + Math.sin(phase + u * 5.2) * sway;
                var y = y0 + api.state.bodyY - rise * u;
                var rot = tilt * Math.sin(phase + u * 3.4);
                var op = u > 0.72 ? (1 - u) / 0.28 : 1;
                p.node.setAttribute('opacity', (op * 0.95).toFixed(3));
                p.node.setAttribute('transform',
                  'translate(' + x.toFixed(2) + ' ' + y.toFixed(2) + ') rotate(' + rot.toFixed(1) + ') scale(' + (size * s).toFixed(3) + ')');
              }
            });
          })(i);
        }

        /* 云隙微光：少量四芒星在云朵间隙弹入闪烁 */
        var nSpark = Math.round(3 + 2 * strength);
        for (var k = 0; k < nSpark; k++) {
          (function (k) {
            var ang = TAU * (k + 0.5) / nSpark + rand(-0.3, 0.3);
            var rr = halfW * rand(1.05, 1.35);
            var x0 = api.C + Math.cos(ang) * rr;
            var y0 = api.C + Math.sin(ang) * rr * 0.9;
            var size = rand(2, 3.6);
            var spin = rand(-140, 140);
            api.emit(el('path', { d: SPARK_PATH, fill: k % 2 ? '#9A8AE8' : '#F5D889' }), {
              delay: 240 + k * 130,
              x: x0, y: y0,
              max: rand(0.5, 0.85),
              step: function (p, dt, u) {
                var x = x0 + api.state.bodyX;
                var y = y0 + api.state.bodyY - 16 * u;
                var s = u < 0.25 ? size * (u / 0.25) : size * (1 - 0.3 * (u - 0.25) / 0.75);
                var tw = 0.7 + 0.3 * Math.sin(u * 24 + k);
                p.node.setAttribute('opacity', ((1 - Math.pow(u, 2.2)) * tw).toFixed(3));
                p.node.setAttribute('transform',
                  'translate(' + x.toFixed(2) + ' ' + y.toFixed(2) + ') rotate(' + (spin * u).toFixed(1) + ') scale(' + s.toFixed(3) + ')');
              }
            });
          })(k);
        }
        return true;
      }
    },

    /* ===== 星尘（亮亮 · 教育）===== */
    stardust: {
      colors: ['#F5B840', '#F7D07A', '#F09A4E', '#FBE3A8'],
      orbitSize: [3.4, 5.6],
      burstSize: [3, 6.4],
      makeOrbitNode: function (c) { return el('path', { d: SPARK_PATH, fill: c }); },
      makeBurstNode: function (c) {
        return Math.random() < 0.4
          ? el('path', { d: STAR_PATH, fill: c })
          : el('path', { d: SPARK_PATH, fill: c });
      },
      /* 思考轨道里偶尔混入一支旋转铅笔 */
      orbitSpecial: {
        chance: 0.3,
        make: function (c) {
          var g = el('g', {});
          g.appendChild(el('path', { d: PENCIL_PATH, fill: '#E8A64C' }));
          g.appendChild(el('path', { d: 'M0.5 -0.16 L1 0 L0.5 0.16 Z', fill: '#5C4632' }));
          return g;
        },
        size: [5, 6.5]
      },
      signature: function (api, strength) {
        var n = Math.round(10 * strength);
        for (var i = 0; i < n; i++) {
          (function (i) {
            var ang = TAU * i / n + rand(-0.2, 0.2);
            var rr = rand(96, 126);
            var x0 = api.C + api.state.bodyX + Math.cos(ang) * rr;
            var y0 = api.C + api.state.bodyY + Math.sin(ang) * rr * 0.92;
            var size = rand(3.4, 6.2);
            var spin = rand(-140, 140);
            var big = Math.random() < 0.45;
            api.emit(el('path', { d: big ? STAR_PATH : SPARK_PATH, fill: api.pick() }), {
              delay: i * 55,
              x: x0, y: y0,
              max: rand(0.75, 1.15),
              step: function (p, dt, u) {
                p.y -= 14 * dt;
                /* 弹入过冲 → 闪烁 → 收缩消失 */
                var s = u < 0.22 ? size * (u / 0.22) * 1.25 : size * (1 - 0.35 * (u - 0.22) / 0.78);
                var tw = 0.75 + 0.25 * Math.sin(u * 26 + i);
                p.node.setAttribute('opacity', ((1 - Math.pow(u, 2.2)) * tw).toFixed(3));
                p.node.setAttribute('transform',
                  'translate(' + p.x.toFixed(2) + ' ' + p.y.toFixed(2) + ') rotate(' + (spin * u).toFixed(1) + ') scale(' + s.toFixed(3) + ')');
              }
            });
          })(i);
        }
        return true;
      }
    }
  };


  function createFx(ctx) {
    var C = ctx.C;
    var skin = SKINS[ctx.skin] || SKINS.cloudpuff;
    var colors = (ctx.palette && ctx.palette.fx) || skin.colors;
    var back = ctx.back, front = ctx.front;
    var anchors = ctx.anchors || {
      mouth: { x: C, y: C + 36 }, top: { x: C, y: C - 104 },
      bottom: { x: C, y: C + 104 }, halfW: 104
    };

    var orbiters = [];    /* 环绕 / 自旋粒子 */
    var pieces = [];      /* 撒花粒子 */
    var emits = [];       /* 签名动作发射粒子 */
    var wasFast = false;
    var spawnAt = [];
    var spinPlane = null;
    var orbitNextAt = 0;
    var lastState = { yaw: 0, dYaw: 0, vel: 0, orbitWant: false, bodyX: 0, bodyY: 0 };

    function pick(arr) { return (arr || colors)[(Math.random() * (arr || colors).length) | 0]; }

    function orbitPoint(o, lam) {
      var hx = o.rad * Math.sin(lam);
      var hy = -o.rad * Math.cos(lam) * Math.sin(o.tilt);
      var ca = Math.cos(o.roll), sa = Math.sin(o.roll);
      return {
        x: C + hx * ca - hy * sa,
        y: C + hx * sa + hy * ca,
        z: Math.cos(lam) * Math.cos(o.tilt)
      };
    }

    /** mode: 'spin'（一次性甩出）| 'orbit'（常驻环绕） */
    function spawnOrbiter(mode, cfg) {
      if (orbiters.length > 26) return;
      var special = mode === 'orbit' && skin.orbitSpecial && Math.random() < skin.orbitSpecial.chance;
      var node = special ? skin.orbitSpecial.make(pick()) : skin.makeOrbitNode(pick());
      front.appendChild(node);
      var sz = special ? skin.orbitSpecial.size : skin.orbitSize;
      orbiters.push(Object.assign({
        node: node, inFront: true, mode: mode,
        life: 0, max: mode === 'spin' ? rand(1.1, 2) : Infinity,
        ret: 0,
        size: rand(sz[0], sz[1]),
        rotSpd: special ? rand(40, 80) : rand(-160, 160),
        rot: rand(0, 360)
      }, cfg));
    }

    function spawnSpinGroup(yaw, dir) {
      spinPlane = {
        tilt: rand(0.18, 0.5),
        roll: rand(-0.7, 0.7)
      };
      var n = Math.round(rand(5, 8));
      spawnAt = [];
      for (var q = 0; q < n; q++) spawnAt.push({ at: performance.now() + q * rand(45, 90), dir: dir, yaw: yaw });
    }

    function releaseSpinOne(item, yaw) {
      spawnOrbiter('spin', {
        o: {
          lam: yaw - rand(0, 0.2) * item.dir,
          lamVel: item.dir * rand(2.2, 4.2),
          tilt: spinPlane.tilt + rand(-0.06, 0.06),
          roll: spinPlane.roll + rand(-0.08, 0.08),
          rad: rand(118, 142),
          radVel: rand(14, 40)
        }
      });
    }

    function removeOrbiter(idx) {
      orbiters[idx].node.remove();
      orbiters.splice(idx, 1);
    }

    /* ---- 撒花 ---- */
    function burst(count) {
      count = count || 20;
      for (var i = 0; i < count && pieces.length < 56; i++) {
        var ang = (i / count) * TAU + rand(-0.35, 0.35);
        var spd = rand(170, 360);
        var node = skin.makeBurstNode(pick());
        front.appendChild(node);
        pieces.push({
          x: C + Math.cos(ang) * rand(96, 118),
          y: C + Math.sin(ang) * rand(96, 118),
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - rand(20, 75),
          life: 0, max: rand(0.45, 0.9),
          r: rand(skin.burstSize[0], skin.burstSize[1]),
          rot: rand(0, 360), vr: rand(-260, 260),
          el: node
        });
      }
    }

    /* ---- 签名动作发射 ---- */
    var emitApi = {
      C: C,
      anchors: anchors,
      state: lastState,
      pick: function () { return pick(); },
      emit: function (node, cfg) {
        if (emits.length > 44) { return; }
        node.setAttribute('opacity', '0');
        front.appendChild(node);
        emits.push({
          node: node,
          x: cfg.x, y: cfg.y,
          born: performance.now() + (cfg.delay || 0),
          life: 0, max: cfg.max || 1,
          step: cfg.step
        });
      }
    };

    function signature(strength) {
      if (!skin.signature) return false;
      return skin.signature(emitApi, strength || 1) === true;
    }

    /* ---- 每帧 ---- */
    function update(dt, now, state) {
      lastState.yaw = state.yaw;
      lastState.dYaw = state.dYaw;
      lastState.vel = state.vel;
      lastState.orbitWant = state.orbitWant;
      lastState.bodyX = state.bodyX || 0;
      lastState.bodyY = state.bodyY || 0;

      var vel = state.vel;
      var fast = Math.abs(vel) >= 0.9;
      var dir = vel >= 0 ? 1 : -1;

      /* 自旋达速：起一组错峰粒子 */
      if (fast && !wasFast) spawnSpinGroup(state.yaw, dir);
      if (!fast) spawnAt.length = 0;
      wasFast = fast;
      if (Math.abs(vel) >= 5) {
        while (spawnAt.length && now >= spawnAt[0].at) {
          releaseSpinOne(spawnAt.shift(), state.yaw);
        }
      }

      /* 常驻环绕补给：错峰起 5 枚 */
      if (state.orbitWant && now >= orbitNextAt) {
        var orbitCount = 0;
        for (var oc = 0; oc < orbiters.length; oc++) if (orbiters[oc].mode === 'orbit') orbitCount++;
        if (orbitCount < 5) {
          spawnOrbiter('orbit', {
            o: {
              lam: rand(0, TAU),
              lamVel: (Math.random() < 0.5 ? -1 : 1) * rand(1.5, 2.2),
              tilt: rand(0.1, 0.24),
              roll: rand(-0.12, 0.12),
              rad: rand(122, 146),
              radVel: 0
            }
          });
        }
        orbitNextAt = now + 420;
      }

      /* 轨道粒子推进 */
      for (var ti = orbiters.length - 1; ti >= 0; ti--) {
        var ob = orbiters[ti];
        ob.life += dt;
        var retreat = ob.mode === 'orbit' ? !state.orbitWant : ob.life > ob.max;
        ob.ret = clamp(ob.ret + (retreat ? dt / 0.4 : -dt / 0.3), 0, 1);
        if (retreat && ob.ret >= 1) { removeOrbiter(ti); continue; }

        var o = ob.o;
        o.lam += o.lamVel * dt + (ob.mode === 'spin' ? state.dYaw * 0.55 : state.dYaw * 0.2);
        if (ob.mode === 'spin') {
          o.lamVel *= Math.exp(-1.1 * dt);
          o.rad += o.radVel * dt;
          o.radVel *= Math.exp(-1.6 * dt);
        }
        ob.rot += ob.rotSpd * dt;

        var p = orbitPoint(o, o.lam);
        /* 深度换层：z < 0 转入背层被身体遮挡 */
        var wantFront = p.z >= 0;
        if (wantFront !== ob.inFront) {
          (wantFront ? front : back).appendChild(ob.node);
          ob.inFront = wantFront;
        }
        var grow = Math.min(ob.life / 0.3, 1);
        grow = grow * grow * (3 - 2 * grow);
        var depth = 0.68 + 0.32 * clamp(p.z, 0, 1);
        var s = ob.size * depth * grow * (1 - 0.8 * ob.ret * ob.ret);
        if (s < 0.25) { ob.node.setAttribute('opacity', '0'); continue; }
        ob.node.setAttribute('opacity', ((1 - ob.ret) * (0.55 + 0.45 * depth)).toFixed(3));
        ob.node.setAttribute('transform',
          'translate(' + p.x.toFixed(2) + ' ' + p.y.toFixed(2) + ')' +
          ' rotate(' + ob.rot.toFixed(1) + ')' +
          ' scale(' + s.toFixed(3) + ')');
      }

      /* 撒花推进：速度衰减 + 微重力 */
      for (var ci = pieces.length - 1; ci >= 0; ci--) {
        var pc = pieces[ci];
        pc.life += dt;
        if (pc.life >= pc.max) {
          pc.el.remove();
          pieces.splice(ci, 1);
          continue;
        }
        pc.x += pc.vx * dt;
        pc.y += pc.vy * dt;
        var drag = Math.pow(0.94, 60 * dt);
        pc.vx *= drag;
        pc.vy = pc.vy * drag + 40 * dt;
        pc.rot += pc.vr * dt;
        var u = pc.life / pc.max;
        var fd = u < 0.1 ? u / 0.1 : Math.pow(1 - (u - 0.1) / 0.9, 1.7);
        var sz = Math.max(pc.r * (1 - 0.4 * u), 0.4);
        pc.el.setAttribute('opacity', fd.toFixed(3));
        pc.el.setAttribute('transform',
          'translate(' + pc.x.toFixed(2) + ' ' + pc.y.toFixed(2) + ') rotate(' + pc.rot.toFixed(1) + ') scale(' + sz.toFixed(3) + ')');
      }

      /* 签名发射粒子推进 */
      for (var ei = emits.length - 1; ei >= 0; ei--) {
        var em = emits[ei];
        if (now < em.born) continue;
        em.life += dt;
        if (em.life >= em.max) {
          em.node.remove();
          emits.splice(ei, 1);
          continue;
        }
        em.step(em, dt, em.life / em.max, em.life);
      }
    }

    function destroy() {
      orbiters.forEach(function (o) { o.node.remove(); });
      pieces.forEach(function (p) { p.el.remove(); });
      emits.forEach(function (e) { e.node.remove(); });
      orbiters.length = 0;
      pieces.length = 0;
      emits.length = 0;
    }

    return { update: update, burst: burst, signature: signature, destroy: destroy,
      signatureMouth: skin.signatureMouth || null,
      signatureMouthMs: skin.signatureMouthMs || 0 };
  }

  createFx.registerSkin = function (name, def) { SKINS[name] = def; };
  createFx.skins = function () { return Object.keys(SKINS); };

  MM.createFx = createFx;
})();
