# 项目维护指南

## 创建与排序

在仓库根目录执行：

```bash
python scripts/projects.py new example-project --name "项目名称" --repo "https://github.com/owner/repo" --summary "研究目标与项目价值"
```

脚本按现有最大编号加一分配 ID，创建研究说明、元数据和目录，并同步首页。Slug 使用小写英文字母、数字和连字符。

项目按 `project.json` 的整数 `id` 升序排列，目录名必须与 `id`、`slug` 对应，例如 `001-example-project`。编号是长期标识；不要通过重命名改变顺序，也不要删除旧记录后复用编号。停止研究时将状态改成 `已归档`。

## 元数据

下面只是配置示例，不是已收录的项目：

```json
{
  "id": 1,
  "slug": "example-project",
  "name": "项目名称",
  "summary": "一句话说明研究价值",
  "repo": "https://github.com/owner/repo",
  "status": "待研究",
  "cover": "",
  "cover_alt": "",
  "web": false
}
```

支持状态：`待研究`、`研究中`、`已完成`、`已归档`。

`cover` 是子项目内的相对路径，例如 `assets/cover.png`。提供封面时必须填写 `cover_alt`，描述截图内容。图片建议使用 PNG、JPG、WebP 或 SVG，宽度约 1200px，压缩后提交。额外图片及其说明放在子项目 README 中。

`web` 为 `true` 时，必须提供 `web/index.html`。该目录只能放公开发布的静态产物；应用源码和构建配置放在 `src/` 或其他独立目录。

需要让研究目录直接进入总结页时，可增加可选字段 `"web_entry": "research.html"`，或像 `"web_entry": "guides/research.html"` 这样的子目录入口。目标必须是 `web/` 内已经存在的相对 `.html` 文件，路径使用英文字母、数字、下划线、连字符及文件名中的点；不接受绝对路径、越界、反斜杠、URL、查询参数或片段。README 的在线入口与封面跳转、在线总目录的入口会统一使用该页面，原 `index.html` 仍会发布。省略此字段时保持原来的项目目录入口；`web: false` 时不能设置此字段。

一个研究子项目涉及多个上游工具时，可增加 `repositories`（实际 GitHub 仓库 URL 数组）与 `tool_summaries`（每项包含 `name`、`repo`、`summary`）。每条摘要用一句话解释该工具的本质能力和原理；来源必须属于 `repositories`，摘要应覆盖全部来源。保留 `repo` 作为兼容字段，其值必须出现在数组中。README 索引与在线索引均展示所有来源和逐工具摘要；未提供这些可选字段的单仓库项目保持原有展示。

研究来源是帖子或普通网页、而 `repo` 只是本研究所在仓库时，可填写 `source_url`（原网页的 HTTPS 地址）和 `source_label`（例如“原帖来源”，默认“原始来源”）。README 与在线索引的来源入口会优先展示这个链接，避免把研究仓库误标为原始来源；未配置时继续展示 `repo` / `repositories`。

## 同步与校验

```bash
python scripts/projects.py sync
python scripts/projects.py check
python -m unittest discover -s tests
```

首页两个 `PROJECTS` 注释之间的内容由脚本生成，不要手动修改。其他段落可以直接编辑。校验会检查编号、目录、元数据、图片与演示入口，并确认首页索引已同步；提交和 PR 都会自动执行。

## 完整引导图

研究呈现还应遵循用户确认的[完整引导图要求](research-guide-map.md)：一张图汇总核心理解、思考、执行流程与个人参考价值，保留动作、产物、判断和证据边界；网页提供放大浏览和原图下载。

## 子项目依赖

研究项目可采用不同语言与框架，分别管理自己的依赖和锁文件。在各项目 README 中写明工作目录、版本要求、安装、运行和验证命令。现阶段无需统一为 npm workspace，也不默认复制整个上游仓库。

引用上游代码时保留许可文件及必要署名；大体积数据、模型权重和生成产物优先使用外部下载链接。
