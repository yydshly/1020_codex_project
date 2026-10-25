# 来源与许可

原作：**江山时序 · Chronicles of the Realm**，DeanChensj / jiangshan-map。

- 源仓库：https://github.com/DeanChensj/jiangshan-map
- 固定版本：`53059f1c7fed305807b19365857a5f135daf3ac6`
- 取用日期：2026-10-24
- 上游许可：GNU General Public License v3.0，全文见 [LICENSE](LICENSE)。

上游 README 另有数据例外：源自 CHGIS V6 与 Hartwell China Historical GIS 的府州郡政区边界及战国疆域数据，保留其原始的学术、非商业使用条款，不因代码采用 GPL-3.0 而被重新许可。复用时应分别核对代码与数据的条款。

本子项目集成的上游 JavaScript、地图与历史数据、CSS、图片及文档，保留在 `web/upstream/`。其对应原始源代码可在固定版本仓库中取得；本地的来源、原始哈希、集成哈希与修改标记保存在 `web/upstream/SOURCE.json`。

上游运行代码和数据未经修改。集成副本仅从 `index.html` 去除远程字体请求与两个访问统计脚本，使用原样式中的系统字体后备。未收录 README 演示动图与英文截图等非运行必需的展示资源；README 中的项目原始介绍仍可在上游查看。地图仍保留原作主动开启的音乐功能及作者相关外链。

本子项目新增的展示页、场景导航、路线表单、校验与引导图生成代码按 **GPL-3.0-only** 提供，许可适用范围限于 `015-jiangshan-atlas` 子项目。此说明不改变研究集其他子项目的许可。
