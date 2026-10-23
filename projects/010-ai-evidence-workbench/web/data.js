"use strict";
window.EVIDENCE_SOURCES = [
  {id:"S01",name:"目标产品的官方资料",url:"",role:"official",label:"核实声明",starter:true,status:"起步保留",contribution:"功能、价格、版本变化和使用限制。只跟踪正在用或准备试的少量工具。",caution:"官方资料是厂商声明；实际效果仍需实测。按候选补具体文档、价格与更新日志地址。"},
  {id:"S02",name:"小众软件",url:"https://www.appinn.com/",role:"discovery",label:"发现候选",starter:true,status:"起步保留",contribution:"补充冷门工具、桌面软件、开源替代品和具体更新。",caution:"工具介绍提供线索，是否经过充分测试要看具体文章；继续追溯产品原始资料。"},
  {id:"S03",name:"少数派 · 实测与工作流",url:"https://sspai.com/",role:"practice",label:"实际用法",starter:true,status:"起步保留",contribution:"优先找有过程的横评、长期体验、工具搭配和工作流拆解。",caution:"筛文章和作者；核对样本、测试条件与日期。个人体验不能直接推广到所有任务。"},
  {id:"S04",name:"V2EX · 相关讨论",url:"https://www.v2ex.com/",role:"feedback",label:"问题反例",starter:true,status:"起步保留",contribution:"按工具名找失败情况、迁移成本、长期使用体验和替代方案。",caution:"区分开发者自荐与独立反馈；单次抱怨是线索，不代表普遍故障。"},
  {id:"S05",name:"Show HN",url:"https://news.ycombinator.com/show",role:"discovery",label:"海外补充",starter:true,status:"起步保留",contribution:"候选不足时，发现海外新项目，阅读作者介绍和用户尝试后的讨论。",caution:"作者自述与独立用户反馈分别记录；海外来源不是每轮必查。"},
  {id:"S06",name:"项目 Issues / 支持论坛",url:"",role:"feedback",label:"版本核查",starter:false,status:"按需加入",contribution:"核实具体问题的复现条件、受影响版本、处理进度与修复记录。",caution:"随候选添加具体项目地址。未复现或未确认的问题保持不确定，不用一个 Issue 判定产品质量。"},
  {id:"S07",name:"Buzzing",url:"https://www.buzzing.cc/",role:"discovery",label:"发现入口",starter:false,status:"备用",contribution:"中文标题导读，帮助发现尚不知道该搜索的海外讨论与项目。",caution:"若已查询 HN 等原站，不重复算证据；需点回原文，无法解决所有原站访问限制。"},
  {id:"S08",name:"NewsNow",url:"https://newsnow.busiyi.world/",role:"heat",label:"传播热度",starter:false,status:"移出默认清单",contribution:"研究当下平台关注度和话题传播时再启用。",caution:"热度不等于可靠性。聚合条目需要追溯原站，与原站内容去重。"},
  {id:"S09",name:"今日热榜",url:"https://tophub.today/",role:"heat",label:"传播热度",starter:false,status:"移出默认清单",contribution:"按原帖定位，补充跨平台热榜视角，适合话题观察。",caution:"与 NewsNow 用途重叠，不必同时保留。本轮未重新核实当前栏目，不能据此保证覆盖。"},
  {id:"S10",name:"SoPilot 起爆帖",url:"https://sopilot.net/zh/hot-tweets",role:"heat",label:"选题时机",starter:false,status:"运营时启用",contribution:"做 AI 内容和经营 X 账号时，观察正在升温的帖子。",caution:"曝光与起爆预测不是产品能力证据，预测可靠性本项目尚未验证。"}
];
window.EVIDENCE_DEMO = [
  {id:"A",type:"官方声明",title:"工具 A 发布说明",claim:"声称支持中文 PDF 与表格导出。",origin:"A"},
  {id:"B",type:"转载介绍",title:"媒体 B 的新品介绍",claim:"转述同一份官方发布，没有新增测试。",origin:"A"},
  {id:"C",type:"转载介绍",title:"资讯 C 的工具推荐",claim:"改写发布说明，核心信息仍来自 A。",origin:"A"},
  {id:"D",type:"转载介绍",title:"简报 D 的更新汇总",claim:"引用官方能力描述，没有独立使用证据。",origin:"A"},
  {id:"E",type:"独立实测",title:"作者 E 的处理记录",claim:"示例：两份文字版 PDF 的表格基本可用，需少量修改。",origin:"E"},
  {id:"F",type:"用户反馈",title:"用户 F 的失败报告",claim:"示例：一份扫描件合并列出错，需核对文件与版本。",origin:"F"}
];
