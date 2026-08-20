/* ============================================================
 * emotions.js —— 表情数据基座（纯数据，不含任何 DOM / 逻辑代码）
 *
 * 全角色共享的 32 套表情编排。与具体角色解耦的三个语义层：
 *   pool   眼形槽位名（geometry.js EYE_SLOTS），角色用自己的眼环族实现
 *   mouth  嘴形槽位名（smile/grin/o/flat/frown/wavy/pout/open/dot）
 *   颜色   '@token' 查角色色板：@base 常态 @dim 低落 @soft 柔和
 *          @blush 泛红 @angry 涨红 @alert 警示 @off 关机
 *
 * ID 分段规则（十位 = 分组前缀，组间空号为扩展预留，编号即对外契约）：
 *   00-09 生命周期 · 10-29 情绪反应 · 30-49 代理工作状态 · 50+ 自定义
 *
 * 配置字段：
 *   pool / poolMs / poolSpeed   眼形池与轮换节奏
 *   blinkMs                     眨眼间隔（null = 不眨）
 *   openness                    常驻开合度（睡眠 0.08、疲惫 0.55）
 *   antics                      待机随机小动作（自旋 / 弹跳）
 *   mouth                       嘴形槽位
 *   face                        { blush 0~1, browVis, browTilt, browRaise,
 *                                 mouthX/Y/SX/SY } 五官姿态
 *   body.spinFx / confetti      进入表情的一次性事件：自旋甩粒子 / 撒花
 *   body.zzz / orbit            睡眠字母粒子 / 常驻环绕粒子
 *   sequence                    关键帧序列，settle: 'base'|'hold'|{ next }
 *   en                          英文文案 { name, desc }
 * ============================================================ */

window.EMOTION_GROUPS = [
  { key: 'life',    name: '生命周期',     en: 'Lifecycle' },
  { key: 'emotion', name: '情绪反应',     en: 'Emotions' },
  { key: 'agent',   name: '代理工作状态', en: 'Agent States' },
  { key: 'custom',  name: '自定义',       en: 'Custom' }
];

window.EMOTION_SEED = [

  /* ==================== 1）生命周期（8 个） ==================== */

  {
    id: '00', name: '睡眠', group: 'life',
    desc: '闭眼成细线，右上角 zzz 缓缓飘起，头微垂，只剩缓慢呼吸',
    en: { name: 'Sleeping', desc: 'Eyes closed to thin lines, zzz drifting up at the top right, only a slow breath remains' },
    transition: 900,
    gaze: false,
    pool: ['closed', 'closed2', 'sleepy'], poolMs: [6000, 10000], blinkMs: null, openness: 0.08,
    mouth: 'flat',
    body: { y: 4, rotate: -2, breathe: 0.018, color: '@dim', zzz: 1 },
    eyes: { both: { y: 4, lookY: 2 } },
    anims: [
      { target: 'eyes', prop: 'y', type: 'sine', amp: 1.2, period: 3600 }
    ]
  },
  {
    id: '01', name: '唤醒', group: 'life',
    desc: '从闭合眼缓缓睁开，先揉眼似的眨两下，随后进入待机',
    en: { name: 'Waking', desc: 'Eyes slowly crack open with a couple of groggy blinks, then settles into idle' },
    transition: 320,
    pool: ['closed'], poolMs: [800, 800], blinkMs: null,
    mouth: 'o',
    sequence: {
      settle: { next: '02' },
      frames: [
        { at: 0,    eyes: { both: { open: 0.1, y: 4 } } },
        { at: 420,  eyes: { left: { open: 0.55, y: 2 }, right: { open: 0.12, y: 4 } } },
        { at: 820,  eyes: { both: { open: 0.3, y: 3 } } },
        { at: 1400, eyes: { both: { open: 1, scaleX: 1.12, scaleY: 1.12, y: -2 } } },
        { at: 2100, eyes: { both: { open: 1, y: 0 } } }
      ]
    }
  },
  {
    id: '02', name: '待机放空', group: 'life',
    desc: '左看看、右看看，目光在两侧各停留片刻，偶尔自旋甩粒子 / 弹跳',
    en: { name: 'Idle', desc: 'Glances left, glances right, lingering on each side; an occasional spin or bounce' },
    transition: 700,
    pool: ['calm', 'calm2'], poolMs: [9000, 16000], blinkMs: [6000, 14000], antics: true,
    mouth: 'smile',
    body: { breathe: 0.012 },
    anims: [
      { target: 'eyes', prop: 'lookX', type: 'glance', amp: 10, period: 4800 },
      { target: 'eyes', prop: 'lookY', type: 'sine', amp: 2, period: 4100, phase: 1.1 }
    ]
  },
  {
    id: '03', name: '好奇', group: 'life',
    desc: '圆睁 / 平静 / 扫视眼形快速轮换，头微倾，嘴巴张成小 o',
    en: { name: 'Curious', desc: 'Wide, calm and scanning eye shapes rotate quickly, head tilted, mouth a small o' },
    transition: 420,
    pool: ['wide', 'wide2', 'calm', 'scan'], poolMs: [1800, 3200], blinkMs: [2500, 5500],
    mouth: 'o',
    body: { rotate: 4, breathe: 0.01 },
    eyes: { both: { lookY: -1 } },
    anims: [
      { target: 'eyes', prop: 'lookX', type: 'sine', amp: 2.4, period: 2800 }
    ]
  },
  {
    id: '04', name: '发呆', group: 'life',
    desc: '半闭眼慢轮换，双眼各望各的，嘴巴缩成小点，偶尔弹跳提神',
    en: { name: 'Spacing Out', desc: 'Half-closed eyes rotate slowly, each wandering its own way, mouth a tiny dot; a bounce now and then' },
    transition: 800,
    pool: ['sleepy', 'closed2', 'calm'], poolMs: [3500, 6000], blinkMs: [4000, 8000], antics: true,
    mouth: 'dot',
    body: { rotate: -3, breathe: 0.008 },
    eyes: {
      left:  { lookX: -4, lookY: 2 },
      right: { lookX: 5,  lookY: -1 }
    },
    anims: [
      { target: 'eyes', prop: 'lookX', type: 'sine', amp: 3, period: 6800 }
    ]
  },
  {
    id: '05', name: '加载苏醒', group: 'life',
    desc: '双眼缓慢交替亮起，像系统正在逐项初始化',
    en: { name: 'Booting', desc: 'Eyes light up in slow alternation, like a system initializing step by step' },
    transition: 480,
    pool: ['calm', 'calm2'], poolMs: [6000, 10000], blinkMs: null,
    mouth: 'flat',
    anims: [
      { target: 'left',  prop: 'open', type: 'blink', interval: 1600, dur: 700 },
      { target: 'right', prop: 'open', type: 'blink', interval: 1600, dur: 700, phaseMs: 800 },
      { target: 'eyes',  prop: 'scale', type: 'pulse', amp: 0.04, period: 1600 }
    ]
  },
  {
    id: '06', name: '休眠', group: 'life',
    desc: '困倦眼形 + 半开合，几乎静止，只剩极弱的呼吸起伏',
    en: { name: 'Dormant', desc: 'Drowsy eyes at half openness, nearly still, only the faintest breathing' },
    transition: 1200,
    gaze: false,
    pool: ['sleepy', 'closed2', 'closed'], poolMs: [4000, 8000], blinkMs: null, openness: 0.4,
    mouth: 'flat',
    body: { y: 6, scale: 0.98, rotate: -1, breathe: 0.005, color: '@dim' },
    eyes: { both: { y: 5 } }
  },
  {
    id: '07', name: '抖动唤醒', group: 'life',
    desc: '整体轻颤，闭合的眼交错睁开，随后进入待机',
    en: { name: 'Shake Awake', desc: 'The whole body trembles as the eyes stagger open, then settles into idle' },
    transition: 220,
    pool: ['closed'], poolMs: [800, 800], blinkMs: null,
    mouth: 'o',
    body: { breathe: 0.004 },
    anims: [
      { target: 'body', prop: 'x', type: 'jitter', amp: 4.5, speed: 10, decay: 1600 },
      { target: 'body', prop: 'rotate', type: 'jitter', amp: 3, speed: 8, decay: 1600 }
    ],
    sequence: {
      settle: { next: '02' },
      frames: [
        { at: 0,    eyes: { both: { open: 0.1 } } },
        { at: 380,  eyes: { left: { open: 0.4 }, right: { open: 0.12 } } },
        { at: 900,  eyes: { both: { open: 0.7, y: 1 } } },
        { at: 1600, eyes: { both: { open: 1, scaleX: 1.08, scaleY: 1.08, y: -1 } } }
      ]
    }
  },

  /* ==================== 2）情绪反应（12 个） ==================== */

  {
    id: '10', name: '开心', group: 'emotion',
    desc: '笑眼轮换 + 咧嘴笑，身体轻快起伏，偶尔自旋甩出一圈闪光粒子',
    en: { name: 'Happy', desc: 'Smiling eyes with a wide grin, body bouncing lightly; an occasional sparkling spin' },
    transition: 380,
    pool: ['happy', 'happy2'], poolMs: [2500, 4500], blinkMs: [2500, 5000], antics: true,
    mouth: 'grin',
    body: { y: -3, breathe: 0.014, color: '@soft' },
    eyes: { both: { y: -3 } },
    anims: [
      { target: 'eyes', prop: 'lookY', type: 'glance', amp: 6, period: 3000 },
      { target: 'body', prop: 'y', type: 'sine', amp: 2.2, period: 1400 }
    ]
  },
  {
    id: '11', name: '疑惑', group: 'emotion',
    desc: '斜眼轮换，头微倾，一眼放大一眼收小，嘴角歪成波浪',
    en: { name: 'Puzzled', desc: 'Skeptical eyes, head atilt, one eye enlarged and the other shrunk, mouth a wobbly wave' },
    transition: 420,
    pool: ['squint', 'squint2', 'calm'], poolMs: [2200, 3800], blinkMs: [2800, 5500],
    mouth: 'wavy',
    body: { rotate: -8, breathe: 0.008 },
    eyes: {
      left:  { y: -4, scaleX: 1.1, scaleY: 1.1 },
      right: { y: 3,  scaleX: 0.9, scaleY: 0.9, lookX: 3 }
    },
    anims: [
      { target: 'body', prop: 'rotate', type: 'sine', amp: 1.4, period: 3200 }
    ]
  },
  {
    id: '12', name: '失落', group: 'emotion',
    desc: '困倦眼形慢轮换，眼睛下沉目光低垂，嘴角向下撇',
    en: { name: 'Down', desc: 'Drowsy eyes rotate slowly, sinking with a downcast gaze, mouth turned down' },
    transition: 820,
    pool: ['sad', 'sleepy', 'closed2'], poolMs: [4000, 7000], blinkMs: [4000, 8000],
    mouth: 'frown',
    body: { y: 5, rotate: -4, breathe: 0.007, color: '@dim' },
    eyes: { both: { y: 8, scaleX: 0.88, scaleY: 0.88, lookY: 4 } },
    face: { browVis: 1, browTilt: 10, browRaise: 2 },
    anims: [
      { target: 'eyes', prop: 'y', type: 'sine', amp: 1.6, period: 3600 }
    ]
  },
  {
    id: '13', name: '惊讶', group: 'emotion',
    desc: '双眼瞬间放大再回稳，眉毛高高挑起，嘴巴张成 O 形',
    en: { name: 'Surprised', desc: 'Eyes pop wide in an instant then steady, brows shooting up, mouth an open O' },
    transition: 180,
    pool: ['wide', 'wide2'], poolMs: [2500, 4000], blinkMs: [1800, 3500],
    mouth: 'open',
    body: { y: -4, scale: 1.03, breathe: 0.006 },
    eyes: { both: { scaleX: 1.14, scaleY: 1.14, y: -2, lookY: -2 } },
    face: { browVis: 1, browRaise: 7 },
    sequence: {
      settle: 'base',
      frames: [
        { at: 0,   eyes: { both: { scaleX: 0.92, scaleY: 0.92 } }, face: { browVis: 0 } },
        { at: 150, eyes: { both: { scaleX: 1.45, scaleY: 1.45, y: -4 } }, body: { y: -7, scale: 1.05 }, face: { browVis: 1, browRaise: 10, mouthSY: 1.3 } },
        { at: 420, eyes: { both: { scaleX: 1.22, scaleY: 1.22, y: -3 } }, face: { browVis: 1, browRaise: 7 } }
      ]
    }
  },
  {
    id: '14', name: '害羞', group: 'emotion',
    desc: '目光躲向一侧，腮红在一秒多里慢慢浮现，嘴巴抿成小嘟',
    en: { name: 'Shy', desc: 'Gaze slips off to one side as the cheeks slowly blush over a second, lips in a tiny pout' },
    transition: 560,
    pool: ['shy', 'calm', 'closed2'], poolMs: [3000, 5500], blinkMs: [3000, 6000],
    mouth: 'pout',
    /* base = 序列终态，保证静态缩略图与最终观感一致 */
    body: { rotate: 6, breathe: 0.012, color: '@blush' },
    eyes: { both: { y: 4, lookX: 8, lookY: 3 } },
    face: { blush: 1 },
    anims: [
      { target: 'eyes', prop: 'lookX', type: 'sine', amp: 2, period: 2600 }
    ],
    sequence: {
      settle: 'hold',
      frames: [
        { at: 0,    body: { color: '@base' }, face: { blush: 0 } },
        { at: 1500, body: { color: '@blush' }, face: { blush: 1 } }
      ]
    }
  },
  {
    id: '15', name: '疲惫', group: 'emotion',
    desc: '眼皮沉重半睁（低开合度 + 困倦眼形），目光下沉',
    en: { name: 'Tired', desc: 'Heavy eyelids at half openness with drowsy eyes, gaze sinking low' },
    transition: 900,
    pool: ['sleepy', 'closed2', 'closed'], poolMs: [4000, 8000], blinkMs: null, openness: 0.55,
    mouth: 'flat',
    body: { y: 4, rotate: -3, breathe: 0.016, color: '@dim' },
    eyes: { both: { y: 5, lookY: 3 } },
    anims: [
      { target: 'eyes', prop: 'open', type: 'sine', amp: 0.06, period: 3400 }
    ]
  },
  {
    id: '16', name: '专注', group: 'emotion',
    desc: '专注眼形轮换，双眼微微内聚，身体几乎不动',
    en: { name: 'Focused', desc: 'Focused eye shapes rotate, eyes converge slightly, body almost motionless' },
    transition: 320,
    pool: ['angry2', 'squint', 'listen'], poolMs: [1800, 3200], blinkMs: [2800, 5500],
    mouth: 'flat',
    body: { breathe: 0.004 },
    eyes: {
      left:  { x: 4 },
      right: { x: -4 }
    }
  },
  {
    id: '17', name: '慌张', group: 'emotion',
    desc: '圆睁眼形高频轮换，目光乱晃，嘴巴扭成波浪，整体细颤',
    en: { name: 'Panicked', desc: 'Wide eyes rotate at high frequency, gaze darting about, mouth a wobble, the whole body quivering' },
    transition: 200,
    pool: ['wide', 'wide2'], poolMs: [900, 1800], blinkMs: [1200, 3000],
    mouth: 'wavy',
    body: { breathe: 0.006 },
    face: { browVis: 1, browRaise: 5, browTilt: 8 },
    anims: [
      { target: 'eyes', prop: 'lookX', type: 'jitter', amp: 6, speed: 11 },
      { target: 'eyes', prop: 'lookY', type: 'jitter', amp: 4, speed: 9 },
      { target: 'body', prop: 'x', type: 'jitter', amp: 1.6, speed: 8 }
    ]
  },
  {
    id: '18', name: '无奈', group: 'emotion',
    desc: '斜眼轮换，头一歪，双眼翻向斜上方，嘴角一条平线',
    en: { name: 'Resigned', desc: 'Sidelong eyes, head cocked, both eyes rolling up and away, mouth a flat line' },
    transition: 560,
    pool: ['squint', 'squint2', 'sad'], poolMs: [2600, 4500], blinkMs: [4500, 8000],
    mouth: 'flat',
    body: { rotate: 10, y: 2, breathe: 0.01 },
    eyes: { both: { lookX: 7, lookY: -8 } },
    anims: [
      { target: 'eyes', prop: 'lookY', type: 'sine', amp: 1.6, period: 3000 },
      { target: 'body', prop: 'y', type: 'sine', amp: 1.2, period: 3000 }
    ]
  },
  {
    id: '19', name: '满意', group: 'emotion',
    desc: '目光正视前方，双眼有节奏地上下点动，如同点头认可',
    en: { name: 'Satisfied', desc: 'Gazing straight ahead while the eyes nod up and down in steady approval' },
    transition: 580,
    pool: ['scan', 'calm', 'happy'], poolMs: [3500, 6000], blinkMs: [3500, 7000], antics: true,
    mouth: 'smile',
    body: { breathe: 0.012, color: '@soft' },
    anims: [
      { target: 'eyes', prop: 'y', type: 'sine', amp: 5, period: 1050 },
      { target: 'body', prop: 'y', type: 'sine', amp: 1.6, period: 1050, phase: 0.6 }
    ]
  },
  {
    id: '20', name: '困惑', group: 'emotion',
    desc: '两眼大小不一，斜眼轮换，注视方向对不齐',
    en: { name: 'Confused', desc: 'Mismatched eye sizes and sidelong shapes, the two gazes never quite aligning' },
    transition: 480,
    pool: ['squint', 'squint2', 'calm'], poolMs: [2200, 3800], blinkMs: [2800, 5500],
    mouth: 'wavy',
    body: { rotate: -5, breathe: 0.008 },
    eyes: {
      left:  { scaleX: 1.16, scaleY: 1.16, y: -3, lookX: -3 },
      right: { scaleX: 0.8,  scaleY: 0.8,  y: 4,  lookX: 5 }
    },
    anims: [
      { target: 'left',  prop: 'lookX', type: 'sine', amp: 2.5, period: 3200 },
      { target: 'right', prop: 'lookX', type: 'sine', amp: 2.5, period: 3200, phase: 1.6 }
    ]
  },
  {
    id: '21', name: '生气', group: 'emotion',
    desc: '怒目圆睁眉毛倒竖，脸色在 0.25s 内迅速涨红并保持，身体细微发抖',
    en: { name: 'Angry', desc: 'Glaring eyes under knitted brows; the face flushes within a quarter second and stays, body trembling' },
    transition: 260,
    pool: ['angry', 'angry2'], poolMs: [2200, 3800], blinkMs: [3500, 7000],
    mouth: 'frown',
    /* base = 序列终态红 */
    body: { y: 1, breathe: 0.004, color: '@angry' },
    face: { browVis: 1, browTilt: -14, browRaise: -2 },
    anims: [
      { target: 'body', prop: 'x', type: 'jitter', amp: 1.1, speed: 7 }
    ],
    sequence: {
      settle: 'hold',
      frames: [
        { at: 0,   body: { color: '@base' }, face: { browVis: 0.4, browTilt: -6 } },
        { at: 250, body: { color: '@angry' }, face: { browVis: 1, browTilt: -14 } }
      ]
    }
  },

  /* ==================== 3）代理工作状态（12 个） ==================== */

  {
    id: '30', name: '思考中', group: 'agent',
    desc: '思考眼形轮换，目光在上方巡回，一群光点在头顶缓缓环绕',
    en: { name: 'Thinking', desc: 'Thinking eyes rotate, gaze patrolling upward, a ring of glow motes orbiting the head' },
    transition: 480,
    pool: ['calm2', 'squint', 'listen', 'scan2'], poolMs: [2000, 3600], blinkMs: [3500, 7000],
    mouth: 'dot',
    body: { rotate: -3, breathe: 0.01, orbit: 1 },
    eyes: { both: { lookY: -6, y: -2 } },
    anims: [
      { target: 'eyes', prop: 'lookX', type: 'sine', amp: 9, period: 2600 }
    ]
  },
  {
    id: '31', name: '接收任务', group: 'agent',
    desc: '轻轻眨一下并放大，像点头确认收到',
    en: { name: 'Receiving', desc: 'A quick blink and slight enlargement, like a nod of acknowledgement' },
    transition: 220,
    pool: ['happy', 'calm', 'calm2'], poolMs: [4000, 8000], blinkMs: null,
    mouth: 'smile',
    body: { breathe: 0.008 },
    sequence: {
      settle: 'base',
      frames: [
        { at: 0 },
        { at: 100, eyes: { both: { open: 0.1 } } },
        { at: 280, eyes: { both: { open: 1, scaleX: 1.12, scaleY: 1.12, y: -2 } }, body: { y: -3 } },
        { at: 700, eyes: { both: { open: 1 } } }
      ]
    }
  },
  {
    id: '32', name: '处理中忙碌', group: 'agent',
    desc: '专注眼形轮换，目光小幅循环往复',
    en: { name: 'Busy', desc: 'Focused eyes rotate while the gaze loops in tight little circuits' },
    transition: 360,
    pool: ['angry2', 'squint', 'listen'], poolMs: [1800, 3200], blinkMs: [2800, 5500],
    mouth: 'flat',
    body: { breathe: 0.008 },
    anims: [
      { target: 'eyes', prop: 'lookX', type: 'sine', amp: 6, period: 1200 },
      { target: 'eyes', prop: 'lookY', type: 'sine', amp: 4, period: 900, phase: 0.8 }
    ]
  },
  {
    id: '33', name: '任务完成', group: 'agent',
    desc: '笑眼咧嘴 + 自旋甩出一圈粒子 + 撒花庆祝',
    en: { name: 'Done', desc: 'Smiling eyes and a grin, a celebratory particle spin and a burst of confetti' },
    transition: 240,
    pool: ['happy', 'happy2', 'calm'], poolMs: [1400, 2600], blinkMs: [2200, 4500],
    mouth: 'grin',
    body: { spinFx: 1, confetti: 0.95 },
    eyes: { both: { y: -3 } },
    sequence: {
      settle: 'base',
      frames: [
        { at: 0,   body: { y: 0 } },
        { at: 300, eyes: { both: { scaleX: 1.1, scaleY: 1.1, y: -5 } }, body: { y: -6 } },
        { at: 700, eyes: { both: { scaleX: 1.05, scaleY: 1.05, y: -4 } }, body: { y: -2 } },
        { at: 1100, body: { y: 0 } }
      ]
    }
  },
  {
    id: '34', name: '出错', group: 'agent',
    desc: '圆睁双眼，脸色急促闪动两轮后定格在警示色，眉毛拧紧',
    en: { name: 'Error', desc: 'Wide eyes as the face flashes twice and settles on alarm color, brows knotted' },
    transition: 220,
    pool: ['wide', 'wide2'], poolMs: [2000, 3600], blinkMs: null,
    mouth: 'wavy',
    body: { rotate: -6, color: '@alert' },
    face: { browVis: 1, browTilt: -10 },
    eyes: {
      left:  { y: -3, rotate: -6 },
      right: { y: 4,  rotate: 8 }
    },
    anims: [
      { target: 'eyes', prop: 'lookX', type: 'jitter', amp: 1.4, speed: 8, decay: 800 }
    ],
    sequence: {
      settle: 'hold',
      frames: [
        { at: 0,   body: { color: '@alert', rotate: -6 } },
        { at: 170, body: { color: '@base', rotate: -4 } },
        { at: 340, body: { color: '@alert', rotate: -7 } },
        { at: 510, body: { color: '@base', rotate: -5 } },
        { at: 700, body: { color: '@alert', rotate: -6 } }
      ]
    }
  },
  {
    id: '35', name: '等待输入', group: 'agent',
    desc: '聆听眼形轮换，目光轻轻上下扫读',
    en: { name: 'Listening', desc: 'Listening eyes rotate while the gaze sweeps gently up and down' },
    transition: 480,
    pool: ['listen', 'listen2', 'happy'], poolMs: [2800, 5000], blinkMs: [3000, 7000],
    mouth: 'smile',
    body: { breathe: 0.01 },
    anims: [
      { target: 'eyes', prop: 'lookY', type: 'sine', amp: 6, period: 2200 }
    ]
  },
  {
    id: '36', name: '联网加载', group: 'agent',
    desc: '左右眼轮流眨，像信号在两端来回跳',
    en: { name: 'Loading', desc: 'Eyes blink in alternation, like a signal hopping between two endpoints' },
    transition: 380,
    pool: ['calm', 'calm2'], poolMs: [6000, 10000], blinkMs: null,
    mouth: 'dot',
    anims: [
      { target: 'left',  prop: 'open', type: 'blink', interval: 1200, dur: 380 },
      { target: 'right', prop: 'open', type: 'blink', interval: 1200, dur: 380, phaseMs: 600 },
      { target: 'eyes',  prop: 'lookX', type: 'sine', amp: 2, period: 2400 }
    ]
  },
  {
    id: '37', name: '复述回忆', group: 'agent',
    desc: '聆听眼形慢轮换，目光飘向上方翻检记忆',
    en: { name: 'Recalling', desc: 'Listening eyes rotate slowly as the gaze drifts upward, leafing through memory' },
    transition: 780,
    pool: ['listen', 'listen2', 'calm2'], poolMs: [4000, 8000], blinkMs: null,
    mouth: 'dot',
    body: { rotate: -2, breathe: 0.009 },
    eyes: { both: { lookY: -9, lookX: 3, y: -3 } },
    anims: [
      { target: 'eyes', prop: 'lookY', type: 'sine', amp: 2.4, period: 4000 }
    ]
  },
  {
    id: '38', name: '拒绝/受限', group: 'agent',
    desc: '斜眼下压嘴角向下，进入时连续摇头，明确表示不行',
    en: { name: 'Refusing', desc: 'A lowered sidelong gaze and a downturned mouth, with a firm head-shake on entry: the answer is no' },
    transition: 380,
    pool: ['squint', 'squint2', 'sad'], poolMs: [2600, 4500], blinkMs: [4500, 8000], openness: 0.6,
    mouth: 'frown',
    body: { y: 2, rotate: -2, color: '@dim' },
    eyes: { both: { lookY: 3, y: 2 } },
    sequence: {
      settle: 'base',
      frames: [
        { at: 0,   body: { x: 0 } },
        { at: 130, body: { x: -9, rotate: -6 } },
        { at: 300, body: { x: 8,  rotate: 2 } },
        { at: 470, body: { x: -6, rotate: -5 } },
        { at: 630, body: { x: 4,  rotate: 0 } },
        { at: 800, body: { x: 0,  rotate: -2 } }
      ]
    }
  },
  {
    id: '39', name: '输出回复', group: 'agent',
    desc: '扫读眼形轮换，嘴巴随输出节奏一张一合',
    en: { name: 'Replying', desc: 'Reading eyes rotate while the mouth opens and closes in time with the output' },
    transition: 360,
    pool: ['scan', 'scan2'], poolMs: [4000, 8000], blinkMs: null,
    mouth: 'open',
    body: { breathe: 0.008 },
    eyes: { both: { y: -2 } },
    anims: [
      { target: 'face', prop: 'mouthSY', type: 'pulse', amp: 0.55, period: 340 },
      { target: 'body', prop: 'y', type: 'sine', amp: 1.2, period: 680 }
    ]
  },
  {
    id: '40', name: '检索资料', group: 'agent',
    desc: '扫读眼形高速轮换（弹簧加速），目光左右快扫',
    en: { name: 'Searching', desc: 'Reading eye shapes rotate at high speed while the gaze sweeps rapidly side to side' },
    transition: 320,
    pool: ['scan', 'scan2', 'scan3', 'wide', 'squint'], poolMs: [1000, 1800], poolSpeed: 10, blinkMs: [1600, 4000],
    mouth: 'flat',
    body: { breathe: 0.006 },
    anims: [
      { target: 'eyes', prop: 'lookX', type: 'scan', amp: 11, period: 700 }
    ]
  },
  {
    id: '41', name: '停止终止', group: 'agent',
    desc: '闭合眼形，慢慢收小半闭后定格',
    en: { name: 'Powering Off', desc: 'Closing eyes shrink to half-closed and quietly freeze' },
    transition: 280,
    gaze: false,
    pool: ['closed', 'closed2'], poolMs: [6000, 9000], blinkMs: null,
    mouth: 'flat',
    body: { y: 3, breathe: 0.004, color: '@off' },
    sequence: {
      settle: 'hold',
      frames: [
        { at: 0 },
        { at: 1500, eyes: { both: { scaleX: 0.6, scaleY: 0.6, open: 0.35, y: 3 } }, body: { y: 4, scale: 0.97 } }
      ]
    }
  }
];
