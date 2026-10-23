# 风格手册
色彩直接来自冻结 styles.css：#f6f5f0 纸、#fffefa 白、#263b34 墨、#255746 绿、#e7ede3 浅绿、#ac573b 陶土，共六色。色彩值保持品牌，不采用低对比 muted 文本。
字体使用 ../shared/fonts/msyh.ttc 和 segoeui.ttf；中文强制 YaHei，避免缺字。标题27–78px；主要正文21–29px；辅助英文字段最小17px。
原favicon：../shared/captures/source-favicon.svg，直接由 Resvg 栅格化，没有重画官方logo。
动作：Kokoro标题与纸卡在全片为同一绘制对象，容器尺寸/位置连续插值；阶段内容由卡内部遮罩交接。五次平滑曲线加非零进度，主卡推动阅读；局部线条和步骤错开。转场3个亚帧混合近似运动模糊。
三张风格帧：frames/frame-0000.png、frame-0450.png、frame-1110.png；另有全片20帧contact-sheet.jpg。
