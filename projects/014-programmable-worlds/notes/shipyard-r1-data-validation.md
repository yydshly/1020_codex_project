# 独立船坞与运河车站 R1 · 数据核验

记录于 2026-10-24T17:46:43.194913+00:00。本记录确认独立数据包可进入实时验收，不宣称最终作品画质或交互已经通过。

- 场景 ID：`shipyard-station`；新源 GLB SHA `1438d3aee0e5a99edcda3426340d4e814313136049055094aaaf14d35d640690`。
- 新模型 SHA `1655d4c60ba1c3c1b41d3e71e5ff4d66e081ac92e1e52642b9bad93b7f03b265`，4,389,940B，文件名 `shipyard-lightmapped.glb`。
- 新 manifest SHA `4ea56b2a06e465341666202568952c455a00cfb53869a2bad240bddb17a928ec`；光照指纹 `62d64e53da7ccf5775e19ee4c704a2c3c105a7dafa9bae52fbc8cce8d889610c`。
- 新 UV master SHA `ac22320f28d09ce1676e3ae991c0b3466786c798a8cf8909717fe103c276e414`。
- 23 个独立 receiver：6×2048、17×1024；全部为实际 uniform 128 样本，积分任务 354.19s。没有将其写成全组256或沿用旧运河分组。
- 23 组新几何引导与按 chart 的 CPU 重建均完成。模型/UV0/输入源、压缩及解码光照 SHA 全核，原始积分、proof master 与 UV master保留。
- 最终压缩光照 134,328,089B，解码 343,932,928B；只最终模型、压缩图和manifest写F，全部大中间留D。没有清理旧数据或触碰 ReflectFlow。

## 独立性与几何往返

未使用旧城市 GLB、R5 UV/光照图或旧 source-4 身份；只复用公共材质/HDR资源和基础算法。新源与新模型逐材质角点的双向匹配通过：位置最大误差 0m，UV0 最大分量误差 1.9073486e-06，法线最大夹角 0.12167623°，明确容差≤0.25°。不声称跨 Blender 导入/导出的法线字节相同。UV-only步骤内部的导入法线字节保持。

源中 2872 个位置、UV、法线和绕序均完全重合的三角面在导入时去重；只对这些完全重复面去重后比较，共91,730个唯一可见三角面。不同绕序、不同UV/法线或独立表面没有按重合面忽略。完整数值在D数据集 `geometry-validation.json`。

远地面及辅助实体留在物理 master中作为真实遮挡物，不占receiver atlas，不重复进入runtime模型；live辅助几何单独保留并实时受光。新静态主场景积分完整HDR，额外SUN=0，实时deSun IBL+单束光保留动态物体阴影。灰卡输入单位与天空方向已独立CPU核对；Float32节点/Uniform强度严格相等，未改曝光补偿均值。运行自定义weather GLSL不属于glTF，导出保留其源扫描图与材质因子，不能声称导出了同一段自定义shader。

## Chart 与均值边界

23组有效不等于每一个极细小chart都有纹素。以下是实际未全代表的组，需结合真实运行检查棚顶/栏杆等细面，不以图表数量代替画质验收：

| 材质 | 已代表chart / 总chart |
| --- | --- |
| Station/blackened-iron | 674 / 678 |
| Station/corrugated-zinc | 550 / 706 |
| Station/interior-shadow | 36 / 48 |
| Station/oiled-oak | 1760 / 1771 |
| Station/riveted-blue-steel | 1757 / 1824 |

线性白漫反射均值按有效表面像素记录；没有按材质做曝光或总能量补偿。具体如下，极暗面比例变化应同时看绝对值：

| 材质 | 原始均值 | 重建均值 | 比例 |
| --- | ---: | ---: | ---: |
| Station/blackened-iron | 0.293346 | 0.291802 | 0.9947 |
| Station/clock-face | 0.120746 | 0.120682 | 0.9995 |
| Station/corrugated-zinc | 0.664041 | 0.664532 | 1.0007 |
| Station/dressed-coping | 0.246645 | 0.246428 | 0.9991 |
| Station/faded-boat-paint | 0.130904 | 0.130754 | 0.9989 |
| Station/framed-canal-route | 0.192822 | 0.192710 | 0.9994 |
| Station/framed-departure-table | 0.266384 | 0.265997 | 0.9985 |
| Station/harbour-cobbles | 0.528545 | 0.528670 | 1.0002 |
| Station/interior-shadow | 0.028160 | 0.028127 | 0.9988 |
| Station/oiled-oak | 0.167162 | 0.156715 | 0.9375 |
| Station/old-firebrick | 0.336184 | 0.336072 | 0.9997 |
| Station/old-platform-paint | 0.121144 | 0.120634 | 0.9958 |
| Station/platform-paving | 0.190228 | 0.188472 | 0.9908 |
| Station/quay-stone | 0.627576 | 0.628787 | 1.0019 |
| Station/repair-yard-sign | 1.197716 | 1.197697 | 1.0000 |
| Station/riveted-blue-steel | 0.154059 | 0.152839 | 0.9921 |
| Station/slipway-stone | 1.030218 | 1.031148 | 1.0009 |
| Station/station-name | 0.128733 | 0.127911 | 0.9936 |
| Station/ticket-machine-brass | 0.138670 | 0.134318 | 0.9686 |
| Station/ticket-sign | 0.197346 | 0.192481 | 0.9753 |
| Station/ticket-stock | 0.048334 | 0.048212 | 0.9975 |
| Station/waiting-room-plaster | 0.055596 | 0.055434 | 0.9971 |
| Station/yard-timber | 0.307350 | 0.306986 | 0.9988 |

## 下一阶段

实际网页必须单独验证水面、真实22秒到站、上船/留站两种选择、驾驶与手机界面，再判断最终视觉完成度。三张Cycles proof只证明制作方向并用于root批准进入积分，未作为网页背景或交付效果。
