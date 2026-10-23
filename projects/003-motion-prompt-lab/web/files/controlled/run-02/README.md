# 制作与交付

原创 20 秒产品片。画面由 @napi-rs/canvas 重建冻结产品 UI 组件，音乐由 NumPy 数学合成，音效独立分轨；无配音、未调用模型、未运行 Kokoro。

## 文件
- output.mp4：音乐与轻量事件音效的最终候选。
- output-music-only.mp4：相同画面的纯音乐版本。
- music-only.wav：无事件音效的 48 kHz / 24 bit 原创音乐母带。
- render.cjs：全部画面、排版、关键帧、时间曲线与三样本运动模糊。
- audio.py：固定种子 120 BPM 原创音乐、音效与混音。
- master.py：根据第一遍测量进行第二遍响度处理。
- produce.ps1：重建全部影片与音乐的命令。
- evidence/contact-sheet.jpg：16 帧交付拼版；evidence/narrative-2fps.jpg：评审叙事抽帧。
- evidence/ 下保存实际媒体技术检测、对比度计算、音频设计与独立评审记录。
- facts.md、ledger.md、result.json：事实来源、版本/耗时与已知限制。

## 重建
在本目录执行 `./produce.ps1`。依赖本机 Node、Python+NumPy、FFmpeg，Node 通过父目录查找项目 node_modules。字体引用 `../shared/fonts/`；不需网络或生成 API。

画面为忠实色彩与信息关系的动效化重建，不是网站录屏；未声称模拟交互已经在原应用执行。实验例句为本片原创测试文本，尚未用 Kokoro 合成。波形在可见期间始终附“教学示意 · 非模型运行”。

音乐原创，仅使用正弦叠加、包络与固定种子噪声。配乐试听舒适度、音乐审美、与参考片整体品质是否相当均不伪称通过。
