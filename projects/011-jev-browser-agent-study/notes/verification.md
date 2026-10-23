# 本地验证记录

日期：2026-10-23（Asia/Shanghai）。本记录只覆盖研究网页与资料整理，不代表上游 Agent 或模型已经在本机运行。

## 内容依据

- GitHub 连接器核对上游 main commit：`1231850a0bf1a0c0341fe408ef1668dbbfdfac46`；版本 0.1.0，MIT，Python ≥ 3.12。
- 逐项核对 README、agent.py、model.py、snapshot.js、browser.py、questions.py、性能报告与环境示例。
- 已独立复核原版 operation / target 多问题、共享状态、最近 10 条执行历史、文字 helper、停止预算和结果核验边界。
- 图中酒店流程已与 app.js 统一：人数初始满足；先勾免费取消，再提交搜索；模型 DONE 后另作独立核验。
- TypeSafe 的 RLCD、架构与并行输出保留“官方声明”口径；未将私有实现猜测当事实。
- 本页酒店、价格、步骤与返回结果全部为原创固定教学数据，无真实模型、酒店查询、订单或付款。

## 静态与仓库检查

运行：

```powershell
python projects/011-jev-browser-agent-study/src/check_site.py
python projects/011-jev-browser-agent-study/src/render_guide.py
node --check projects/011-jev-browser-agent-study/web/app.js
python scripts/projects.py sync
python scripts/projects.py check
python -m unittest discover -s tests
```

结果：

- 三个 HTML 页的 ID、相对资源、跨页锚点有效；发布内容不依赖根目录绝对路径。
- Markdown / JSON 下载副本与 notes 原稿一致，JSON 可解析。
- 原始与 Web SVG 字节一致、XML 有效；修订后的研究总图尺寸 2000 × 7321，最小字号 23px。
- PNG 由 resvg-py 0.5.0 导出，保留 SVG 的箭头、虚线及系统字体；原始与 Web PNG 字节一致、尺寸与 SVG 相同。
- JavaScript 语法检查通过。
- 仓库已有的 8 项维护测试通过。这些测试针对项目目录维护与打包，不是上游模型测试。
- 项目索引已通过既有生成器同步，目录校验通过；011 是本次新增。其他正在进行的工作未回滚或提交。
- 横向核心图修订后，本项目资源、锚点与复制一致性复核通过；全仓库 `sync / check` 最终通过，共 13 个项目。
- 未调用根目录正式 build，以避免重建现有 `_site`；测试中的 build 在测试隔离目录内运行。

研究总图 SVG SHA-256：`6bbe25ae282edb9f1acd2b5c40e7f62db2fcd8ef363cb549c4c930aaef5f43fd`。

## 浏览器交互验证

使用内置浏览器，通过 `http://127.0.0.1:8021/` 检查页面。

1. **完整酒店流程**：从第 1 阶段逐步到第 11 阶段，观察城市、日期、免费取消、结果及详情状态；最后显示“业务代码独立检查实际结果”，下一轮按钮禁用。
2. **播放控制**：自动演示可从首轮进入第二轮，暂停后 aria-pressed 为 false；从头看可复位。
3. **跳转控制**：点击“第 9 轮：开详情”可到搜索结果阶段；当前步骤标记同步。
4. **DOM 规则实验**：候选数量初始 4；禁用搜索后 3；城市只读后 2；再隐藏免费取消后 1；恢复后回到 4。编辑示例城市时，候选列表当前值同步变化。
5. **研究总图**：修订后再次验证 100% 显示宽 2000px；适应宽度显示 1217px，桌面查看区 scrollWidth 等于 clientWidth；大图横向滚动只发生在查看区内。返回链接可跳回 index.html#evidence。289 行 SVG 文字经浏览器可见边界检查，均位于 2000 × 7321 画布内。
6. **手机布局**：390 × 844 与 320 × 780 两个视口下正文没有横向溢出；表格在自身容器内横向滚动，酒店演示改为上下排列。修订后总图再次测试：390px 查看页约 18%，320px 约 14%，查看区均能完整适应宽度。测试后恢复默认视口。
7. **控制台**：代表性酒店、控件与图页交互未发现 warning/error。
8. **HTTP 资源**：首页、guide.html、SVG、research.md、sources.json 均返回 200。

内置浏览器不允许 file: 协议；该尝试被浏览器策略拦截，未尝试绕过。浏览器检查使用已允许的本地 HTTP 预览。交付的 HTML/CSS/JS 是普通静态文件，运行方式见 README。

## 预览文件

- [桌面首屏](../assets/desktop-preview.jpg)
- [酒店教学结果阶段](../assets/hotel-preview.jpg)
- [手机首屏](../assets/mobile-preview.jpg)
- [完整图查看器](../assets/guide-preview.jpg)
- [完整高清 PNG 研究总图](../assets/browser-choice-guide.png)

## 单图汇总修订

- 总图由顺序文章卡片改为架构闭环主视觉，单独绘制正常操作、文字助手、失效回退、DONE 验收和停止分支。
- 完整保留网页控件到候选、六个探究转折、Jev 与生成模型对照、开源模型替换、11 步酒店教学、三种实现对比、速度证据及个人复用路径。
- 独立事实审稿覆盖 12 项核心结论。修正 WAIT 的生成规则：程序始终提供 WAIT，由模型判断是否等待；补全 logits 的单题、同答位、单 token、softmax 及多 token 评分边界。
- 使用系统字体导出的 PNG 已做全图及原尺寸架构局部检查；箭头方向、虚线和中文可读。网页首屏与 README 均已将总图设为明确入口。

## 横向核心图修订

- 按用户要求新增 1920 × 1080 横图，只保留程序、Jev、独立文字助手、浏览器的分工与执行循环；详细研究正文和原长图保留。
- 两个同色程序节点分别表示观察、整理候选和检查、发送执行指令。文字助手由程序按需调用并返回字段值，避免误解为 Jev 自行生成文字或调用助手。
- 横图 SVG 与 PNG 的原稿和发布副本均一致；浏览器检查 47 行文字没有超出画布。
- 新增 `architecture.html`，默认适应窗口完整显示。桌面 1280px 下图像约 1052 × 592，查看区无需横向或纵向滚动；100% 显示宽 1920px。390px 下整图按比例显示，无横向溢出，测试后恢复默认视口。
- 首页主入口、README 和项目索引封面均改为横图。新查看器交互无控制台警告或错误，全部三个 HTML 页的资源和锚点检查通过。
- [横图高清 PNG](../assets/browser-agent-architecture.png) / [横图可缩放 SVG](../assets/browser-agent-architecture.svg) / [查看器预览](../assets/architecture-preview.jpg)。

## 尚未执行的验证

- 没有安装、启动上游 Agent；没有 Chrome 远程调试授权或 API Key 配置变更。
- 没有发起 TypeSafe / OpenRouter 等付费推理请求。
- 没有复测作者 7.073 秒或 25% 的性能结论。
- 没有操作真实酒店平台、登录、提交订单或付款。
- 没有训练或复现 Jev，也没有完成不同决策模型的同条件对比。

## 公开发布核验

网页已按用户本次授权提交、推送并部署到 GitHub Pages；上面未执行项仅涉及上游模型和真实业务实跑。发布构建、线上资源对照与浏览器核验已完成，具体提交与工作流见[发布记录](release.md)。
