/* ============================================================
 * i18n.js —— 界面文案字典（纯数据 + 取词函数，默认中文）
 *   EB_I18N.t(key, params)  按当前语言取词，{x} 占位符插值
 *   EB_I18N.lang            当前语言 'zh' | 'en'
 *   EB_I18N.set(lang)       切换语言（仅更新字典指针，DOM 刷新由交互层负责）
 * ============================================================ */
window.EB_I18N = (function () {
  'use strict';

  var STRINGS = {
    zh: {
      docTitle: 'Emotion Ball 表情馆',
      brandName: '表情馆',
      navWall: '陈列墙',
      navAlbum: '画册',
      langBtn: 'EN',
      themeToDark: '切换暗黑模式',
      themeToLight: '切换明亮模式',
      settingsBtn: '设置',

      heroEyebrow: 'EMOTION GALLERY',
      heroTitle: '一颗会表达情绪的小球',
      heroSub: '32 种状态表情 · SVG 实时驱动 · 一个 emotionId 即可接入 AI',
      heroCta: '进入展馆',
      heroHint: '移动鼠标它会注视你 · 点击它甩一圈彩带',

      tabAll: '全部',
      galleryHint: '点击缩略图切换 · 悬停预览动画 · ← / → 键翻页',
      babiesLabel: '团队小球',
      babyClick: '点击让主球切到此状态',
      prevEmotion: '上一个表情',
      nextEmotion: '下一个表情',
      stageClose: '关闭预览',
      stageLabel: '表情主舞台',
      thumbSuffix: '缩略预览',

      drawerTitle: '设置',
      drawerClose: '关闭设置',
      secAppearance: '外观',
      lblShape: '身体形状',
      shapeBlob: '圆胖',
      shapeWedge: '三角',
      shapeGem: '菱形',
      lblSketch: '线稿模式',
      secDemo: '演示',
      lblTour: '自动播放',
      lblInterval: '播放间隔',
      secAI: 'AI 对接模拟',
      aiPlaceholder: '{"emotionId":"30","tips":"正在思考"}',
      btnSend: '下发',
      btnSampleErr: '示例:出错',
      btnSampleBad: '示例:未知 ID',
      secConfig: '配置',
      btnExport: '导出配置',
      btnImport: '导入配置',

      toastTourOn: '自动播放已开启:「{name}」共 {n} 个表情',
      toastTourOff: '自动播放已关闭',
      toastSketchOn: '已切换为线稿模式(仅轮廓描边)',
      toastSketchOff: '已切回实体填充',
      toastShape: '已切换身体形状:{name}',
      toastAiSent: 'AI 消息已下发',
      toastExported: '已导出 {n} 个表情配置',
      toastImportOk: '导入成功:{n} 个表情配置',
      toastImportFail: '导入完成 {n} 个,失败:{err}',
      toastThemeDark: '已切换到暗黑模式',
      toastThemeLight: '已切换到明亮模式',

      legalNote: '本站球形角色仅供个人技术学习与研究,禁止任何商业用途。'
    },

    en: {
      docTitle: 'Emotion Ball Gallery',
      brandName: 'Emotion Ball',
      navWall: 'Wall',
      navAlbum: 'Album',
      langBtn: '中',
      themeToDark: 'Switch to dark mode',
      themeToLight: 'Switch to light mode',
      settingsBtn: 'Settings',

      heroEyebrow: 'EMOTION GALLERY',
      heroTitle: 'A little bot that wears its feelings',
      heroSub: '32 expressive states · Real-time SVG · Hook up your AI with a single emotionId',
      heroCta: 'Enter the gallery',
      heroHint: 'Move your mouse and it watches · Click for a ribbon spin',

      tabAll: 'All',
      galleryHint: 'Click a thumbnail to switch · Hover to preview · ← / → to flip',
      babiesLabel: 'Team bots',
      babyClick: 'click to switch the main bot',
      prevEmotion: 'Previous emotion',
      nextEmotion: 'Next emotion',
      stageClose: 'Close preview',
      stageLabel: 'Main emotion stage',
      thumbSuffix: 'thumbnail preview',

      drawerTitle: 'Settings',
      drawerClose: 'Close settings',
      secAppearance: 'Appearance',
      lblShape: 'Body shape',
      shapeBlob: 'Blob',
      shapeWedge: 'Wedge',
      shapeGem: 'Gem',
      lblSketch: 'Sketch mode',
      secDemo: 'Showcase',
      lblTour: 'Autoplay',
      lblInterval: 'Interval',
      secAI: 'AI simulation',
      aiPlaceholder: '{"emotionId":"30","tips":"thinking"}',
      btnSend: 'Send',
      btnSampleErr: 'Sample: error',
      btnSampleBad: 'Sample: unknown ID',
      secConfig: 'Config',
      btnExport: 'Export',
      btnImport: 'Import',

      toastTourOn: 'Autoplay on: {n} emotions in "{name}"',
      toastTourOff: 'Autoplay off',
      toastSketchOn: 'Sketch mode on (outline only)',
      toastSketchOff: 'Back to solid fill',
      toastShape: 'Body shape switched to {name}',
      toastAiSent: 'AI message dispatched',
      toastExported: 'Exported {n} emotion configs',
      toastImportOk: 'Imported {n} emotion configs',
      toastImportFail: 'Imported {n}, failed: {err}',
      toastThemeDark: 'Dark mode on',
      toastThemeLight: 'Light mode on',

      legalNote: 'The ball characters on this site are for personal technical study and research only. Any commercial use is prohibited.'
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
