# GitHub 项目研究集

记录日常发现的优秀 GitHub 项目：从理解原理、运行验证，到改造实践与 Web 演示。

这里是研究总入口。每个子项目都有固定编号、独立说明和图片；按编号从小到大展示，方便持续积累和查找。

[在线索引页](https://yydshly.github.io/1020_codex_project/) · [项目索引](#项目索引) · [新增研究项目](docs/project-guide.md) · [Web 部署指南](docs/deployment.md) · [研究模板](templates/project/README.md)

## 项目索引

<!-- PROJECTS:START -->
| 编号 | 项目 | 摘要 | 状态 | 入口 |
| --- | --- | --- | --- | --- |
| 001 | cyber-xiaowan · AI 女友的过渡阶段参考 | 以宿主 Agent 为能力底座，用图片情绪包、预设台词和状态事件构成有情绪表达的桌宠；对我们而言，是 AI 女友从图片陪伴逐步走向 3D 的过渡阶段参考。 | 研究中 | [在线研究页](https://yydshly.github.io/1020_codex_project/projects/001-evening-companion/) · [研究说明](projects/001-evening-companion/README.md) · [cyberxiaowan/cyber-xiaowan](https://github.com/cyberxiaowan/cyber-xiaowan) |

### 001 · cyber-xiaowan · AI 女友的过渡阶段参考

<a href="https://yydshly.github.io/1020_codex_project/projects/001-evening-companion/"><img src="projects/001-evening-companion/assets/repository-summary.png" alt="从赛博小晚到我们的 AI 女友：原库的 Agent 与图片状态展示，以及先陪伴、再动效、按需升级 3D 的分阶段路线。图中角色为结构示意。" width="720"></a>

从赛博小晚到我们的 AI 女友：原库的 Agent 与图片状态展示，以及先陪伴、再动效、按需升级 3D 的分阶段路线。图中角色为结构示意。

以宿主 Agent 为能力底座，用图片情绪包、预设台词和状态事件构成有情绪表达的桌宠；对我们而言，是 AI 女友从图片陪伴逐步走向 3D 的过渡阶段参考。
<!-- PROJECTS:END -->

## 仓库结构

```text
projects/                 按编号组织的研究子项目
  001-evening-companion/  cyber-xiaowan 研究与公开页面
    project.json         名称、简介、来源、状态、图片和演示配置
    README.md            研究说明与结论
    assets/              封面、截图、流程图
    notes/               调研笔记、实验记录
    src/                 独立实现或改造代码
    web/                 可选：准备发布的静态 Web 文件
templates/project/       研究说明模板
docs/                    项目维护与部署说明
scripts/projects.py      新建项目、同步索引、校验和打包演示
.github/workflows/       自动校验与手动 Pages 部署
```

## 新增研究项目

需要 Python 3.10 或以上版本，无第三方 Python 依赖。

```bash
python scripts/projects.py new example-project --name "项目名称" --repo "https://github.com/owner/repo" --summary "一句话说明研究价值"
```

命令会创建 `projects/001-example-project/`，并更新本页索引。随后填写子项目 README，将截图放入 `assets/`，在 `project.json` 中配置 `cover` 和图片说明 `cover_alt`。

```bash
python scripts/projects.py sync
python scripts/projects.py check
```

## 维护约定

- **编号固定**：使用三位及以上编号，从 `001` 起递增；已发布编号不改动、不复用。归档项目保留记录。
- **先有来源，再有结论**：保留原仓库地址、研究时的版本或 commit、运行步骤和实际验证结果。
- **摘要留在首页，细节放进子项目**：首页展示简介、状态、封面和入口，研究过程写在子项目 README 与 `notes/`。
- **各项目独立运行**：依赖及启动命令在各自目录声明，避免互相干扰。
- **尊重上游许可**：引用、复制或修改上游代码时，保留其许可证与署名。当前仓库尚未指定统一开源许可证。

GitHub Pages 已开启：[访问在线索引页](https://yydshly.github.io/1020_codex_project/)。后续子项目的 Web 演示发布到 `/1020_codex_project/projects/编号-slug/`；操作步骤见[部署指南](docs/deployment.md)。
