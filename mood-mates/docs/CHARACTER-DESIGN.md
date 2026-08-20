# 角色设计规范 · Character Design Guide

> 从零创造一个新的 Mood Mates 角色的完整指南。一个角色 = 一个自包含的纯数据文件，不需要改动任何引擎代码。

## 一、角色数据包 Schema

```js
window.MoodMates.characters.register({
  id: 'puffy',                     // 唯一 ID(小写字母)
  name: '泡芙',                    // 中文名
  en: { name: 'Puffy', desc: '...' },
  industry: 'general',             // general / 自定义(站点文案补 industry_<key> 即可)
  desc: '角色一句话介绍',

  /* 1. 身体剪影:参数化生成器描述符(见下文"身体生成器") */
  body: { type: 'puff', r: 0.96, waves: [{ k: 6, amp: 0.05 }] },

  /* 2. 面部拟合:五官整体在剪影上的偏移与缩放 */
  face: { x: 0, y: 6, sx: 1, sy: 0.96, eye: 1 },
  //  x/y 平移;sx/sy 眼位横纵缩放;eye 眼睛尺寸系数

  /* 3. 色板:body 主体色 + states 语义状态色(表情数据用 @token 引用) */
  palette: {
    body: '#8AD6C8',
    eye: '#25333B',                // 眼睛颜色(@eye)
    eyeHighlight: '#FFFFFF',
    blush: '#F0A8A8',              // 腮红
    mouth: '#31424B',              // 嘴巴(缺省用 eye 色)
    zzz: '#8FB5AC',                // 睡眠字母粒子
    fx: ['#7FD8CE', '#9BC7F0'],    // 可选:覆盖特效皮肤默认配色
    states: {
      base: '#8AD6C8',             // @base 常态
      dim: '#7CB4A9',              // @dim  低落/睡眠
      soft: '#98E0D2',             // @soft 柔和/开心
      blush: '#EFB9BC',            // @blush 泛红
      angry: '#E5705F',            // @angry 涨红
      alert: '#E25B5B',            // @alert 出错警示
      off: '#93AFA8'               // @off  停止
    }
  },

  /* 4. 眼型基调:决定 20 个语义眼形槽位的"长相" */
  eyeStyle: {
    dx: 30,       // 眼心到面部中线距离
    cy: 102,      // 眼心纵坐标(头部中心 120)
    w: 25, h: 33, // 眼宽 / 眼高
    taper: 0.42,  // 端部收尖:0.3 圆角矩形感 ~ 1.2 两端极尖
    tilt: 0,      // 整体倾角(度,正值外高内低)
    bend: 0.02,   // 中轴弯曲(正值上拱)
    highlight: { dx: 4, dy: -7, r: 3.2 },  // 豆眼高光点,null 关闭

    /* 可选:瞳孔眼(填了 pupil 即从豆眼切换为分层眼球)。
     * 眼睑 lens 环变成 clipPath,内部分层渲染眼白/虹膜/瞳孔/高光:
     * - 闭眼/眨眼/眯笑时自动切换为深色睫线,瞳孔绝不会露在闭眼之外
     * - 注视时瞳孔在眼眶内额外滑动(比眼睑多走 50%)
     * - 高光位置固定(光源方位不变),不随眼球转动 */
    pupil: {
      irisR: 11,               // 虹膜半径
      pupilR: 5.2,             // 瞳孔半径
      irisColor: '#23424E',    // 虹膜色(径向渐变自动生成)
      socket: '#FFFFFF',       // 眼白色
      highlights: [            // 定光源高光(可多枚,dx 左右眼自动镜像)
        { dx: -3.6, dy: -4.4, r: 3.4 },
        { dx: 4.2, dy: 2.8, r: 1.5, opacity: 0.65 }
      ]
    }
  },

  /* 4b. 专属轮廓组(可选):为特定表情定义超越 20 个语义槽位的自定义轮廓。
   * eyeShapes 用原始 lens 参数(w/h/bend/slope/taper/shift/tilt),
   * mouthShapes 用原始 mouthLens 参数(w/h/bend/taper);
   * 之后即可在表情覆盖里用名字引用 */
  eyeShapes: {
    delight: { w: 28, h: 15, bend: 0.7, taper: 1.3 }
  },
  mouthShapes: {
    bigGrin: { w: 20, h: 9, bend: -0.35, taper: 0.5 }
  },

  /* 5. 五官配置 */
  features: {
    mouth: { w: 25, dy: 33 },                       // 嘴宽 / 纵向位置;false 关闭
    blush: { dx: 42, dy: 22, rx: 11, ry: 6.5, max: 0.85 },  // 腮红;true 用默认;false 关闭
    brows: { w: 15, h: 3.2, dx: 30, dyTop: -26, always: false },  // 眉毛;false 关闭
    /* 配饰联动组件(见"四、配饰联动系统") */
    accessories: [
      { kind: 'glasses', color: '#C9973F', fit: 1.3 },
      { kind: 'path', layer: 'back', d: 'M...', fill: '...', micro: { type: 'float', amp: 1.6, period: 3000 } }
    ]
  },

  /* 6. 特效皮肤(含签名动作):
   * cloudpuff 云絮·身体四周噗噗绽开一圈小云朵 / stardust 星尘·星星爆闪+思考铅笔轨道。
   * 皮肤可设 signatureMouth：签名触发时嘴形临时覆盖，到期弹回当前表情嘴形 */
  fxSkin: 'cloudpuff',

  /* 7. 表情覆盖(可选):按表情 ID 浅合并覆盖共享基座;
   * pool / mouth 可引用 4b 定义的专属轮廓名 */
  emotions: {
    '02': { antics: false, poolMs: [14000, 22000] },
    '21': { pool: ['delight'] },
    '33': { body: { spinFx: 0, confetti: 0.8 }, mouth: 'bigGrin' }
  }
});
```

## 二、身体生成器

全部生成器位于 `src/core/geometry.js`，输出 96 点闭合环。用 `tools/ring-editor.html` 可视化调参后把描述符复制进角色文件。

| type | 剪影 | 关键参数 |
| --- | --- | --- |
| `cloud` | 扇贝云 | `lobes` 瓣数、`amp` 波幅、`flat` 底部收平 |
| `star` | 圆角星 | `points` 角数、`inner` 内径比、`sharp` 尖锐度 |
| `puff` | 谐波扰动圆 | `waves: [{k, amp, phase}]`(自由基元,二创起点) |

**出画检查**：viewBox 是 0 0 240 240，头部中心 120、基准半径 104。`r × 104 × (1 + 最大隆起)` 不要超过 118，否则剪影顶部会出画。

## 三、眼形语义槽位

表情基座通过槽位名引用眼形，每个角色用自己的 `eyeStyle` 实例化。20 个槽位：

- 平静：`calm` `calm2`
- 笑眼：`happy` `happy2`
- 圆睁：`wide` `wide2`
- 闭合：`closed` `closed2` `sleepy`
- 斜眼：`squint` `squint2`
- 怒目：`angry` `angry2`
- 扫读：`scan` `scan2` `scan3`
- 聆听：`listen` `listen2`
- 羞怯：`shy` · 哀伤：`sad`

嘴形槽位 9 个：`smile` `grin` `o` `flat` `frown` `wavy` `pout` `open` `dot`。

角色气质主要靠 `eyeStyle` 四个参数拉开：`taper`（圆润 ↔ 锐利）、`tilt`（无辜 ↔ 精明）、`bend`（平直 ↔ 弯月）、`w/h` 比例（机敏 ↔ 呆萌）。

## 四、配饰联动系统

配饰不是静态贴图，而是带锚点绑定与微动效的联动组件（`src/core/features.js`）：

| kind | 说明 | 联动行为 |
| --- | --- | --- |
| `glasses` | 圆框眼镜 | **autoFit**：镜框圆心 / 半径由角色实际眼位眼形自动求出（`fit` 缩放系数）；追随目光 75%（眼球在镜片内滑动形成视差）；眨眼时镜框下滑回弹；镜片周期扫光（`glintPeriod`） |
| `path` | 自定义 path | `anchor: 'face'` 贴脸投影 / `'abs'` 身体坐标；`micro: { type: 'float' | 'swing', amp, period }` 微动效 |

所有配饰均写在身体坐标系（240 × 240，中心 120）里，跟随身体呼吸 / 倾斜 / 弹跳；`layer: 'back'` 渲染在身体之后（提手、翅膀），`layer: 'front'` 渲染在五官之上（眼镜、徽章）。

眼睛实际位置参考：x = 120 ± eyeStyle.dx × face.sx，y = 120 + face.y + (eyeStyle.cy − 120) × face.sy。

## 四b、物理正确性守则

引擎已内建以下守则，设计新角色 / 新表情时请勿破坏：

1. **闭眼不见瞳孔**：瞳孔眼的闭合感由轮廓实际厚度（鞋带面积 ÷ 宽度）× 开合度判定。`effOpen < 0.26` 自动切换深色睫线；`0.26~0.45` 为小眼模式（瞳孔与虹膜按开合度等比缩小、仅隐藏白色高光，最深色的瞳点始终可见）。自定义 `eyeShapes` 若表达"闭眼 / 眯笑"，把厚度做薄即可自动获得睫线效果；
2. **五官同向联动**：眼球注视时，瞳孔多走 50%、眉毛跟 80%、眼镜跟 75%、嘴巴跟 35%、腮红跟 25%——层次差形成立体感，新配饰请沿用此梯度；
3. **闭眼连锁**：眨眼 / 闭眼时眉毛放松下垂、眼镜下滑回弹；豆眼高光按**有效可见高度**（bbox 高与轮廓厚度取小 × open × scaleY，约低于 18px）隐藏，不再只用 `open<0.35`；
4. **高光 / 瞳孔不出眶**：豆眼高光偏移按当前眼环 bbox 相对默认 bbox 缩放，并钳制点心距边缘 ≥ 半径；瞳孔圆心钳制在当前眼环 bbox 收缩 `pupilR` 的范围内（虹膜约束更松），防止注视时被眼睑裁成月牙；
5. **绕背隐藏**：所有贴脸五官配饰共享同一套经度投影，自旋到背面自动隐藏。

## 五、性格 = 数据

不改代码，用表情覆盖表达性格：

- **沉稳**（金融）：`antics: false`、`poolMs` 拉长、动画 `amp` 减半、`period` 加长；
- **躁动**（游戏）：`poolMs` 缩短、`amp` 加大、常驻眉毛；
- **慢性子**：待机 glance `period` 加到 6000+；
- **庆祝风格**：`'33': { body: { spinFx, confetti } }` —— 有签名动作的皮肤会用自己的风格庆祝（云絮绽放 / 星星爆闪），`spinFx` 只在皮肤无签名时回退为自旋；
- **专属表情长相**：`pool` / `mouth` 引用 `eyeShapes` / `mouthShapes` 自定义轮廓，让关键表情有独一无二的五官。

## 六、上线检查清单

1. `tools/ring-editor.html` 调参完成，剪影无出画、无自交；
2. 六个基础状态肉眼过一遍：02 待机 / 10 开心 / 14 害羞 / 21 生气 / 30 思考 / 33 完成；
3. 色板 7 个 states 全部填写（缺省会回退主体色，导致生气不变红）；
4. 在 `index.html` 加一行 `<script src="src/characters/你的角色.js"></script>`（在 engine.js 之后）；
5. **在 `docs/DESIGN-PROVENANCE.md` 追加角色档案**（动机、参数、日期、迭代记录）——原创证据链要求；
6. 剪影与现有角色横向对比，确保互不雷同、且不与任何第三方知名形象近似。
