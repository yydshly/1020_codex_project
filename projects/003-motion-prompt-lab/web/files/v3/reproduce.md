# V3 当前工作区复现

在 `F:/codex_project/1020_codex_project/projects/003-motion-prompt-lab` 执行：

```powershell
python src/v3/audio.py
node src/v3/render-all.mjs round-new
python src/v3/verify.py web/media/v3/round-new.mp4
```

第二条命令从帧0开始重新计算全部1200帧。它依次启动八个独立Node进程，隔离原生光栅器生命周期，然后调用FFmpeg编码；不复用历史帧跳过计算。内部等价的每场入口是：

```powershell
node --expose-gc src/v3/render.mjs frames 0 150
node --expose-gc src/v3/render.mjs frames 150 300
node --expose-gc src/v3/render.mjs frames 300 450
node --expose-gc src/v3/render.mjs frames 450 600
node --expose-gc src/v3/render.mjs frames 600 750
node --expose-gc src/v3/render.mjs frames 750 900
node --expose-gc src/v3/render.mjs frames 900 1050
node --expose-gc src/v3/render.mjs frames 1050 1200
```

区间左闭右开，输出全局帧号到私有frames缓存；完整编码命令由render-all.mjs执行。R2已实际从零跑完八个worker和完整编码，入口不是仅写出而未验证。R1曾发生两次长进程中断，最终手动补末场后编码；不能把R1描述成当时已一键跑通。

环境版本见environment.json。本工作区已固定NPM依赖、FFmpeg、Python/Numpy/Pillow，以及私有缓存中的真实favicon和源字体子集。渲染所需：

- `.cache/v3-source/product/source-favicon.svg`
- `.cache/v3-source/fonts/msyh.ttc.subset.ttf`
- `.cache/v3-source/fonts/segoeui.ttf.subset.ttf`
- `notes/v3/timing.json`

这是当前有素材与依赖的工作区复现，不是已验证的空白机器安装流程。系统字体源来自本机Windows，未分发到公开网页；在其他机器重新准备字体必须核对assets.json里的来源和哈希。参考影片与事实快照用于审计，不被嵌入成片。

任何新的完整输出都需要新的独立评审，不能沿用本次影片签署。通过完成评审的轮次打包时执行：

```powershell
python src/v3/package-final.py round-NN
```

打包只复制被审MP4原字节并解码海报/拼版，不重新编码，也不自动宣告该片可以发布。最终是否通过、未通过或未核，仍以独立报告和quality.json为准。
