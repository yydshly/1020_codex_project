# 复现
全部源代码是本次新写：prepare.py 合成原创音乐/事件音并写事实与节拍，render.mjs 使用真实产品冻结UI的组件重建逐帧画面，qc.py 测量对比度和像素边距。
依赖读取限项目 node_modules 中 @napi-rs/canvas / @resvg/resvg-js；字体与 favicon 来自 ../shared。

运行：python prepare.py；用 FFmpeg loudnorm 输出 mix.wav 与 music-only.wav；node render.mjs test；node render.mjs full；以 mix.wav 和 video.mp4 混流为 output.mp4。命令历史及当前产物都在本目录。prepare.py 和 render.mjs 为最终制作源；patch*.py 为迭代记录，不必再运行。
音乐：120 BPM，D小调及相关和弦，确定性加法合成，seed=20261023；无外部音乐、无配音、无模型生成API。
媒体版本：output.mp4 为最终候选；music-only.mp4 为同画面纯音乐音轨；music-only.wav 为纯音乐文件；contact-sheet.jpg 为20帧拼版。
参考片仅研究剪辑和运动品质，所有画面和音频从零编码。

需人确认：主观听感与音画情绪、与参考作品并排是否足够成熟、压缩后全部细字的舒适阅读。实际模型性能没有测试，片中保持教学/待实测声明。
