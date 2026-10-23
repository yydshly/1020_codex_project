# 来源核对记录 · 2026-10-23

原帖：https://x.com/Jason23818126/status/2112030757724340314
发布时间：2026-10-19，作者 @Jason23818126（摸鱼局长）。

本次浏览器实际读取到 video 的 readyState=4、duration=60.166。X 官方公开嵌入接口返回 duration_millis=60161、1280×720 与 MP4 资源地址；二者有几毫秒容器计时差异，页面统一标为约60秒。

视频资源：https://video.twimg.com/amplify_video/2112029905290706944/vid/avc1/1280x720/ZEXRzIM3m4JO4I3u.mp4

正式截帧以 FFmpeg -ss 10/30/50 -frames:v 1 提取；web/assets 中与 assets 中一致。早期 frame-01/02/03 为 fps 滤镜的观察素材，不用于精确定位。原片分析用副本在仓库忽略的 .cache/stickman-story-lab/source.mp4，另复制到 web/assets/original-demo.mp4 供可靠播放，网页保留署名与原帖入口。

已观察：白色简笔人物、室内与山野场景、环境特写、不同镜头构图。未听写或验证完整旁白；字幕自动化和质检能力仅据作者正文，不作为已实测事实。

作者声称：在 @CrazyKaomei 的开源基础上加入字幕与质检，串联主题到成片流程，实测不到10分钟出片。未经独立复现。

页面的价值分析、验收建议、扩展方向均为本项目分析。没有获取上游代码、没有确认许可证、没有安装 Agent。
