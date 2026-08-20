/* ============================================================
 * i18n.js —— 界面文案字典（纯数据 + 取词函数，默认中文）
 *   MM_I18N.t(key, params)  按当前语言取词，{x} 占位符插值
 *   MM_I18N.lang            当前语言 'zh' | 'en'
 *   MM_I18N.set(lang)       切换语言（仅更新字典指针，DOM 刷新由交互层负责）
 * ============================================================ */
window.MM_I18N = (function () {
  'use strict';

  var STRINGS = {
    zh: {
      docTitle: 'Emotion Gallery 表情总馆',
      brandName: 'Emotion Gallery',
      navWall: '陈列墙',
      navAlbum: '画册',
      langBtn: 'EN',
      themeToDark: '切换暗黑模式',
      themeToLight: '切换明亮模式',

      heroTitle: '三个会表达情绪的伙伴,同台开演',
      heroSub: '球球 × 云宝 × 亮亮 · 32 种状态表情 · SVG 实时驱动',
      heroCta: '进入总馆',

      tabAll: '全部',
      galleryHint: '点击缩略图切换表情 · ← / → 翻页',
      prevEmotion: '上一个表情',
      nextEmotion: '下一个表情',
      stageClose: '关闭预览',
      stageLabel: '表情主舞台',
      thumbSuffix: '缩略预览',
      castClick: '点击切换到该角色',

      industry_general: '通用',
      industry_learn: '仅供学习',

      lblGroup: '分组',
      lblVariant: '形状',
      lblSketch: '线稿',
      lblTour: '自动播放',
      lblInterval: '间隔',

      footNote: '云宝与亮亮为原创角色,双许可(个人学习免费,商业授权见 mood-mates/LICENSE-COMMERCIAL.md);球球仅供学习研究,禁止任何商业用途。',
      footLinkMates: 'Mood Mates 子站',
      footLinkBall: 'Emotion Ball 子站',

      toastTourOn: '自动播放已开启:「{name}」共 {n} 个表情',
      toastTourOff: '自动播放已关闭',
      toastSketchOn: '已切换为线稿模式(仅轮廓描边)',
      toastSketchOff: '已切回实体填充',
      toastCharacter: '已切换角色:{name}',
      toastVariant: '已切换形状:{name}',
      toastThemeDark: '已切换到暗黑模式',
      toastThemeLight: '已切换到明亮模式'
    },

    en: {
      docTitle: 'Emotion Gallery',
      brandName: 'Emotion Gallery',
      navWall: 'Wall',
      navAlbum: 'Album',
      langBtn: '中',
      themeToDark: 'Switch to dark mode',
      themeToLight: 'Switch to light mode',

      heroTitle: 'Three expressive pals, one shared stage',
      heroSub: 'Ball × Nimbo × Twinkle · 32 expressive states · Real-time SVG',
      heroCta: 'Enter the gallery',

      tabAll: 'All',
      galleryHint: 'Click a thumbnail · ← / → to flip',
      prevEmotion: 'Previous emotion',
      nextEmotion: 'Next emotion',
      stageClose: 'Close preview',
      stageLabel: 'Main emotion stage',
      thumbSuffix: 'thumbnail preview',
      castClick: 'click to switch to this character',

      industry_general: 'General',
      industry_learn: 'Learning only',

      lblGroup: 'Group',
      lblVariant: 'Shape',
      lblSketch: 'Sketch',
      lblTour: 'Autoplay',
      lblInterval: 'Interval',

      footNote: 'Nimbo & Twinkle are original, dual-licensed characters (free for personal learning; commercial licensing via mood-mates/LICENSE-COMMERCIAL.md). Ball is for learning & research only — no commercial use.',
      footLinkMates: 'Mood Mates site',
      footLinkBall: 'Emotion Ball site',

      toastTourOn: 'Autoplay on: {n} emotions in "{name}"',
      toastTourOff: 'Autoplay off',
      toastSketchOn: 'Sketch mode on (outline only)',
      toastSketchOff: 'Back to solid fill',
      toastCharacter: 'Switched to {name}',
      toastVariant: 'Shape switched: {name}',
      toastThemeDark: 'Dark mode on',
      toastThemeLight: 'Light mode on'
    }
  };

  var api = {
    lang: 'zh',
    set: function (lang) {
      api.lang = STRINGS[lang] ? lang : 'zh';
      return api.lang;
    },
    t: function (key, params) {
      var s = (STRINGS[api.lang] && STRINGS[api.lang][key]) || STRINGS.zh[key] || key;
      if (params) {
        for (var k in params) s = s.split('{' + k + '}').join(String(params[k]));
      }
      return s;
    }
  };
  return api;
})();
