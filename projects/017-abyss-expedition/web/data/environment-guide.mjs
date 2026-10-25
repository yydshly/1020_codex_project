// SPDX-License-Identifier: GPL-3.0-only
// Authored, independently playable environment narration. Reviewed 2026-10-25.
// Source material explains real concepts; scene depths, terrain and readings are teaching designs.
// entityIds are observation references, never an instruction to move the camera or ROV.

const freezeDeep=value=>{
  if(value&&typeof value==='object'){Object.values(value).forEach(freezeDeep);Object.freeze(value);}
  return value;
};

export const environmentSources=freezeDeep([
  {id:'noaa-deep-habitat',title:'NOAA · 深海生命面对的环境条件',url:'https://oceanexplorer.noaa.gov/ocean-fact/deep-habitat/'},
  {id:'noaa-canyons',title:'NOAA · 海底峡谷的地貌、泥沙与生命',url:'https://oceanexplorer.noaa.gov/expedition-feature/okeanos-ex1903-background-canyons/'},
  {id:'noaa-turbidity',title:'NOAA · 什么是浑浊流',url:'https://oceanservice.noaa.gov/facts/turbidity.html'},
  {id:'noaa-canyon-connectivity',title:'NOAA · 峡谷的附着表面、水流与食物联系',url:'https://oceanexplorer.noaa.gov/expedition-feature/okeanos-ex1905-background-connectivity/'},
  {id:'noaa-marine-snow',title:'NOAA · 海洋雪是什么',url:'https://oceanservice.noaa.gov/facts/marinesnow.html'},
  {id:'noaa-corals',title:'NOAA · 深冷黑暗水域中的珊瑚',url:'https://oceanexplorer.noaa.gov/ocean-fact/coral-water/'},
  {id:'noaa-sponges',title:'NOAA · 海绵怎样获得食物与氧气',url:'https://oceanexplorer.noaa.gov/ocean-fact/sponge-diversity/'},
  {id:'whoi-vents',title:'WHOI · 热液循环、矿物烟囱与生命',url:'https://www.whoi.edu/ocean-learning-hub/ocean-topics/how-the-ocean-works/seafloor-below/hydrothermal-vents/'},
  {id:'whoi-vent-basics',title:'WHOI Dive and Discover · 热液喷口与冷热混合',url:'https://www.divediscover.whoi.edu/interactives/VentBasics.html'},
  {id:'noaa-chemosynthesis',title:'NOAA · 光合作用与化能合成',url:'https://oceanexplorer.noaa.gov/ocean-fact/photochemo/'},
  {id:'noaa-ctd',title:'NOAA · 水体测量、深度与采水',url:'https://oceanexplorer.noaa.gov/technology/ctd/'},
  {id:'noaa-rov',title:'NOAA · 遥操作潜器的拍摄与取样工作',url:'https://oceanexplorer.noaa.gov/technology/subs-rovs/'}
]);

export const environmentGuides=freezeDeep({
  vents:{
    title:'热液之境：冷深海中的热液环境',
    intro:'先认识深海背景，再看岩石裂隙、热液混合和生命供食。这里是虚构热液岩脊，区别于峡谷回声的谷壁与深槽。',
    chapters:[
      {
        id:'env-vents-overview',
        title:'这里是热液岩脊，不是深海峡谷',
        summary:'当前场景设定在约2600米深的虚构火山岩脊，模型坐标不是真实水深。',
        narration:'你现在来到热液之境，是一片设定在约两千六百米深的虚构火山岩脊，不是峡谷回声里的深槽和谷壁。这里用玄武岩台地、裂隙和喷口，说明地下热液怎样进入海洋。地貌没有对应真实海域，纵向比例也经过压缩；驾驶台的模型坐标，不能直接换算成真实水深。',
        lookFor:['低矮岩脊与玄武岩台地，区别于峡谷高壁。','岩面裂隙与独立的矿物烟囱。','潜器与站点的位置关系；坐标仅为模型单位。'],
        sourceIds:['whoi-vents','noaa-deep-habitat'],
        entityIds:['landing','basalt','chimney']
      },
      {
        id:'env-vents-water',
        title:'热喷口周围，仍是寒冷深海',
        summary:'深海黑暗、高压且通常寒冷，喷口热流只是局部环境。',
        narration:'热液之境首先仍是深海：阳光照不到这里，周围海水通常寒冷，水压随水深增加。喷口附近有热流，不等于整片海都是热水，也不代表海水没有氧气。热液与冷海水混合，会让不同位置的条件很不一样。画面里的灯光帮助我们观察，温度和坐标读数只是教学设定，不能代替传感器测量。',
        lookFor:['潜器照亮的海床；亮区不是海面阳光。','喷口附近与远处背景站的空间距离。','羽流与周围水体的边界示意，不据颜色读温度。'],
        sourceIds:['noaa-deep-habitat','whoi-vent-basics','noaa-sponges'],
        entityIds:['landing','plume','flank']
      },
      {
        id:'env-vents-circulation',
        title:'裂隙怎样连起地下水循环',
        summary:'海水下渗、受热并与岩石反应，再以热液形式回到海洋。',
        narration:'在热液之境，玄武岩台地上的裂隙代表海水进入地下的通道。真实热液系统中，海水沿裂缝下渗，被地下热岩石加热，并与周围岩石反应，带上溶解的物质，再沿通道上涌。热液是这种水，喷口是它返回海洋的出口；看见一条裂缝，并不能证明那里正在喷热水。',
        lookFor:['台地与岩脊上的裂隙形态。','裂隙和喷口的位置；地下通道在此只作原理解读。','喷口是出口，热液是水，二者不要混为一物。'],
        sourceIds:['whoi-vents','whoi-vent-basics'],
        entityIds:['basalt','crest','chimney']
      },
      {
        id:'env-vents-minerals',
        title:'黑烟、热水和岩柱分开看',
        summary:'冷热混合形成悬浮矿物颗粒，出口周围沉积的矿物构成烟囱。',
        narration:'热液之境的黑烟囱，不是在海底燃烧。含有溶解物质的热液从出口流出，与冷海水混合后，一些矿物形成细小固体颗粒，悬浮起来像黑烟；另一些矿物沉在出口周围，逐渐垒成烟囱。黑色羽流、流动的水和固体岩柱要分开看，不能凭颜色判断水温或具体成分。',
        lookFor:['中空岩柱状的矿物烟囱。','从出口扩散的黑色羽流示意。','固定岩柱与流动羽流的区别；黑色不是火焰。'],
        sourceIds:['whoi-vents','whoi-vent-basics'],
        entityIds:['chimney','plume']
      },
      {
        id:'env-vents-life',
        title:'没有阳光，管虫的食物从哪来',
        summary:'部分热液食物网以化能合成微生物为基础，某些管虫靠共生细菌供养。',
        narration:'热液之境展示了一种没有阳光也能获得食物的方式：某些微生物利用化学反应释放的能量，制造有机物，这叫化能合成。这里的管虫以具有共生细菌的热液管虫为例，细菌在体内提供养分。管虫不是直接吃黑烟或热量；这种供食方式只解释本片的热液群落，不能代表所有深海生命。',
        lookFor:['喷口旁管虫的管体与红色冠部形态示意。','群落与喷口的相对位置，不将模型间距当实测结果。','微生物及共生关系无法靠外形直接看见，需要原理与证据。'],
        sourceIds:['noaa-chemosynthesis','whoi-vents'],
        entityIds:['garden','chimney']
      },
      {
        id:'env-vents-investigation',
        title:'怎样调查热液影响了哪些水体',
        summary:'照片保存空间线索，近远同类水样与重复分析才能继续检验问题。',
        narration:'在热液之境，我们想调查热液怎样影响周围水体。照片记录烟囱、羽流和管虫的位置，水样留给后续检测；两者回答的问题不同。喷口外缘和远处背景站都采水，保留编号、深度、时刻与方法，才能比较同一指标。还要重复采样、检查其他条件；本片的模型和示例读数不会产生新的实测结论。',
        lookFor:['A站在喷口外缘，B站远离可见羽流。','两站均使用采水装置，水样与水样比较。','照片、站位、编号与待化验结果是不同记录。'],
        sourceIds:['noaa-ctd','noaa-rov','whoi-vents'],
        entityIds:['plume','flank','beacon']
      }
    ]
  },
  canyon:{
    title:'峡谷回声：岩壁、水流和深海生命',
    intro:'峡谷不等于热液裂隙区。把地形、水流、泥沙、食物和栖息地连起来看，才知道为何要拍摄与配对采水。',
    chapters:[
      {
        id:'env-canyon-overview',
        title:'你在深海峡谷，不在热液裂缝区',
        summary:'当前是约2500—3000米水深的虚构峡谷，重点是谷壁、水流、泥沙与生命。',
        narration:'你现在来到峡谷回声，不是热液之境的海洋裂缝区。这是一条设定在约两千五百到三千米水深的虚构深海峡谷，主要看高岩壁、台面和弯曲谷底，以及它们怎样影响水流、泥沙和生命分布。地形不是实测海域，纵向也经过压缩；模型坐标和机位高度，不能直接当成真实水深。',
        lookFor:['两侧高岩壁，而不是热液场的低岩脊。','沿场景弯曲延伸的深槽与谷底。','岩石台面、泥沙海床和附着群落的位置关系。'],
        sourceIds:['noaa-canyons','noaa-canyon-connectivity'],
        entityIds:['c-entry','c-wall','c-channel']
      },
      {
        id:'env-canyon-depth',
        title:'黑暗、寒冷和高压意味着什么',
        summary:'深海环境需要适应，黑暗不等于无生命或无氧，温度也不是处处相同。',
        narration:'在这条模拟深海峡谷里，阳光已经无法照到海床，潜器靠灯光拍摄。深层海水通常寒冷，但并非整个海洋都固定在同一个温度；水压则随深度增加。黑暗和高压不等于没有生命，也不能据此断定没有氧气。你看到的珊瑚和海绵，是用来认识适应深海环境的不同生命形态。',
        lookFor:['潜器前方的灯和镜头。','岩面上的珊瑚与海床上的海绵形态。','照明明暗属于观察方式，不是氧气或温度测量。'],
        sourceIds:['noaa-deep-habitat','noaa-corals','noaa-sponges'],
        entityIds:['c-entry','c-coral','c-sponge']
      },
      {
        id:'env-canyon-landforms',
        title:'岩壁、台面和泥沙怎样联系',
        summary:'搬运、侵蚀与沉积可长期塑造峡谷，模型外形不能证明具体成因。',
        narration:'峡谷回声里，陡壁、岩石台面和低处泥沙，代表不同的海床表面。真实海底的水流能够搬运、重新扬起和沉积泥沙；含沙较多、密度较大的水体还可能在重力作用下沿坡下行，称为浑浊流，这类过程能长期侵蚀和塑造峡谷。但本片只演示地貌关系，不能看着模型就认定某次地震或某一种水流造出了它。',
        lookFor:['谷壁的陡坡与伸出的岩石台面。','谷底和扇状区域的泥沙表面示意。','弯曲通道串起高低地形，但没有演示真实成因事件。'],
        sourceIds:['noaa-turbidity','noaa-canyons'],
        entityIds:['c-wall','c-fan','c-sand','c-channel']
      },
      {
        id:'env-canyon-food',
        title:'水流和海洋雪怎样带来食物',
        summary:'沉降有机物与水流运输支持许多深海生命，海洋雪不是冰雪。',
        narration:'峡谷回声里的水不是静止背景。水流可以带来悬浮食物，也会把落下的颗粒再次带起；含有表层有机碎屑的颗粒不断下沉，常被称为海洋雪，并不是冰雪。冷水珊瑚和许多海绵能够从流经身边的水中取食。本场景没有设置热液喷口，不应把另一场景的化能合成供食过程套到这里。',
        lookFor:['灯光中漂浮的颗粒示意，不能靠颜色辨认成分。','珊瑚枝条伸向水体，海绵呈管状或杯状。','群落所在岩面与泥沙海床；本场景没有黑烟囱。'],
        sourceIds:['noaa-marine-snow','noaa-canyons','noaa-sponges'],
        entityIds:['c-coral','c-sponge','c-sand']
      },
      {
        id:'env-canyon-habitat',
        title:'看见生命，还要看它住在哪里',
        summary:'附着表面、水流和食物共同提供观察线索，灯光亮区不是自然光照带。',
        narration:'在峡谷回声里找生命，先看它附着的表面，再看周围水体。暴露岩面能提供附着位置，泥沙覆盖的谷底则是另一种栖息环境。画面的亮区来自潜器灯光和教学照明，不是阳光照进深谷。珊瑚在某处出现，可能与表面、水流和食物有关；一张模型画面只能提出线索，不能证明分布原因。',
        lookFor:['珊瑚下方的岩石台面。','海绵群落与泥沙、岩面的相对位置。','照亮区域随观察角度变化，群落位置不会因此变成自然光照证据。'],
        sourceIds:['noaa-canyon-connectivity','noaa-canyons','noaa-corals'],
        entityIds:['c-wall','c-coral','c-sponge']
      },
      {
        id:'env-canyon-investigation',
        title:'为什么拍照、配对采水再回船分析',
        summary:'把群落照片、位置与同类水样连接起来，保留差异并等待检测。',
        narration:'在峡谷回声，我们要把群落、海床和水体放在一起调查。照片保留珊瑚、海绵及其附着表面的样子，两处水样则用同一检测方法比较水体指标。取样必须保留位置、深度、时刻和编号，还要考虑两站条件不同。回到船上继续分析和重复观测，才可能检验原因；画面里的模拟读数不是化验结果。',
        lookFor:['台面侧A站与深谷侧B站的位置差别。','两处都采水，不把泥样替代另一瓶水。','照片描述外观，编号和站位关联样本，成分仍待分析。'],
        sourceIds:['noaa-ctd','noaa-rov','noaa-canyon-connectivity'],
        entityIds:['c-fan','c-channel','c-marker']
      }
    ]
  }
});
