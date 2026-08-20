<div align="center">

# Mood Mates · 原创角色表情引擎

**2 个原创卡通角色 × 32 种状态表情，纯 SVG + 原生 JavaScript 实时驱动，零框架、零图片资源。**

[English](README.en.md)

</div>

---

Mood Mates 是一套面向 AI 助手、智能客服与桌面宠物的角色表情引擎。每个角色都有独立的剪影、眼形、嘴形、配色与特效皮肤，共享同一套 32 种状态的表情编排；AI 只需输出一个 `emotionId`，角色即可实时演出对应情绪。

## 角色阵容

| 角色 | 定位 | 剪影 | 眼睛 | 签名动作 |
| --- | --- | --- | --- | --- |
| **云宝 Nimbo** | 通用（默认） | 云朵 | 豆眼 | 云絮绽放 |
| **亮亮 Twinkle** | 通用 | 圆角五角星 | 瞳孔眼 + 眼镜 | 星星爆闪 · 思考铅笔轨道 |

所有视觉资产均由参数化几何函数实时生成（`src/core/geometry.js`），设计过程与参数记录见 [docs/DESIGN-PROVENANCE.md](docs/DESIGN-PROVENANCE.md)。

## 特性

- **零依赖、无构建**：script 标签直引即用，全部渲染基于 SVG；
- **高端质感渲染**：多停靠体积渐变 + 釉面高光 + 底部环境光遮蔽 + 地面软投影（随弹跳收缩）；
- **物理正确的眼睛**：瞳孔眼采用眼睑 clipPath 分层（眼白 / 虹膜 / 瞳孔 / 定光源高光），闭眼、眨眼、眯笑时自动切换深色睫线，瞳孔绝不会悬浮在闭眼之外；注视时瞳孔在眼眶内额外滑动，形成真实眼球转动感；
- **配饰联动**：眼镜按实际眼位自动适配（autoFit），追随目光、眨眼下滑回弹、镜片周期扫光；
- **角色签名动作**：庆祝与待机小动作不是千篇一律的转圈——云宝身边绽开一圈小云絮、亮亮星星爆闪，各有各的风格；舞台点击触发「签名动作 + 随机肢体动作 + 撒花」的庆祝组合；
- **角色即数据**：一个角色 = 一个纯数据文件，复制改参数即得新角色，引擎代码零改动；
- **语义槽位 + 专属轮廓组**：表情基座用眼形 / 嘴形语义槽位编写；角色可通过 `eyeShapes` / `mouthShapes` 为任意表情定义专属轮廓；
- **AI 协议**：`handleAIMessage({ emotionId, tips })` 一行接入，未知 ID 自动兜底待机，永不白屏；
- **表情体系**：`00-09` 生命周期 / `10-29` 情绪 / `30-49` 代理工作状态 / `50+` 运行时自定义；
- **工程配套**：待机策略、多实例共享心跳、离屏停帧、缩略图静态渲染、线稿模式、双语展示站。

## 快速开始

```html
<script src="src/core/geometry.js"></script>
<script src="src/core/render.js"></script>
<script src="src/core/features.js"></script>
<script src="src/core/fx.js"></script>
<script src="src/data/emotions.js"></script>
<script src="src/core/engine.js"></script>
<script src="src/characters/nimbo.js"></script>

<div id="mate" style="width:200px;height:200px"></div>
<script>
  var mate = MoodMates.create(document.getElementById('mate'), {
    character: 'nimbo', emotion: '02', idle: true
  });
  mate.handleAIMessage('{"emotionId":"10","tips":"任务完成啦"}');
</script>
```

本地预览展示站：仓库根目录起任意静态服务器（如 `python -m http.server`），打开 `index.html` 即可浏览角色画廊与表情墙。

## 文档

- [集成指南](docs/INTEGRATION.md) —— SDK 选项、AI 协议、事件方法、多实例性能、Electron 桌宠接入
- [角色设计规范](docs/CHARACTER-DESIGN.md) —— 从零创造新角色的完整指南（身体生成器 / 眼型 / 色板 / 五官 / 配饰）
- [设计过程记录](docs/DESIGN-PROVENANCE.md) —— 全部视觉资产的原创证据链
- `tools/ring-editor.html` —— 参数化轮廓编辑器，可视化调参并导出角色数据

## 目录结构

```
mood-mates/
├── index.html               # 展示馆(角色画廊 + 表情墙)
├── src/
│   ├── core/                # 引擎:geometry / render / features / fx / engine
│   ├── data/emotions.js     # 32 表情基座(纯数据,全角色共享)
│   └── characters/          # 每角色一个自包含数据文件
├── site/                    # 展示站外壳(css / app / i18n)
├── tools/ring-editor.html   # 轮廓环编辑器
└── docs/                    # 设计规范 / 集成指南 / 原创证据链
```

## 许可

双许可模式：

- **社区许可**（[LICENSE](LICENSE)）：个人学习、研究、非商业项目免费使用；
- **商业许可**（[LICENSE-COMMERCIAL.md](LICENSE-COMMERCIAL.md)）：商业产品、SaaS、客户交付等商业场景请获取商业授权。

Mood Mates 全部角色形象为独立原创设计，版权所有。
