# 本轮带练语音验证

仅更新 `hold_right`、`hold_left`、`right_align`、`left_align` 四段，文稿先辨认车身与侧后地面，库角进入镜面后再比较间隙。由现有 `generate-minimax-narration.mjs` 调用真实 MiniMax 生成；模型 `speech-2.8-hd`、音色 `male-qn-qingse`。未输出或复制项目外凭据。

以下为对实际文件运行 `ffprobe` 的结果，四段均为 **MP3、32,000 Hz、单声道**；均通过 `ffmpeg -nostdin -v error -xerror -i <file> -f null -` 完整解码，退出码 0、无错误输出。

| 文件（位于 `public/audio/minimax/`） | 时长（秒） | 字节 |
| --- | ---: | ---: |
| `hold_right-c5f75d834f1f.mp3` | 12.384 | 199860 |
| `hold_left-647c56b2a953.mp3` | 12.312 | 198708 |
| `right_align-43e24bee1873.mp3` | 11.772 | 190068 |
| `left_align-fe80986ac669.mp3` | 11.952 | 192948 |

`node scripts/verify-minimax-narration.mjs` 通过：活动语音包 **42 段、6,322,248 字节、390.636 秒（显示 390.64 秒）**，活动清单文稿、文件长度和 SHA-256 一致。

旧音频未删除或覆盖；以下四个上一版文件均重新读取，并与生成前记录的长度和 SHA-256 核对一致：

- `hold_right-e0e6595b1ead.mp3`（93876 字节）
- `hold_left-48c8b5ae5081.mp3`（105396 字节）
- `right_align-29c6c6875c8f.mp3`（129012 字节）
- `left_align-3dd9a2ca606d.mp3`（126708 字节）

生成目录共保留 **54 个 MP3**，其中 42 个由当前清单引用、12 个为历史版本。验证使用现有 `D:/26project/26audio_and_video_project/ffmpeg-n6.1.3-win64-gpl-shared-6.1/bin/` 中的 `ffprobe.exe` 与 `ffmpeg.exe`，未安装新工具。
