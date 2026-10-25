// SPDX-License-Identifier: GPL-3.0-only
// Plain-language teaching content. Explanations and sample records are distinct.
export const glossary = Object.freeze([
  {id:'fluid',name:'海底热液',text:'海水进入海床裂缝，被地下热岩石加热，并与岩石发生反应后形成的水。它会带着溶解的物质流回海洋。',source:'whoi'},
  {id:'vent',name:'热液喷口',text:'热液流出海床的出口。流体是热液，出口是喷口，它们是不同的对象。',source:'whoi'},
  {id:'chimney',name:'矿物烟囱',text:'热液与冷海水混合时，部分矿物析出并不断沉积，逐渐形成烟囱状结构。',source:'whoi'},
  {id:'plume',name:'黑色羽流',text:'某些热液遇到冷海水后产生细小的悬浮矿物颗粒，看起来像黑烟。这里没有燃烧；也不是每种热液喷口都会冒黑烟。',source:'whoi'},
  {id:'chemosynthesis',name:'化能合成',text:'某些微生物利用化学反应释放的能量制造有机物，成为部分食物网的基础。动物不是直接把热量或黑色颗粒当作食物。',source:'noaa'},
  {id:'symbiosis',name:'共生',text:'不同生物长期生活在一起的关系。以一些巨型管虫为例，体内的共生细菌利用化学能制造养分，管虫也为细菌提供生存条件。',source:'whoi'},
  {id:'rov',name:'遥操作潜器 ROV',text:'由船上人员通过缆线控制的水下机器人。相机把画面传回船上，灯光照亮海床，机械臂和设备可以帮助取样。',source:'rov'},
  {id:'control',name:'背景站与对照',text:'在另一处位置收集同类材料作比较。比较水体时，两处都要采水，并记录位置、时间和方法；泥样不能直接替代另一瓶水。',source:null},
  {id:'habitat',name:'栖息地',text:'生物生活的地方。岩面、泥沙、水流与食物供应都可能影响生物分布，单凭一幅画面不能证明因果关系。',source:'coral'}
]);
export const learningSources=Object.freeze({
  whoi:{label:'WHOI · 热液原理',url:'https://www.whoi.edu/ocean-learning-hub/ocean-topics/how-the-ocean-works/seafloor-below/hydrothermal-vents/'},
  noaa:{label:'NOAA · 化能合成',url:'https://oceanexplorer.noaa.gov/ocean-fact/photochemo/'},
  rov:{label:'NOAA · 遥操作潜器',url:'https://oceanexplorer.noaa.gov/technology/subs-rovs/'},
  coral:{label:'NOAA · 深海珊瑚',url:'https://oceanexplorer.noaa.gov/ocean-fact/coral-water/'},
  pressure:{label:'WHOI · 浮力与耐压',url:'https://www.whoi.edu/ocean-learning-hub/ocean-facts/how-do-ocean-robots-take-the-pressure/'},
  ctd:{label:'NOAA · 温度、深度与采水',url:'https://oceanexplorer.noaa.gov/technology/ctd/'},
  sonar:{label:'NOAA · 声呐',url:'https://oceanexplorer.noaa.gov/technology/sonar/'}
});
export const lessonStages=Object.freeze({
  equipment:{title:'潜器带着什么，怎样一起工作',term:'rov',steps:[
    ['灯光与相机：看清现场','深水没有阳光。灯照亮目标，相机把画面传回船上；灯亮不代表已经知道水的成分。'],
    ['声呐与传感器：判断位置','声呐回声帮助了解目标与距离，导航信息帮助保留位置，温深传感器记录环境。这里的波纹与读数是工作方式示意。'],
    ['推进器：移动与悬停','电机带动推进器，让潜器前进、转向并在目标附近保持观察位置。'],
    ['浮力与耐压舱：保护设备','黄色固体浮力材料帮助承托潜器，并非氧气瓶；耐压舱保护电子设备。这台潜器不载人，人员留在水面船上。'],
    ['脐带缆：供电与双向通信','缆线把电力和控制指令送到水下，也把视频和传感器数据传回船上。'],
    ['机械臂：在水下操作','船上人员看着相机画面操纵机械臂，夹持工具或样品，完成需要接触目标的工作。'],
    ['采水瓶：封存水样','随身小瓶可以保留水样。后面的A/B大型采水架是预先布放的站点设备，取样后还要记录编号、位置与时刻。'],
    ['母船与绞车：控制和回收','控制组综合画面与传感器信息下达指令；绞车和吊架管理缆线、布放与回收，设备共同完成调查。']
  ]},
  hydrothermal:{title:'海水怎样变成海底热液',term:'fluid',steps:[
    ['海水下渗','蓝色水流沿海床裂缝进入地下。'],['地下加热','地下热源加热岩石，岩石把热传给水。'],['水与岩石反应','水与岩石发生化学反应，携带溶解的物质。'],['热液上涌','热液沿通道向上，从海床喷口流出。'],['遇冷发生变化','热液混入冷海水，部分矿物会析出。']
  ]},
  'black-smoker':{title:'水、出口、烟囱和黑烟',term:'chimney',steps:[
    ['热液从喷口流出','热液是水；喷口是它流出海床的出口。'],['颗粒形成黑色羽流','遇冷后析出的细小矿物颗粒悬浮在水里，看起来像烟。'],['沉积长成矿物烟囱','部分矿物留在出口周围，逐渐形成烟囱状结构。']
  ]},
  'food-web':{title:'没有阳光，养分从哪里来',term:'chemosynthesis',steps:[
    ['热液携带化学物质','化学物质为某些微生物提供可利用的能量来源。'],['微生物制造有机物','微生物利用化学反应的能量制造养分，称为化能合成。'],['养分支持动物','一些管虫依靠体内共生细菌获得养分；这只是部分深海生命的方式。']
  ]},
  habitat:{title:'为什么要同时记录生命与海床',term:'habitat',steps:[
    ['记录所在表面','辨认岩面与沉积海床，保留群落所在位置。'],['水流带来食物','珊瑚和海绵可以从流经身边的水里获取食物。'],['形成可检验的问题','比较位置、水体与形态，提出问题；图像差异本身不能证明原因。']
  ]},
  comparison:{title:'同类样本，怎样公平比较',term:'control',steps:[
    ['先检查两份材料','水样A与水样B必须都是海水，并保留各自的站位。'],['用相同方法分析','记录时间和方法，再由仪器与实验室检查成分。'],['分清观察与结论','颜色或一幅照片不能证明养分、污染或化学成分的多少。']
  ]},
  summary:{title:'这次调查回答了什么',term:null,steps:[
    ['已经理解的原理','把开场问题与已经解释的科学机制对应起来。'],['本次演示的记录','检查两处水样是否完成演示，保留各自的位置。'],['仍待分析的问题','具体化学成分和影响范围需要真实采样与分析，不能由模拟读数证明。']
  ]}
});
export const equipmentCatalog=Object.freeze([
  {id:'vision',name:'灯光与相机',question:'怎样在黑暗中看清？',text:'灯光照亮海床，相机记录对象及周围环境，画面经缆线送回船上。它们提供影像证据。',visible:'潜器前方两盏灯和中央镜头',source:'rov'},
  {id:'sonar',name:'声呐与环境传感器',question:'在哪里，周围有什么？',text:'声呐利用回声帮助判断周边目标；温深传感器记录水温和水压，深度可由压力换算。它们不能仅凭画面判定水的化学成分。',visible:'前向声呐面板与传感头；波纹为原理示意',source:'sonar'},
  {id:'thrusters',name:'推进器',question:'怎样移动并停住观察？',text:'电机带动推进器产生推力，帮助前进、转向和悬停。接近对象时需要控制位置，避免撞击或搅起沉积物。',visible:'机架周围的四个推进器',source:'rov'},
  {id:'pressure',name:'浮力材料与耐压舱',question:'水压下如何保护设备？',text:'黄色部件表示固体浮力材料，帮助承托重量，并非氧气瓶；耐压舱保护电子设备。ROV是无人机器人，人员留在母船。',visible:'上方黄色浮力体与机架内银色舱体',source:'pressure'},
  {id:'tether',name:'脐带缆',question:'怎样供电、传令和回图？',text:'船端通过缆线提供电力和控制指令，潜器把视频、状态和数据传回。三维粒子表现通信方向，不是真实电信号的外观。',visible:'从潜器连向母船的缆线',source:'rov'},
  {id:'arm',name:'机械臂与夹爪',question:'怎样拿取和操作？',text:'操作员依据画面控制机械臂，用夹爪持取工具或采集适合的样品。大型采水架不由这只小机械臂托举。',visible:'潜器前方关节臂和双指夹爪',source:'rov'},
  {id:'bottles',name:'随身采水瓶与站点采水架',question:'怎样把水样带回来？',text:'小型瓶架随潜器携带；A/B站展示的是预先布放的较大采水装置。两者都需要封存样本并保留取样条件，具体成分仍待分析。',visible:'潜器后部小瓶架；A/B站圆形大瓶架',source:'ctd'},
  {id:'ship',name:'船上控制台、绞车与吊架',question:'谁指挥，怎样放下和收回？',text:'人员留在母船上综合画面与数据操作潜器；绞车管理缆线，吊架协助布放和回收。完成工作依靠人、船、缆线与潜器协作。',visible:'母船作业甲板和黄色A型吊架',source:'rov'}
]);
export const learningMissions=Object.freeze({
  vents:{question:'没有阳光，热液喷口旁的生命靠什么生活？',goal:'弄清热液从哪里来、黑色羽流是什么，并比较喷口附近与远处的海水。',sites:{near:{id:'plume',label:'A · 喷口外侧',kind:'water'},far:{id:'flank',label:'B · 远离喷口',kind:'water'}},observations:{near:'站位靠近黑色羽流外缘',far:'站位远离可见羽流'},known:['海水进入地下、加热并反应后，沿通道流回海洋。','矿物析出可以形成黑色羽流与矿物烟囱。','某些微生物利用化学能制造养分，支撑附近的部分生命。'],pending:'水样的具体成分、微生物情况及热液影响范围，都需要真实仪器、同类对照和后续分析。'},
  canyon:{question:'珊瑚和海绵生活的海床，有什么不同？',goal:'记录岩面、泥沙与群落的位置，比较靠近岩壁与谷底通道的海水。',sites:{near:{id:'c-fan',label:'A · 近岩壁站',kind:'water'},far:{id:'c-channel',label:'B · 谷底通道',kind:'water'}},observations:{near:'记录近岩壁的站位与周围海床',far:'记录谷底通道的站位与周围海床'},known:['栖息地包括所在海床、水流与食物供应等条件。','冷水珊瑚与海绵可从流经身边的水里获取食物。','影像必须与位置、同类样本一起保存，才能继续调查。'],pending:'水体成分、食物供应及生物分布的原因，需要更多站位、重复观测与后续分析。'}
});
