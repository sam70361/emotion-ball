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
      docTitle: 'Mood Mates 角色馆',
      brandName: 'Mood Mates',
      navWall: '陈列墙',
      navAlbum: '画册',
      langBtn: 'EN',
      themeToDark: '切换暗黑模式',
      themeToLight: '切换明亮模式',
      settingsBtn: '设置',

      heroEyebrow: 'MOOD MATES',
      heroTitle: '一整队会表达情绪的原创伙伴',
      heroSub: '2 个原创角色 × 32 种状态表情 · SVG 实时驱动 · 一个 emotionId 即可接入 AI',
      heroCta: '进入角色馆',
      heroHint: '移动鼠标它会注视你 · 点击它看它的招牌动作',

      tabAll: '全部',
      galleryHint: '点击角色卡切换角色 · 点击缩略图切换表情 · ← / → 键翻页',
      prevEmotion: '上一个表情',
      nextEmotion: '下一个表情',
      stageClose: '关闭预览',
      stageLabel: '表情主舞台',
      thumbSuffix: '缩略预览',
      castClick: '点击切换到该角色',

      industry_general: '通用',

      drawerTitle: '设置',
      drawerClose: '关闭设置',
      secAppearance: '外观',
      lblCharacter: '当前角色',
      lblVariant: '身体轮廓',
      variantDefault: '默认',
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

      footNote: 'Mood Mates 全部角色均为原创设计。个人学习免费使用;商业使用请查看仓库内 LICENSE-COMMERCIAL.md 获取授权。',

      toastTourOn: '自动播放已开启:「{name}」共 {n} 个表情',
      toastTourOff: '自动播放已关闭',
      toastSketchOn: '已切换为线稿模式(仅轮廓描边)',
      toastSketchOff: '已切回实体填充',
      toastCharacter: '已切换角色:{name}',
      toastVariant: '已切换身体轮廓:{name}',
      toastAiSent: 'AI 消息已下发',
      toastExported: '已导出 {n} 个表情配置',
      toastImportOk: '导入成功:{n} 个表情配置',
      toastImportFail: '导入完成 {n} 个,失败:{err}',
      toastThemeDark: '已切换到暗黑模式',
      toastThemeLight: '已切换到明亮模式'
    },

    en: {
      docTitle: 'Mood Mates Gallery',
      brandName: 'Mood Mates',
      navWall: 'Wall',
      navAlbum: 'Album',
      langBtn: '中',
      themeToDark: 'Switch to dark mode',
      themeToLight: 'Switch to light mode',
      settingsBtn: 'Settings',

      heroEyebrow: 'MOOD MATES',
      heroTitle: 'An original cast that wears its feelings',
      heroSub: '2 original characters × 32 expressive states · Real-time SVG · Hook up your AI with a single emotionId',
      heroCta: 'Enter the gallery',
      heroHint: 'Move your mouse and it watches · Click for its signature move',

      tabAll: 'All',
      galleryHint: 'Click a cast card to switch characters · Click a thumbnail to switch emotions · ← / → to flip',
      prevEmotion: 'Previous emotion',
      nextEmotion: 'Next emotion',
      stageClose: 'Close preview',
      stageLabel: 'Main emotion stage',
      thumbSuffix: 'thumbnail preview',
      castClick: 'click to switch to this character',

      industry_general: 'General',

      drawerTitle: 'Settings',
      drawerClose: 'Close settings',
      secAppearance: 'Appearance',
      lblCharacter: 'Character',
      lblVariant: 'Body outline',
      variantDefault: 'Default',
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

      footNote: 'All Mood Mates characters are original designs. Free for personal learning; for commercial use see LICENSE-COMMERCIAL.md in the repository.',

      toastTourOn: 'Autoplay on: {n} emotions in "{name}"',
      toastTourOff: 'Autoplay off',
      toastSketchOn: 'Sketch mode on (outline only)',
      toastSketchOff: 'Back to solid fill',
      toastCharacter: 'Switched to {name}',
      toastVariant: 'Body outline switched: {name}',
      toastAiSent: 'AI message dispatched',
      toastExported: 'Exported {n} emotion configs',
      toastImportOk: 'Imported {n} emotion configs',
      toastImportFail: 'Imported {n}, failed: {err}',
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
