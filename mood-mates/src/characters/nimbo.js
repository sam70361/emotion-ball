/* ============================================================
 * Nimbo 云宝（通用）—— 蓬松云朵
 *   概念定稿：assets/concepts/concept-nimbo.png 方案 A（雾蓝薰衣草）
 *   剪影：七瓣扇贝波浪边，底部收平像坐在地上的云
 *   气质：慢半拍的松弛系伙伴，适合陪伴 / 冥想 / 天气类场景
 *   签名动作：嘴巴收口吸进彩色光点，再吐出一道六色拱虹
 *   设计参数记录：docs/DESIGN-PROVENANCE.md
 * ============================================================ */
window.MoodMates.characters.register({
  id: 'nimbo',
  name: '云宝',
  en: { name: 'Nimbo', desc: 'A puffy scallop-edged cloud that drifts half a beat behind the world and blooms a ring of fluffy baby clouds when pleased' },
  industry: 'general',
  desc: '雾蓝薰衣草色的蓬松云朵，波浪扇贝边，高兴时身边会噗噗绽开一圈小云絮',

  body: { type: 'cloud', r: 0.94, lobes: 7, amp: 0.08, flat: 0.12 },
  face: { x: 0, y: 2, sx: 1, sy: 1, eye: 1 },

  palette: {
    body: '#B4C6EE',
    eye: '#2B3550',
    eyeHighlight: '#FFFFFF',
    blush: '#EFA9B8',
    zzz: '#9FB3D6',
    gloss: 0.2,
    states: {
      base: '#B4C6EE',
      dim: '#95A5CC',
      soft: '#C6D6F5',
      blush: '#E3B8D8',
      angry: '#D96B70',
      alert: '#E25B5B',
      off: '#9AA6C0'
    }
  },

  eyeStyle: {
    dx: 29, cy: 104, w: 26, h: 30,
    taper: 0.55, tilt: -2, bend: 0.1,
    highlight: { dx: 3.5, dy: -6, r: 3.2 }
  },

  features: {
    mouth: { w: 23, dy: 32 },
    blush: { dx: 41, dy: 20, rx: 12, ry: 7, max: 0.8 }
  },

  fxSkin: 'cloudpuff',

  /* 云朵的性子更慢：待机轮换与呼吸都放缓 */
  emotions: {
    '02': { poolMs: [12000, 20000], anims: [
      { target: 'eyes', prop: 'lookX', type: 'glance', amp: 8, period: 6400 },
      { target: 'eyes', prop: 'lookY', type: 'sine', amp: 2, period: 5200, phase: 1.1 }
    ] },
    '10': { anims: [
      { target: 'eyes', prop: 'lookY', type: 'glance', amp: 5, period: 3800 },
      { target: 'body', prop: 'y', type: 'sine', amp: 1.8, period: 2000 }
    ] }
  }
});
