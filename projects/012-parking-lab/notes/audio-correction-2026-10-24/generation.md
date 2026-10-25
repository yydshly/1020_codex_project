# 2026-10-24 纠偏练习 MiniMax 语音更新

本轮仅更新 `src/narration.js` 中指定的 5 段观察提示，并新增 6 段 `correction_*` 讲解。六段纠偏讲解使用本轮确认的文本；基础观察提示改为先认车身与侧后地面，库线入镜后再比较，入门对照提示强调给回轮过程留出余量。

通过既有离线生成脚本真实调用 MiniMax，继续使用 `speech-2.8-hd / male-qn-qingse`。私有配置从项目外的指定 `.env.minimax` 读取，未打印配置内容或密钥。执行以下限定命令一次，未使用 `--force`，没有自动重试或重复付费请求：

```powershell
node scripts/generate-minimax-narration.mjs --env-file 'F:\codex_project\.env.minimax' --key straight,left_straight,beginner_mirror,beginner_hold,beginner_compare,correction_intro,correction_left_tight,correction_right_tight,correction_return,correction_good,correction_retry --limit 11
```

生成结果为 **11 generated / 0 cached**。这 11 个新版本合计 **2,450,172 字节、151.956 秒**。当前活动清单共 **48 段、7,834,176 字节、484.488 秒**。

| key | 新音频时长（秒） |
| --- | ---: |
| straight | 15.228 |
| left_straight | 17.208 |
| beginner_mirror | 17.712 |
| beginner_hold | 18.072 |
| beginner_compare | 15.624 |
| correction_intro | 14.688 |
| correction_left_tight | 11.088 |
| correction_right_tight | 10.296 |
| correction_return | 8.532 |
| correction_good | 13.392 |
| correction_retry | 10.116 |

验证结果：

- `npm run speech:verify` 通过，活动清单字幕与源码一致，全部活动文件的字节数和 SHA-256 匹配。
- FFmpeg 实际解码 11 段新 MP3，全部通过；FFprobe 确认均为 32 kHz、单声道 MP3，解码时长与生成记录一致。
- `node --test src/narration.test.js src/speech-catalog.test.js scripts/minimax-tts.test.mjs`：26/26 通过。
- 旧清单引用的 42 段音频逐个复核字节数和 SHA-256，全部原样保留；旧版本 MP3 和 Huihui WAV 未清理。

`manifest-before.json` 保存生成前的活动清单。`generation.json` 记录本轮各 key 的版本化文件路径、时长、字节数、SHA-256 与解码结果。应用使用的活动清单仍为 `public/audio/minimax/manifest.json`。本子任务未执行构建。
