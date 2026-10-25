# 015 · 能力展示验收记录

日期：2026-10-24。版本：`DeanChensj/jiangshan-map@53059f1c7fed305807b19365857a5f135daf3ac6`。

## 用户任务与实现边界

本阶段新建独立研究子项目，首先展示原库的真实能力。路径为「选择具体场景 → 本地原作加载对应年份／地点／人物 → 在地图中操作 → 看到疆域、沿革、路线或挑战反馈」。

展示页是本项目新增实现，地图及其历史资料来自固定版本上游。上游运行代码和数据保持原样；仅在集成入口 HTML 中移除远程字体和访问统计请求，使用系统字体后备。上游无需构建，完整运行所需的原生 JS、SVG 数据、CSS 和地形图片均本地提供。

## 数据与文件检查

`node src/check_runtime.cjs` 通过：

```text
62 vendored files verified against SOURCE.json
31 local entry links/assets checked
18 historical periods
168 snapshot keys / 166 period-or-phase-linked snapshots
468 chronological milestones
1405 settlement entries across periods (not unique cities)
113 person profiles / 7 preset journeys
```

校验同时执行 JavaScript 语法解析与全部时期的阶段快照引用检查。上游文件的原始哈希从 `git show <commit>:<path>` 得到，绕过 Windows checkout 的换行转换；子项目 `.gitattributes` 保留收录文件的字节，保证校验可复现。

上游未改动的 `scripts/validate_atlas.js` 在下载的完整源码 checkout 中执行通过。Windows 环境只有 `python`，因此运行时只把该校验器调用的 `python3` 命令映射到 `python`，未改上游文件。结果：

```text
18 dynasties, 168 snapshots (166 phase-linked), 2430 timeline years swept
18920 historical polygons (2539417 vertices) verified lossless & collision-free
35 modern province features (314 rings)
1405 ancient settlement entries & 468 historical milestones
7 journeys / 68 bilingual stops
351 era spans / 571 landmark events / 185 gazetteer landmarks
36 E2E CUJ checks passed
```

这 36 项是上游脚本的程序校验，不等同于 36 次真实浏览器人工操作。当前包的快照键数与上游部分介绍中的 167 不同，展示页使用数据包实际统计的 168。

## 浏览器实际操作

通过 Codex in-app browser 打开本机静态服务器，按界面操作并读取实际 UI 结果。

| 场景／动作 | 实测结果 |
| --- | --- |
| 默认秦灭六国场景 | 原作加载前 230 年版图和相应事件 |
| 下一历史节点 | 年份从 -230 变为 -228 |
| 输入 -221 并确认 | 年份显示 -221，朝代标题变为「秦」 |
| 长安场景 | 741 年唐代地图与「长安 · 陕西省 · 今西安」沿革卡片展开；显示历代政区与当地史事 |
| 苏轼场景 | 人物生平面板与 11 处史事、地图编号行迹展开；逐站操作后年份由 1037 前进至 1056 |
| 杜甫场景 | 地图与路线栏显示剑外、巴峡、巫峡、襄阳、洛阳共 5 站 |
| 图层场景 | 1415 年应天府与原作图层面板展开；点击「现代省名」后对应原生复选框 checked 为 true |
| 寻址挑战 | 出现西汉长安第 1 / 10 题；实际落针后显示偏差 403 公里、+25 分与答案，下一题按钮出现 |
| 苏轼路线预设＋表单提交 | 返回「已展开：湖州 → 黄州 → 惠州 → 儋州」，原作显示 4 站及 1079／1080／1094／1097 年份 |
| 跨年路线逐站前进 | 原作年份最终切换到 1097 |
| 年份填 0 | 显示合法范围及无 0 年的提示，未导航 |
| 两个年份对应四个地点 | 显示年份数量须匹配地点数量，未导航 |
| 未收录测试地名 | 由原作地名解析返回空，表单显示「词典中暂未找到」提示 |
| 复制体验链接 | 显示「链接已复制 ✓」；分享参数包含场景或自定义年份与地点 |
| 全屏与退出全屏 | 按钮变为「退出全屏 ⤡」，再点击恢复普通布局 |
| 引导图放大／适应宽度 | 显示 125%，再恢复「适应宽度」；SVG 实际渲染尺寸 1152 × 1368，保持 1600:1900 比例 |

移动端使用 390 × 844 视口设置检查（扣除滚动条后内容宽度 375 CSS px）。`documentElement.scrollWidth` 与 `clientWidth` 同为 375，无整页横向溢出；iframe 约 341 px 宽。场景栏为可横向滚动导航，原作进入自身移动布局，人物面板、时间轴与地图均可见。

## 实测截图

- [桌面原作与长安沿革](../assets/acceptance-desktop.png)
- [手机端原作与苏轼面板](../assets/acceptance-mobile.png)
- [引导图预览](../assets/acceptance-guide.png)

## 仓库集成

- `python scripts/projects.py sync` 完成，新增 015 条目，保留其他项目。
- `python scripts/projects.py check`：`Catalog OK: 15 project(s)`。
- `python -m unittest discover -s tests`：8 项通过。
- 只新增 `projects/015-jiangshan-atlas` 并由原脚本同步 README 的项目索引。本次没有提交或推送，也未执行公网部署。

## 限制与未验证范围

未重新校勘所有历史资料；未实测全部 113 个人物、每一个地名、每一道随机挑战题。没有运行 GeoJSON 导出，也没有调用外部模型或验证 Agent CLI 截图路径。音乐功能保留上游实现，本阶段未开启试听。公网路径和线上运行尚未发布验收。

浏览器开发日志记录过两条 `MutationObserver.observe` 的参数类型错误；本子项目和收录的上游代码均未包含 MutationObserver 调用，日志未提供可定位的源文件。其来源未确认，上述功能均已实际操作通过；不据此声称控制台完全无错误。

当前 UI 可以按预设阶段展示边界，不能据此证明任意一天疆域或历史事件的精确性。杜甫场景体现诗中文字的归乡路线，未把它当作实际旅行记录。

## 追加：实现、规划与指令手册

2026-10-24 根据用户要求新增 `web/playbook.html`、`playbook.css`、`playbook.js`，并在首页顶部、能力说明和引导图页加入入口。内容包括实现机制、AI 辅助开发与成品运行的区别、五阶段规划、六组指令模板、反馈句式和手动验收清单。实现机制附固定源码，Claude 参与开发的结论仅限可见的联合署名提交，规划模板明确标为本项目的实践整理。

实际浏览器检查：

| 操作 | 结果 |
| --- | --- |
| 从首页顶部进入「实现与指令」 | 正常打开手册；返回首页后原作显示「本地原作 · 已就绪」 |
| 修改主题和目标用户后生成首版指令 | 首版文本包含自定义主题、受众，其余字段内容保留 |
| 点击复制首版指令 | 按钮显示「已复制 ✓」，读取剪贴板确认包含自定义主题 |
| 下载全部 TXT | 取得实际下载文件，读取后确认六个模板标题齐全，包含当前生成的自定义主题 |
| 从规划步骤点击「视觉修改指令」 | 自动跳转并展开对应 details 面板 |
| 复制视觉模板 | 剪贴板与该模板的开头内容相符 |
| 恢复苏轼样例 | 表单主题与首版指令同时恢复样例 |
| 手动验收清单 | 复选框能选中与取消，未做持久化 |
| 手机入口与宽度 | 390 × 844 视口下，首页手册入口可见；首页和手册的 scrollWidth / clientWidth 均为 375，无整页横向溢出 |

已保存 [桌面截图](../assets/acceptance-playbook-desktop.png) 和 [手机截图](../assets/acceptance-playbook-mobile.png)。测试后恢复样例和桌面视口，保留手册作为可访问网页，原有用户的挑战页面未被导航或重置。

`check_runtime.cjs` 已覆盖新增页面和脚本：62 个上游文件哈希仍匹配，46 项入口资源／链接检查通过；总索引仍为 15 项且校验通过。同步更新了完整引导图的交付范围，原图与 Web 副本一致。

本次同时按上游 README 明确了代码许可与 CHGIS / Hartwell 数据例外的区别；没有修改已收录上游文件。手册的指令生成是浏览器内文本组合，不调用外部大模型；自动复制依赖浏览器剪贴板权限，失败时可手动选择模板文字。未进行公网部署。
