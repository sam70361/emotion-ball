# 集成指南 · Integration Guide

Mood Mates 是零依赖、无构建的纯 SVG + 原生 JavaScript 表情引擎。宿主只需要按顺序加载脚本并调用 `MoodMates.create`。

## 快速接入

```html
<!-- 引擎(顺序固定):几何 → 渲染 → 五官 → 特效 → 表情数据 → 驱动 -->
<script src="src/core/geometry.js"></script>
<script src="src/core/render.js"></script>
<script src="src/core/features.js"></script>
<script src="src/core/fx.js"></script>
<script src="src/data/emotions.js"></script>
<script src="src/core/engine.js"></script>
<!-- 按需加载角色(至少一个) -->
<script src="src/characters/nimbo.js"></script>

<div id="mate" style="width:200px;height:200px"></div>
<script>
  var mate = MoodMates.create(document.getElementById('mate'), {
    character: 'nimbo',
    emotion: '02',
    idle: true
  });
</script>
```

`site/i18n.js` 与 `site/app.js` 属于展示站外壳，宿主不需要。

## AI 协议

AI 只需输出一段 JSON 交给 `handleAIMessage`（对象或字符串均可）：

```js
mate.handleAIMessage('{"emotionId":"30","tips":"正在思考用户问题"}');
```

- 未知 `emotionId`、JSON 解析失败、缺字段：触发 `error` 事件并回退待机（`fallbackId`，默认 `'02'`），永不白屏；
- `tips` 为可选展示文案，通过 `tips` 事件交给宿主自行渲染。

### emotionId 分段规则（对外契约，编号永不重排）

| 区间 | 分组 | 常用 |
| --- | --- | --- |
| 00-09 | 生命周期 | 00 睡眠 · 01 唤醒 · 02 待机 · 03 好奇 |
| 10-29 | 情绪反应 | 10 开心 · 13 惊讶 · 14 害羞 · 21 生气 |
| 30-49 | 代理工作状态 | 30 思考 · 33 完成 · 34 出错 · 38 拒绝 · 40 检索 |
| 50+ | 自定义 | 运行时注册 |

## 创建参数

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `character` | 首个注册的角色 | 角色 ID:`nimbo` / `twinkle` |
| `emotion` | `'02'` | 初始表情 ID |
| `color` / `eyeColor` | — | 主题实例体色 / 眼色(团队多实例用) |
| `eyeScale` | `1` | 眼睛放大;80px 以下建议 1.5~1.8 |
| `idle` | `false` | 待机策略:超时自动待机 / 睡眠;传对象可自定义时长与目标状态 |
| `autostart` | `true` | `false` 只渲染一帧静态(缩略图用) |
| `lite` | 跟随 `autostart` | 精简模式:关闭特效粒子与 zzz |
| `fallbackId` | `'02'` | 未知 ID 的回退表情 |

## 事件与方法

```js
mate.on('change', e => {});         // 表情已切换 { id, def, auto }
mate.on('tips',   e => {});         // AI 附带文案 { text }
mate.on('error',  e => {});         // 协议错误 { message, ... }

mate.setEmotion('21');              // 直接切换
mate.setGaze(nx, ny);               // 归一化注视 [-1,1];宿主监听 pointermove
mate.setStyle({ sketch: 1 });       // 线稿模式
mate.signature();                   // 角色签名动作(云宝云絮绽放 / 亮亮星星爆闪)
                                    // 返回 false 表示该角色皮肤无签名动作
mate.spin(3);                       // 自旋并甩出特效粒子(通用)
mate.burst(24);                     // 撒花
mate.bounce();                      // 弹跳
mate.startTour(ids, 2500);          // 自动巡演 / mate.stopTour()
mate.setActive(false);              // 离屏停帧省电;true 恢复
mate.renderStatic();                // 停帧时渲染一帧
mate.registerEmotion(raw);          // 运行时注册自定义表情(50+ 段)
mate.destroy();                     // 销毁实例
```

## 多实例与性能

- 所有实例共享一个 rAF 心跳，实例数量不会放大循环开销；
- 缩略图墙：`autostart: false` 静态渲染，hover 时 `setActive(true)`、离开 `setActive(false)`；
- 搭配 IntersectionObserver 对离屏实例 `setActive(false)`。

## 桌宠 / Electron

- 窗口参数：`transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true`，页面背景透明只留角色容器；
- 点击穿透：`win.setIgnoreMouseEvents(true, { forwardMouseMove: true })` —— 角色仍可 `setGaze`，点击穿透到桌面；
- IPC 转发 AI 消息：`ipcRenderer.on('emotion', (_, msg) => mate.handleAIMessage(msg))`；
- 小窗（≤ 120px）建议 `eyeScale: 1.5` + `lite: true`。

## 自定义表情

```js
MoodMates.config.register({
  id: '50', name: '打招呼', group: 'custom',
  pool: ['happy', 'wide'],        // 眼形语义槽位(所有角色通用)
  mouth: 'grin',                  // 嘴形槽位
  body: { color: '@soft' },       // 颜色用 @token,自动适配各角色色板
  anims: [ { target: 'body', prop: 'rotate', type: 'sine', amp: 6, period: 900 } ]
});
```

配置格式详见 `src/data/emotions.js` 头部注释；导入导出用 `MoodMates.config.exportConfig()` / `importConfig(json)`。
