# 多个 Web 演示的部署

2026-10-27 新增并验证：[014 · 可编程世界](https://yydshly.github.io/1020_codex_project/projects/014-programmable-worlds/#research-summary) · [完整总览图](https://yydshly.github.io/1020_codex_project/projects/014-programmable-worlds/map.html)。摘要明确原作程序海岸、我们的老街/船坞/漓江，以及“确认约束→固定模板→有界求解→独立验证”；完整自动管线尚未实现。原作完整实时控制保留本机限定。Pages成功，15项构建测试、10项公网静态检查、4项公网漓江有限运行检查、115项资源核对通过；运河在发布包暂存环境完成加载与有限操作，不称作公网全流程。详见[014发布记录与边界](../projects/014-programmable-worlds/notes/release-20261027.md)。

2026-10-25 新增并验证：[015 · 江山时序能力研究](https://yydshly.github.io/1020_codex_project/projects/015-jiangshan-atlas/) · [016 · 三维历史地图](https://yydshly.github.io/1020_codex_project/projects/016-dongpo-journey/) · [017 · 源库与我们的能力、原理、效果及扩展摘要](https://yydshly.github.io/1020_codex_project/projects/017-abyss-expedition/research.html#capability-summary) · [一图总览](https://yydshly.github.io/1020_codex_project/projects/017-abyss-expedition/overview.html)。目录进入研究档案，原深海入口保留。Pages成功；587项线上资源核对通过，原作SVG浮雕、016新增真三维、017独立流程与后续铁路目标分别说明。详见[发布记录与验收边界](releases/map-research-20261025.md)。


2026-10-25 新增并验证：[012 · 入库之间 C1 练车与复盘](https://yydshly.github.io/1020_codex_project/projects/012-parking-lab/) · [我们的理解与进展](https://yydshly.github.io/1020_codex_project/projects/012-parking-lab/progress.html#understanding) · [完整22章演示](https://yydshly.github.io/1020_codex_project/projects/012-parking-lab/courses.html?course=all)。完整摘要与生成引导图已接入站点目录；492项模型测试、191段语音校验、课程入口与子路径检查通过，Pages成功。211个线上唯一目标已覆盖核验，四项瞬时请求失败单独复核通过；引导图和站点封面与认可原图哈希一致。详见[012发布记录与边界](../projects/012-parking-lab/notes/release-20261025.md)。

2026-10-23 新增并验证：[011 · Jev Ultrafast 研究](https://yydshly.github.io/1020_codex_project/projects/011-jev-browser-agent-study/) · [横向架构图](https://yydshly.github.io/1020_codex_project/projects/011-jev-browser-agent-study/architecture.html)。摘要说明网页操作抽取、Jev 选择与程序执行循环、通用 Agent 骨架的价值和五条待实现扩展；沿用认可的 1920 × 1080 横图，PNG 与原图字节一致。Pages 成功，13 项线上资源与发布提交一致，详见[011 发布记录](../projects/011-jev-browser-agent-study/notes/release.md)。

2026-10-23 新增并验证：[008 · 产品发现平台图谱](https://yydshly.github.io/1020_codex_project/projects/008-product-platform-atlas/) · [生成的总览引导图](https://yydshly.github.io/1020_codex_project/projects/008-product-platform-atlas/overview.html)。摘要覆盖 Product Hunt、Uneed、BetaList、AlternativeTo、Indie Hackers、新趣集的能力与个人价值；引导图沿用已生成 PNG，线上文件与原图哈希一致。详见[008 发布记录](../projects/008-product-platform-atlas/notes/release.md)。

GitHub Pages 为每个仓库提供一个静态站点。本仓库把多个子项目的演示打包到该站点的不同子路径：

```text
https://yydshly.github.io/1020_codex_project/
https://yydshly.github.io/1020_codex_project/projects/001-example-project/
https://yydshly.github.io/1020_codex_project/projects/002-another-project/
```

GitHub Pages 已开启，使用 GitHub Actions 发布。[在线索引页](https://yydshly.github.io/1020_codex_project/)为站点入口；上面的两个子项目地址仅用于说明路径规则，待对应项目收录并发布后才可访问。

## 准备一个演示

1. 在子项目中完成 Web 应用并执行构建，将可公开发布的静态产物放入该项目 `web/`，入口为 `web/index.html`。
2. 将 `project.json` 的 `web` 改为 `true`。
3. 执行 `python scripts/projects.py sync`，提交元数据、首页以及需要发布的静态文件。

纯 HTML/CSS/JS 可以直接放在 `web/`。需要编译的项目保留自己的源码、依赖及锁文件，并在研究说明中记录构建命令；当前通用流水线只打包 `web/`，不会自动安装或构建每个项目。

静态资源优先使用相对路径。框架若需要配置 base，应使用 `/1020_codex_project/projects/编号-slug/`，不要假设部署在域名根路径。SPA 优先使用 hash 路由，避免刷新子页面时返回 404。

## 本地预览

```bash
python scripts/projects.py build
python -m http.server 8000 --directory _site
```

访问 `http://localhost:8000/`。`_site/` 是自动生成目录，每次 build 都会重建；不要在里面保存源码。

要模拟 GitHub Pages 的仓库前缀，可将 `_site` 中的内容复制到一个临时预览目录的 `1020_codex_project/` 下，从预览目录启动 HTTP 服务，再访问 `/1020_codex_project/`。使用绝对 base 路径的应用尤其需要这一步。

## 发布更新

1. 将更新提交并推送到 `main`。本仓库的 **Settings → Pages → Build and deployment → Source** 已设为 **GitHub Actions**，无需重复设置。
2. 在 [Actions → Deploy Pages](https://github.com/yydshly/1020_codex_project/actions/workflows/deploy-pages.yml) → **Run workflow** 中选择 `main` 手动执行。
3. 工作流成功后，从部署环境的 URL 打开站点。

也可以在仓库根目录通过 GitHub CLI 发布：

```bash
gh workflow run deploy-pages.yml --ref main
```

以后更新演示后，重新运行同一工作流。发布为手动触发；日常 push 和 PR 只校验与打包，不发布。总 README 索引表的“在线研究页”直接指向项目的 GitHub Pages 地址；启用 Web 的项目封面也跳转到该在线页。在线索引首页提供同名入口。“研究说明”保留为仓库文档入口，源库链接显示仓库名。

当前已发布：[001 · cyber-xiaowan 研究页](https://yydshly.github.io/1020_codex_project/projects/001-evening-companion/)。新增项目完成部署后，应验证索引表的在线链接可以正常打开。

2026-10-23 新增并验证：[006 · 独立站实践手册](https://yydshly.github.io/1020_codex_project/projects/006-independent-site-playbook/) · [完整引导图](https://yydshly.github.io/1020_codex_project/projects/006-independent-site-playbook/guide.html)。本次沿用原图，发布结果与图片校验记录见[006 发布记录](../projects/006-independent-site-playbook/notes/release.md)。

GitHub Pages 只托管静态文件。需要服务器、数据库或私密 API 密钥的应用，应另行部署后端，并在子项目说明中记录地址和配置方式。浏览器端构建产物中的环境变量是公开内容。

参考：[GitHub Pages 介绍](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) · [自定义部署工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

2026-10-23 新增并验证：[005 · 角色与故事工坊](https://yydshly.github.io/1020_codex_project/projects/005-stickman-story-lab/) · [研究总图](https://yydshly.github.io/1020_codex_project/projects/005-stickman-story-lab/#understanding)。摘要以定制角色＋故事的能力与价值为主，沿用既有引导图；成片、23份素材与线上原图哈希已验证，详见[005发布记录](../projects/005-stickman-story-lab/notes/release.md)。


2026-10-23 新增并验证：[010 · AI 信息工作台](https://yydshly.github.io/1020_codex_project/projects/010-ai-evidence-workbench/) · [理解全景图](https://yydshly.github.io/1020_codex_project/projects/010-ai-evidence-workbench/guide.html)。摘要列出七个原始来源和官网、Issues、Show HN 等补证入口，说明同源去重、互补核验、证据沉淀、扩展方向与价值；沿用已生成完整图。Pages 工作流成功，12 项线上资源与提交一致，PNG 与原图哈希相同；SVG 仅按仓库要求统一换行。详见 [010 发布记录](../projects/010-ai-evidence-workbench/notes/release.md)。
