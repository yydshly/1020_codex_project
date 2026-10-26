# R5 光照数据核验

本记录只证明 R5 候选光照包的来源、计算与文件完整性，不代表艺术质量或最终交付通过。静态数据仍对应冻结源4；后续运行时场景与故事镜头的修改需另行实际复核。

## 候选身份与复用范围

- 清单：`web/canal-real/baked-r5/manifest.json`，SHA-256 `8a30c040d0b2f56a2ae13c3e17c470f4fbd77602319074914eabc6e458d0b5a4`。
- FINAL runtime lighting fingerprint：`80836c3f6f8529ef088136e9628e75e100a820760c3c27c148ade87356a01b34`。单一配置与精确 canonical 字节位于 `web/canal-real/assets/lighting-r5/`；浏览器核验 canonical 字节哈希，再核对配置、清单中的光照对象语义相同。
- 源4 `photoreal-freeze-4-room-atlas-handle`：SHA-256 `bab33778df0185369750ccd30631ea6c8efa9f24a65a30a768cd0fd6bc39b851`。
- 复用 R4 模型 `../baked-r4/canal-lightmapped.glb`，124,788,220字节，SHA-256 `819b849b252ff22970c66e6349cf9eb4f470ad1ec775260e355ab2480c7da227`。没有重导几何、复制模型或重复嵌入扫描图片。
- 复用原UV母版及世界位置、法线、图表ID引导，UV母版 SHA-256 `47a4a28a97b4ac81ef61874fe16c922e851661fe599900e2f93d43fed0f6667f`。旧引导中的辐射颜色不进入R5重建；输入颜色来自本轮真实积分。

## 实际积分与核验

26组均重新计算完整白漫反射辐射，不含接收材质颜色或自发光。室内 `roomOak`、`roomPlaster`、`interior` 三组256样本；远景或微小表面六组64样本；其余17组128样本。逐组积分合计818.34秒，含加载与记录的GPU任务832.30秒；CPU图表重建464.22秒，与积分按组并行，不应相加当作总耗时。

新包26张压缩光照共180,023,986字节，解码413,138,944字节，线性RGBA16F。已核验全部压缩与解码哈希、有限非负辐射、实际Ns与计划、原始积分出处、源GLB、复用模型、UV母版，以及逐组UV0、三角顺序、法线与图表设置未变。新光照签名与R4不同，未命中旧阴天辐射缓存。复制并核验所有光照后才提交清单。

有效纹素的线性均值另行记录：25组重建/原始比值为0.9822–1.0011；暗部 `fabric` 为0.7409，绝对亮度从0.001629到0.001207。此差异如实保留，没有全局补亮或强制归一化；这些均值是诊断数据，不能代替画面复核或证明局部能量完全不变。

## HDR、方向与运行时拆分

采用 [Poly Haven 官方 kloofendal_48d_partly_cloudy_puresky](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) 2K HDR，作者 Greg Zaal / Jarod Guest，CC0。官方MD5 `2eba3a4d7eeb23cbfbeca364c97e7980` 与下载文件一致；SHA-256 `5244534e9cf5b606f2ff513aa00ddb161b0a4826ffd88a0d3bd03ac29247d198`。

静态积分使用完整HDR，Blender Mapping Z为+99.478327°、环境强度1.031923772、额外Sun为0、暖光系数0.25、曝光EV0。以水平灰卡积分匹配旧照明的相对照度，未声称绝对lux标定。依据Blender与Three的方向映射，Three的背景及环境旋转Y为−1.736224341弧度；太阳质心仰角47.88154°，Y-up指向光源的单位方向为 `[-0.463654585, 0.741759810, 0.484579002]`。

运行时从实际太阳邻域减去非负辐射残差，并按球面立体角积分为单一DirectionalLight。线性RGB为 `[0.991978083, 1, 0.908452115]`，强度4.562767783；去太阳HDR用于IBL与局部探针，完整HDR保留天空及水面反射。静态组的完整漫反射由GI替换，动态物体保留单次太阳直射与阴影，避免重复计入太阳。

实际文件复测发现，Blender生成图默认保存HDR时给像素施加了sRGB传递。改用Non-Color保存后重新加载RGBE文件，去太阳天空加单一光束的水平灰卡最大相对误差为0.01121%。最终去太阳HDR为5,450,691字节，SHA-256 `64ff36c899ea3b94543140cb0a5a00c4c32a97b5c4670cc62fcabe27c8797832`；未使用错误编码文件。

这次修正只将 runtime fingerprint 从 `0eb8…` 更新为FINAL `808…`，没有改变静态完整HDR、方向、校准或已执行的每组积分签名，也没有伪称重算。两种身份及修订原因保存在 `D:/codex/tmp/014-gi-r5-cloudbreak-20261024/runtime-decomposition-only-revision.json`。

原始积分、重建、26组数值报告及发布核验位于 `D:/codex/tmp/014-gi-r5-cloudbreak-20261024/`；光照对照及编码复测位于 `D:/codex/tmp/014-art-light-study-20261024/`。大型中间文件只写D盘；旧源、旧包、失败记录均保留，没有进行清理、迁移或触碰ReflectFlow数据。数据通过与实际网页、故事全过程及原作同档艺术评审分别判断。
