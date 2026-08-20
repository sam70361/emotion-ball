/* ============================================================
 * Twinkle 亮亮（教育）—— 圆角五角星
 *   概念定稿：assets/concepts/concept-twinkle.png 方案 A（蜂蜜金 + 金框眼镜）
 *   剪影：五角圆角星
 *   眼睛：瞳孔眼（白眼底 + 暖棕虹膜），配 autoFit 圆框眼镜 ——
 *        镜框按实际眼位自动求出，追随目光、眨眼下滑、镜片扫光
 *   签名动作：环身星星爆闪；思考轨道里混入一支旋转铅笔
 *   设计参数记录：docs/DESIGN-PROVENANCE.md
 * ============================================================ */
window.MoodMates.characters.register({
  id: 'twinkle',
  name: '亮亮',
  en: { name: 'Twinkle', desc: 'A honey-gold rounded star in tiny auto-fit glasses — the classroom cheerleader' },
  industry: 'general',
  desc: '蜂蜜金的圆角五角星，戴一副会追着眼睛走的小圆框眼镜，教育场景的元气小老师',

  body: { type: 'star', r: 1.02, points: 5, inner: 0.74, sharp: 0.5 },
  face: { x: 0, y: 6, sx: 0.82, sy: 0.82, eye: 0.85 },

  palette: {
    body: '#F5B93F',
    eye: '#4A3316',
    blush: '#F0966E',
    mouth: '#6B4A2E',
    zzz: '#D9A85F',
    gloss: 0.3,
    states: {
      base: '#F5B93F',
      dim: '#D6A139',
      soft: '#F8CC66',
      blush: '#F2AE7E',
      angry: '#E8734F',
      alert: '#E25B5B',
      off: '#C2A265'
    }
  },

  eyeStyle: {
    dx: 27, cy: 102, w: 26, h: 34,
    taper: 0.38, tilt: 0, bend: 0,
    pupil: {
      irisR: 10, pupilR: 4.8,
      irisColor: '#7A4E2A',
      socket: '#FFFFFF',
      highlights: [
        { dx: -3.2, dy: -3.8, r: 3 },
        { dx: 3.8, dy: 2.4, r: 1.3, opacity: 0.6 }
      ]
    }
  },

  features: {
    mouth: { w: 24, dy: 34 },
    blush: { dx: 40, dy: 24, rx: 10, ry: 6, max: 0.85 },
    /* 不配眉毛：瞳孔眼 + 眼镜的信息量已足，情绪由眼睑开合 / 视线 / 嘴形表达 */
    accessories: [
      /* autoFit 圆框眼镜：镜框位置 / 半径由角色眼位眼形自动求出 */
      { kind: 'glasses', color: '#C9973F', fit: 1.3, strokeWidth: 2.6, glintPeriod: 5200 }
    ]
  },

  fxSkin: 'stardust',

  /* 小老师看到你做对了会更兴奋 */
  emotions: {
    '33': { body: { spinFx: 1, confetti: 1 } }
  }
});
