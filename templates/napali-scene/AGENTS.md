# Na Pali 可复用场景模板

本目录是可运行的代码模板。先读 README.md、configs/baseline.json、upstream.lock.json。

## 开始任务

1. `python scene.py verify`，确认固定源库和配置完整。
2. `python scene.py new --output <新目录> --name <英文名称>` 创建独立工作副本。不要在原模板中完成下一件作品。
3. 从 `configs/scene.json` 开始。先运行原作基线，再改场景，保留基线供对照。
4. 默认保留 vendor/napali 的地形生成、侵蚀、生态、FFT 海浪、光照、后处理和镜头插值。不要把它们重写成简化演示。

## 改动边界

- 配置层：params、render、camera.keyframes、geometry 引用；优先使用这些入口。
- 几何层：六组图像空间控制数据，见 configs/geometry.original.json。原作几何与部分着色逻辑有题材耦合，新地貌需要独立评估；不能只换标题就宣称新场景完成。
- 算法层：源码部件见 vendor/napali/tools。需要改动时，明确列出受影响算法，在独立副本中修改并保留 diff，重新建立基线；不要通过更新锁文件掩盖意外改动。
- camH、pitch、vfov 同时影响图像控制点反投影和收尾机位，默认冻结。改镜头使用 CINE 配置，不要直接改这三个参数。
- 不随意改树种、水体模型、材质、灯光和镜头多条路线。每轮只动一组明确变量，通过的部分冻结。

## 验收与收口

- `python -m unittest discover -s tests -v`，然后 build，核对 scene-build.json 中 shader 保留和质量降级标记。
- 明确启动、暂停、时间跳转、自由驾驶、画质切换、切走暂停、停止卸载均应实际操作验证。
- 在原作海岬、谷地、俯瞰三类机位对照；新航线检查整段运动，CPU 地面采样不能代替实际画面。
- 首次编译、地貌生成时间与运行帧率分开报告。性能依赖设备，不能用小视口截图证明全屏流畅。
- 达到用户约定用途后收口。不要未经要求重开岩壁、树叶等细节研究。
- 自动验收使用独立无头浏览器、自己的 profile 与串行 GPU 锁；不操作用户窗口，不并行跑多个三维场景。

## 交付

保留 scene.json、几何数据、构建清单、实际截图/运动验收、测量时的视口与画质。已实现、配置练习和未验证方向分别说明。保留 Leon Lin 的 MIT 许可与署名。
