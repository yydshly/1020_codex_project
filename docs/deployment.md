# 多个 Web 演示的部署

GitHub Pages 为每个仓库提供一个静态站点。本仓库把多个子项目的演示打包到该站点的不同子路径：

```text
https://yydshly.github.io/1020_codex_project/
https://yydshly.github.io/1020_codex_project/projects/001-example-project/
https://yydshly.github.io/1020_codex_project/projects/002-another-project/
```

以上是规划地址；初始化不会自动启用 Pages，也没有发布示例项目。

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

## 首次发布

1. 在 GitHub 仓库 **Settings → Pages → Build and deployment** 中，将 Source 设为 **GitHub Actions**。
2. 在 **Actions → Deploy Pages → Run workflow** 中选择 `main` 手动执行。
3. 工作流成功后，从部署环境的 URL 打开站点。

以后更新演示后，重新运行同一工作流。发布为手动触发；日常 push 和 PR 只校验与打包，不发布。总 README 的“Web 产物”链接指向仓库文件，不表示已经上线；实际演示入口由部署后的站点提供。

GitHub Pages 只托管静态文件。需要服务器、数据库或私密 API 密钥的应用，应另行部署后端，并在子项目说明中记录地址和配置方式。浏览器端构建产物中的环境变量是公开内容。

参考：[GitHub Pages 介绍](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) · [自定义部署工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
