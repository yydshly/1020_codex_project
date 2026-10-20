# GitHub 项目研究集

记录日常发现的优秀 GitHub 项目：从理解原理、运行验证，到改造实践与 Web 演示。

这里是研究总入口。每个子项目都有固定编号、独立说明和图片；按编号从小到大展示，方便持续积累和查找。

[在线索引页](https://yydshly.github.io/1020_codex_project/) · [项目索引](#项目索引) · [新增研究项目](docs/project-guide.md) · [Web 部署指南](docs/deployment.md) · [研究模板](templates/project/README.md)

## 项目索引

<!-- PROJECTS:START -->
当前还没有研究项目。第一个项目将从 **001** 开始。
<!-- PROJECTS:END -->

## 仓库结构

```text
projects/                 按编号组织的研究子项目
  001-project-name/       首个项目的位置示例（尚未创建）
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

## 开始第一个项目

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
