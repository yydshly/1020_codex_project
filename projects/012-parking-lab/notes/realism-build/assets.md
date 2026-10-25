# 场地首版素材记录

日期：2026-10-24。

## 路面底色贴图

- 项目文件：[yard-asphalt-v1.png](../../assets/textures/yard-asphalt-v1.png)，4,638,410 字节。
- 来源：内置 `image_gen` 工具，`transparent_background: false`。
- 原生成文件：`D:/codex/home/generated_images/01a164eb-5fb0-7671-b9ab-55eab0a6acf8/exec-86f87f54-4048-4a4b-bc41-68978a624b66.png`。
- 用途：真实 3D 场地路面的可平铺 albedo / base-colour 贴图，不以图片替代可行驶空间、标线或车库几何。
- 属性边界：这是生成材质，**不是实地拍摄、扫描或摄影测量材质**。提示词中的尺度、均匀光照与无缝平铺是生成目标，不等于实测标定；实际重复频率和外观仍需结合运行画面检查。
- 运行方式：纹理作为项目本地静态资源随构建加载，不在练习过程中调用图像生成服务，也未为本轮增加外网运行依赖。

完整原始提示词如下，原文保留：

```text
Use case: photorealistic-natural. Asset type: a single square seamless tileable albedo / base-colour material texture for the ground of a real-time 3D driving school parking trainer. Primary request: neutral medium-gray aged asphalt pavement, photographed perfectly orthographically straight down with uniform diffuse lighting, high fidelity fine aggregate and subtle tonal weathering. Physical coverage of this square is approximately 2 meters by 2 meters; the fine aggregate grains are realistically small millimeter-scale rather than gravel stones. Fine low-contrast aggregate, faint micro wear and a few tiny pores, restrained natural surface irregularity, no large identifiable repeating blotches. Edge-to-edge material sample, seamlessly tileable on all four edges, square 1024x1024. Colour palette neutral gray, avoid warm beige or green tint. Flat even base colour with no baked directional shadows, no gradients, no lens perspective, no vignette, no horizon. No lane markings, no cracks, no seams, no lines, no objects, no cars, no trees, no sky, no text, no watermark. This is a reusable material map, not a rendered scene or illustration.
```

## 场景几何与文字

场地、贴地漆线、围墙、铁网、项目牌、路障、低矮建筑、车棚和远景绿带由项目代码自建。项目牌与教学文字采用本地 Canvas 生成文本纹理，不依赖远程图片或字体服务。车辆及车舱继续采用自建工程参考几何，本轮未引入带品牌的车型模型或第三方车型资源。

场地和车辆的外观参考不构成厂家标定、实车眼位测量或考试设备认证。标线、库位和车辆运动仍由米制几何与项目参数决定，材质不会改变镜面 FOV、碰线边界或车辆路径。生成图只作为素材来源记录；浏览器效果和训练流程应由实际运行截图与操作结果验收，不能用素材图代替。
