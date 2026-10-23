# 事实与资产来源

所有路径相对本 run；只访问当前输入和 ../shared/，未读取其他组或旧作品。

| 成片信息 | 冻结共同材料 | 处理方式 |
|---|---|---|
| 六个 AI 内容工具，研究中 | ../shared/product/README.md | 首秒标签；不声称已实测 |
| Kokoro 把文稿、语言、音色转为语音 | ../shared/product/web/data.js tools[0] | 重建详情页输入输出 |
| Misaki 将文字转换为音素 | data.js tools[0].stages[1] | 原理第一步 |
| 模型结合风格预测时长与韵律，再解码波形 | data.js tools[0].stages[2:4] | 三段流程，简化但未改因果 |
| pipeline.py / model.py 映射 | data.js tools[0].stages 与 evidence | 对应流程标签至真实源码文件 |
| 固定版本 dfb907a | 完整 commit dfb907a02bba8152ca444717ca5d78747ccb4bec | 屏幕使用前七位简称 |
| 中英文、专有名词、数字，记录错读和耗时 | ../shared/product/notes/07-experiments.md | 明示待实测，无虚构成绩 |
| “Kokoro，编号 2026。” | 本片原创的测试文本示例 | 标为测试文本（示例），未声称来自实测 |
| 产品 UI 颜色与结构 | ../shared/product/web/styles.css、index.html、app.js、captures/kokoro-2560x1440.png | Canvas 重建真实导航、页签与卡片结构；截图只作采样 |
| 原始图标 | ../shared/captures/source-favicon.svg | 按相同40单位几何比例绘制，非虚构官方Kokoro标志 |
| 结尾仓库路径 | 用户共同brief指定 | github.com/yydshly/1020_codex_project |

颜色使用实际 CSS paper/white/ink/green/deep/pale/orange/sand；辅助文字从原 muted 调深为 #526057 保证小字号对比度。字体来自 ../shared/fonts/msyh.ttc 与 segoeui.ttf。

reference.mp4 仅抽帧私人研究构图与层次，没有读取或复制其声音；未作为任何成片素材。

所有音乐、波形、动画与测试文本为本次创作。可见波形不是 Kokoro 输出；实验实际结果始终“待实测”。
