# 本机实际运行版本纠正

`2026-10-24T18-07-35-039Z` 的pilot脚本能运行，但实际浏览器沿用了旧main/journey模块缓存。其旅程state没有passengerSurface，onboard眼位仍旧，因此不能作为新oak2048/开放艉甲板修复的证据。原图/原JSON保留。

修复通过升级HTML入口、gi/journey/experience模块URL版本完成；隐藏QA额外只在本任务进程禁用HTTP缓存，不清空任何磁盘缓存或用户浏览器数据。正式页面的版本URL也已更新。新实际检查必须断言runtimeRevision、passengerSurface、manifest-oak2048来源及22组128＋oak2048，避免仅据源码修改宣称画面已更新。
