# Director core · 镜头播放时钟

`director-core.mjs` 是不依赖 DOM、WebGL、Three.js 或航次数据的纯播放核心。输入镜头清单，输出当前镜头与片内进度；计时器、相机运动、字幕、设备位移和个人记录都由调用层处理。

```js
import {createDirector} from './director-core.mjs';

const director = createDirector([
  {id:'arrival',duration:12,entityId:'a',eventId:'event-a',framing:'wide',title:'抵达',narration:'先辨认场景。'},
  {id:'detail',duration:16,entityId:'b',eventId:'event-b',framing:'orbit',title:'观察',narration:'靠近目标，观察细节。'}
]);
const unsubscribe = director.subscribe(view => {
  renderCaptions(view);
  if (view.active) renderer.applyShot(view.shot, view.shotProgress);
});
renderCaptions(director.getView()); // 订阅不自动发初始通知。
director.enter();
// 在 requestAnimationFrame 中以秒调用；document.hidden 时应主动 pause。
director.tick(deltaSeconds);
// 离开：unsubscribe(); director.destroy();
```

每个镜头必需非空字符串 `id`、`entityId`、`eventId`、`framing`、`title`、`narration`，以及正有限秒数 `duration`。四个标识字段不能带首尾空格，镜头 ID 不得重复。允许额外 JSON 数据，例如相机偏移、阶段目标与字幕细分；会复制并深冻结，不保存调用者的可变引用。函数、循环引用、非有限数值、稀疏数组、访问器及特殊对象会被拒绝。

| 接口 | 行为 |
| --- | --- |
| `createDirector(shots,{onChange,maxDelta=.25}={})` | 创建独立时钟；可提供初始订阅者；最大单次推进默认 0.25 秒 |
| `getView()` | 返回冻结快照：`active,playing,completed,index,shot,shotElapsed,shotProgress,elapsed,duration,progress,shots` |
| `subscribe(listener)` | 监听实际变化，回调 `(view,{type})`；返回取消订阅函数 |
| `enter({index=0,playing=true}={})` | 从指定镜头起点进入导演模式；重复进入也会重新定位 |
| `exit()` | 退出并暂停，保留当前时间游标 |
| `play()` / `pause()` | play 可从退出状态继续；已完成时 play 从片头重播；pause 不激活模式 |
| `seek(seconds)` | 定位整片秒数；范围为 0 到片长，保持原播放/暂停状态，到片尾会暂停 |
| `seekShot(index)` | 定位镜头起点，保持原播放/暂停状态；序号从 0 开始 |
| `next()` / `previous()` | 跳到相邻镜头起点；最后一镜 next 完成，片尾 previous 回到最后一镜起点，第一镜 previous 停在片头 |
| `tick(deltaSeconds)` | 仅激活且播放时推进；非负有限秒数，超大 delta 被裁为 maxDelta，不补跑后台时间 |
| `destroy()` | 清除订阅并停止接受操作；重复销毁安全，最后快照仍可阅读 |

镜头区间为左闭右开，整片终点归最后一镜且进度为 1；接近十进制边界的浮点表示误差按少量 ULP 归并。片尾保持 `active=true`，但 `playing=false,completed=true`，不自动循环或退出。非法操作不会部分改写既有状态；有效操作中订阅者自身抛错仍会向调用方传播，此时状态已经提交。

核心不核验实体/事件是否存在于业务数据，也不解释 `framing` 字符串。调用层须把两类 ID 与数据关联，处理相机安全、减少动态效果偏好、后台暂停、模式退出和普通回放的互斥。它不自动写入样本、报告、URL 或存储。

## 用真实音轨驱动导演时钟

当前作品的 `../director-ui.js` 把两条十一章脚本与公共音频清单关联，检查每段音轨的文字和当前 `narration` 一致。每镜时长为 `Math.max(shot.duration, Math.ceil((audio.duration + 1) * 10) / 10)`；整片长度按实际音轨派生，当前热液 311.2 秒（5:11.2）、峡谷 298.5 秒（4:58.5）；旧字幕版 127/126 秒和前轮配音版 148.5/149.3 秒属于历史版本。影片秒数仍与航次分钟独立。

`../rendering/narration-player.mjs` 是浏览器媒体适配器，不计入八个纯核心。语音开启时，它依据 `audio.currentTime` 与片内游标的差值推进时钟；缓冲或播放受阻时不推进镜头。暂停、seek、切章、倍速与当前音轨同步；音轨结束后留出短暂停顿。用户可关闭语音继续字幕放映，或在浏览器阻止播放、加载失败后点击重试。核心仍只接收秒数，不直接访问媒体元素。

生成阶段由项目的 `src/generate-narration.mjs` 和 `src/minimax-tts.mjs` 调用[MiniMax 官方同步语音合成 HTTP 接口](https://platform.minimax.cn/docs/api-reference/speech-t2a-http)，模型为 `speech-2.8-hd`，音色为 `male-qn-qingse`。私有配置经 `--env-file` 的外部绝对路径读取；网页仅加载生成的 MP3 和公共清单，不包含 API 密钥，也不在播放时请求合成服务。

十一章调查导航、镜头环境水深剖面和语义标签属于体验适配层。水柱纵向压缩、深度与任务数据为教学模拟；播放不自动写入个人报告；教学演示使用独立临时记录。字幕、音轨和视频导出是不同能力，当前有字幕与合成解说音轨，未提供视频导出。媒体适配的实际缓冲、定位、倍速与手机行为需要单独浏览器验收，不能由纯时钟测试推断通过。

验证：`node projects/017-abyss-expedition/src/check-director.mjs`。包括时间边界、暂停与完成、导航、非法操作原子性、深冻结、后台 delta 保护及非海洋仓库流程夹具；不代替导演画面的实际浏览器验收。

## 二十二章学习内容与导演的分工

两条航次各十一章。热液片以目标、下潜、热液循环、黑色颗粒与烟囱、食物关系、近／远采水、同类对照、结尾整理和返航连接前因后果；峡谷片解释栖地、附着生物与水样对照。章节的 `learning` 与 `explanation` 仅供主题适配选择内容，导演核心本身不解释这些字段。

第七个纯核心 `learning-core.mjs` 管理独立的临时采样会话。`../learning-ui.js` 将概念词典、语音进度自动分步、手动暂停选步、取样瓶动画和样本卡相连；`../data/learning-content.mjs` 保存主题内容，`../rendering/learning-world.mjs` 呈现三维原理。两站都取水，实际点击并完成两瓶后才解锁对照，成分仍标为待分析。结尾分“已知原理 / 本轮记录 / 待分析”；临时演示记录不自动进入个人报告，重播会清空。

无深链接参数打开作品或切换航次时，业务层进入本航次建立现场的章节并暂停，用户点击继续才播放；有明确 `time`、`event`、`cam` 或 `film` 参数时按分享状态恢复。该入口策略不改变通用核心 `enter()` 的默认参数。

二十二段音轨的生成、解码和文本匹配已检查；新增原理、采水和完整学习流程的实际浏览器覆盖以项目 `notes/verification-learning.md` 为准。旧版音画或纯核心测试不能代替本轮实际操作验收。
