// SPDX-License-Identifier: GPL-3.0-only
// Exact narration phrases select existing model steps; no replacement speech.
const equipment=[
  [7,'人留在母船上，黄色遥控无人潜器不载人。'],
  [0,'灯光和相机让操作员看清海床'],
  [1,'声呐帮助辨认方位和障碍'],
  [2,'推进器负责移动、转向和悬停'],
  [3,'浮力材料托住机体，耐压舱保护电子设备。'],
  [4,'脐带输送电力和指令，并把画面传回船上控制台。'],
  [5,'机械臂操作工具'],
  [6,'随身的小型采水瓶封住水样'],
  [7,'船员用绞车放下和收回潜器。'],
];
const phrases={
  'vents-equipment':equipment,
  'canyon-equipment':equipment,
  // The fifth (mixing) model step is available for manual exploration. This
  // chapter does not narrate mineral precipitation; the next chapter does.
  'vents-fluid':[
    [0,'热液就是受地下热源加热、又与岩石发生反应的水。'],
    [1,'在地下受热'],[2,'带上与岩石反应产生的物质'],[3,'再沿通道上涌'],
  ],
  'vents-discover':[
    [0,'出口叫热液喷口。'],[1,'热水遇到冷海水后'],[2,'另一些矿物沉在出口周围'],
  ],
  'vents-life':[
    [0,'热液中的某些物质与海水成分反应'],[1,'一些微生物利用这种能量制造有机食物。'],[2,'这里以有共生细菌的热液管虫为例'],
  ],
  'canyon-habitat':[
    [0,'栖息地不只是一个地名'],[1,'水流可以带来食物。'],[2,'我们先把这些情况记录下来'],
  ],
  'vents-compare':[
    [0,'把A、B两瓶并排'],[1,'之后才比较化验得到的同一项成分。'],[2,'这里展示的是采样与比较的方法'],
  ],
  'canyon-compare':[
    [0,'两瓶水摆在一起'],[1,'真正的成分差异要靠同一种检测方法得到。'],[2,'这里的表格是教学演示'],
  ],
  'vents-summary':[
    [0,'返航前把三类内容分开'],[1,'本片的喷口、管虫和样本位置'],[2,'两瓶水的成分与热液影响范围'],
  ],
  'canyon-summary':[
    [0,'现在整理收获'],[1,'模型里的外形、站点和两瓶水'],[2,'哪种水体条件影响了群落分布'],
  ],
};
const freezeDeep=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freezeDeep);Object.freeze(value);}return value;};
export const directorLessonCues=freezeDeep(Object.fromEntries(Object.entries(phrases).map(([id,items])=>[id,items.map(([step,quote],index)=>({id:`${id}:lesson:${index}`,step,quote}))])));
