// SPDX-License-Identifier: GPL-3.0-only
// Exact, ordered narration anchors. Audio alignment supplies time; no guessed seconds.
// Targets retain their authored world positions. ROV cues address the live vehicle
// through kind:'rov', so their targetIds are empty rather than a fabricated station.
// Water movement, settling particles and hidden mechanisms are explanatory only.

const freezeDeep=value=>{
  if(value&&typeof value==='object'){Object.values(value).forEach(freezeDeep);Object.freeze(value);}
  return value;
};

export const environmentCueTracks=freezeDeep({
  'env-vents-overview':[
    {id:'env-vents-overview-ridge',quote:'你现在来到热液之境，是一片设定在约两千六百米深的虚构火山岩脊',kind:'overview',targetIds:['basalt','crest'],label:'热液岩脊总览',detail:'对照低矮岩脊与开阔岩面，区别于峡谷的高壁深槽。'},
    {id:'env-vents-overview-basalt',quote:'这里用玄武岩台地、裂隙和喷口',kind:'seabed',targetIds:['basalt','crest','chimney'],label:'台地、裂隙与喷口',detail:'分别辨认玄武岩台地、岩面裂隙和标记出的矿物烟囱。',secondaryKinds:['vent']},
    {id:'env-vents-overview-outlet',quote:'说明地下热液怎样进入海洋。',kind:'vent',targetIds:['chimney','plume'],label:'热液进入海洋的出口',detail:'看已标记的喷口与羽流，地下通道属于原理解读。'},
    {id:'env-vents-overview-model',quote:'地貌没有对应真实海域，纵向比例也经过压缩',kind:'overview',targetIds:['basalt','crest'],label:'地形与深度为教学设定',detail:'继续对照整片岩脊；模型坐标和压缩高度不是真实水深。'}
  ],
  'env-vents-water':[
    {id:'env-vents-water-background',quote:'热液之境首先仍是深海：阳光照不到这里，周围海水通常寒冷，水压随水深增加。',kind:'overview',targetIds:['basalt','flank'],label:'深海背景示意',detail:'观察远离喷口的岩面与水体，黑暗、高压和低温是环境概念。'},
    {id:'env-vents-water-local-heat',quote:'喷口附近有热流，不等于整片海都是热水，也不代表海水没有氧气。',kind:'vent',targetIds:['chimney','plume'],label:'局部热流示意',detail:'只看喷口附近的热液作用，不把整片海域解释成热水或无氧区。'},
    {id:'env-vents-water-mixing',quote:'热液与冷海水混合，会让不同位置的条件很不一样。',kind:'current',targetIds:['plume','chimney'],label:'冷热水混合示意',detail:'对照羽流外缘与周围水体；流动颜色不代表量测温度或方向。',secondaryKinds:['vent']},
    {id:'env-vents-water-light',quote:'画面里的灯光帮助我们观察',kind:'rov',targetIds:[],label:'潜器灯光观察',detail:'看当前潜器的灯光与照亮区域，教学读数不能替代传感器测量。'}
  ],
  'env-vents-circulation':[
    {id:'env-vents-circulation-cracks',quote:'在热液之境，玄武岩台地上的裂隙代表海水进入地下的通道。',kind:'seabed',targetIds:['basalt','crest'],label:'玄武岩台地与裂隙',detail:'对照台地与岩面裂隙，先分清地表形态和地下过程。'},
    {id:'env-vents-circulation-inflow',quote:'真实热液系统中，海水沿裂缝下渗',kind:'current',targetIds:['basalt'],label:'海水下渗示意',detail:'沿台地裂隙理解海水进入地下的路径，不把箭头当实测流向。'},
    {id:'env-vents-circulation-reaction',quote:'被地下热岩石加热，并与周围岩石反应，带上溶解的物质',kind:'seabed',targetIds:['basalt'],label:'地下受热与反应示意',detail:'在裂隙位置理解地下受热和水岩反应；隐藏过程不是表面直接可见的事实。'},
    {id:'env-vents-circulation-outflow',quote:'再沿通道上涌。热液是这种水，喷口是它返回海洋的出口',kind:'vent',targetIds:['chimney'],label:'热液上涌与喷口示意',detail:'从地下过程转向已标记喷口，分清热液是水、喷口是出口。'},
    {id:'env-vents-circulation-evidence',quote:'看见一条裂缝，并不能证明那里正在喷热水。',kind:'vent',targetIds:['chimney'],label:'喷流判断需要证据',detail:'继续观察已标记喷口；其他裂隙的外观本身不能证明存在热液。'}
  ],
  'env-vents-minerals':[
    {id:'env-vents-minerals-chimney',quote:'热液之境的黑烟囱，不是在海底燃烧。',kind:'vent',targetIds:['chimney'],label:'矿物烟囱',detail:'先看固定的岩柱状烟囱；这里没有燃烧或火焰事件。'},
    {id:'env-vents-minerals-mixing',quote:'含有溶解物质的热液从出口流出，与冷海水混合后',kind:'current',targetIds:['chimney','plume'],label:'出口冷热混合示意',detail:'观察出口到羽流外缘的混合关系，流动只是原理示意。',secondaryKinds:['vent']},
    {id:'env-vents-minerals-particles',quote:'一些矿物形成细小固体颗粒，悬浮起来像黑烟',kind:'vent',targetIds:['plume','chimney'],label:'悬浮矿物颗粒示意',detail:'看出口上方扩散的羽流，黑色表示矿物颗粒的视觉示意。'},
    {id:'env-vents-minerals-deposition',quote:'另一些矿物沉在出口周围，逐渐垒成烟囱。',kind:'vent',targetIds:['chimney'],label:'烟囱沉积生长示意',detail:'把视线回到固体岩柱与出口边缘，理解矿物沉积形成烟囱。'},
    {id:'env-vents-minerals-distinction',quote:'黑色羽流、流动的水和固体岩柱要分开看',kind:'vent',targetIds:['chimney','plume'],label:'岩柱、热水和颗粒',detail:'继续对照同一组对象，不能凭羽流颜色读出水温或具体成分。'}
  ],
  'env-vents-life':[
    {id:'env-vents-life-setting',quote:'热液之境展示了一种没有阳光也能获得食物的方式',kind:'vent',targetIds:['chimney','garden'],label:'热液群落的能量背景',detail:'对照喷口与管虫群落的位置，开始理解这一环境的食物来源。',secondaryKinds:['biology']},
    {id:'env-vents-life-microbes',quote:'某些微生物利用化学反应释放的能量，制造有机物，这叫化能合成。',kind:'biology',targetIds:['garden'],label:'微生物制造养分示意',detail:'养分关系是原理示意，不能从管虫模型表面直接看见微生物。'},
    {id:'env-vents-life-symbiosis',quote:'这里的管虫以具有共生细菌的热液管虫为例，细菌在体内提供养分。',kind:'biology',targetIds:['garden'],label:'管虫与共生细菌示意',detail:'观察管体与红色冠部，并用示意关系理解体内共生供养。'},
    {id:'env-vents-life-limit',quote:'管虫不是直接吃黑烟或热量',kind:'biology',targetIds:['garden'],label:'食物关系的适用范围',detail:'继续看这一管虫示例，不把黑烟当食物，也不代表所有深海生命。'}
  ],
  'env-vents-investigation':[
    {id:'env-vents-investigation-question',quote:'在热液之境，我们想调查热液怎样影响周围水体。',kind:'vent',targetIds:['chimney','plume'],label:'热液影响调查问题',detail:'先看喷口与可见羽流，化学影响范围不能只凭外形判断。'},
    {id:'env-vents-investigation-images',quote:'照片记录烟囱、羽流和管虫的位置',kind:'overview',targetIds:['chimney','plume','garden'],label:'照片保存对象与位置',detail:'按实体标记分别核对烟囱、羽流和管虫，不把它们移动到同一处。',secondaryKinds:['vent','biology']},
    {id:'env-vents-investigation-analysis',quote:'水样留给后续检测；两者回答的问题不同。',kind:'sampling',targetIds:['plume','flank'],label:'水样留待分析',detail:'对照两处采水站，照片记录外观，水体成分仍需检测。'},
    {id:'env-vents-investigation-pair',quote:'喷口外缘和远处背景站都采水，保留编号、深度、时刻与方法',kind:'sampling',targetIds:['plume','flank'],label:'配对水样与条件',detail:'在真实站点位置核对A、B两处水样与采样记录，不自动取样或写报告。'},
    {id:'env-vents-investigation-evidence',quote:'还要重复采样、检查其他条件',kind:'sampling',targetIds:['plume','flank'],label:'采样证据边界',detail:'继续对照两处样本位置，模型与示例读数不是新的化验结论。'}
  ],
  'env-canyon-overview':[
    {id:'env-canyon-overview-identity',quote:'你现在来到峡谷回声，不是热液之境的海洋裂缝区。',kind:'overview',targetIds:['c-wall','c-channel'],label:'峡谷地貌总览',detail:'把高岩壁与弯曲深槽一起看，区别于另一场景的热液裂隙区。'},
    {id:'env-canyon-overview-depth',quote:'这是一条设定在约两千五百到三千米水深的虚构深海峡谷',kind:'wall',targetIds:['c-wall'],label:'虚构深海高壁',detail:'沿标记辨认谷壁，所说水深是教学背景，不由模型高度换算。'},
    {id:'env-canyon-overview-surfaces',quote:'主要看高岩壁、台面和弯曲谷底',kind:'seabed',targetIds:['c-wall','c-coral','c-channel'],label:'高壁、台面与谷底',detail:'分别核对岩壁、珊瑚台面和低处谷道的实体位置。',secondaryKinds:['wall']},
    {id:'env-canyon-overview-links',quote:'以及它们怎样影响水流、泥沙和生命分布。',kind:'current',targetIds:['c-channel','c-sand'],label:'水流与泥沙联系示意',detail:'看槽道与泥沙区域，流动关系只作示意，不代表测得的水流方向。'},
    {id:'env-canyon-overview-model',quote:'地形不是实测海域，纵向也经过压缩',kind:'overview',targetIds:['c-wall','c-channel'],label:'模型比例与水深边界',detail:'继续对照整体地形，不能把模型坐标或相机高度当作真实水深。'}
  ],
  'env-canyon-depth':[
    {id:'env-canyon-depth-light',quote:'在这条模拟深海峡谷里，阳光已经无法照到海床，潜器靠灯光拍摄。',kind:'rov',targetIds:[],label:'潜器灯光与相机',detail:'看当前潜器的灯与镜头，亮区来自观察照明而不是海面阳光。'},
    {id:'env-canyon-depth-conditions',quote:'深层海水通常寒冷，但并非整个海洋都固定在同一个温度',kind:'overview',targetIds:['c-wall','c-channel'],label:'深海环境条件示意',detail:'以周围水体理解寒冷与高压概念，不从画面推算温度或压力数值。'},
    {id:'env-canyon-depth-life',quote:'黑暗和高压不等于没有生命，也不能据此断定没有氧气。',kind:'biology',targetIds:['c-coral','c-sponge'],label:'深海仍有生命',detail:'按群落标记寻找珊瑚和海绵；它们的模型不能测量氧气含量。'},
    {id:'env-canyon-depth-forms',quote:'你看到的珊瑚和海绵',kind:'biology',targetIds:['c-coral','c-sponge'],label:'珊瑚与海绵形态',detail:'在各自原有岩面位置辨认枝状、管状和杯状形态，不移到当前谷底。'}
  ],
  'env-canyon-landforms':[
    {id:'env-canyon-landforms-wall',quote:'峡谷回声里，陡壁',kind:'wall',targetIds:['c-wall'],label:'谷壁陡坡',detail:'按谷壁标记观察抬升岩面与陡坡。'},
    {id:'env-canyon-landforms-surfaces',quote:'岩石台面和低处泥沙，代表不同的海床表面。',kind:'seabed',targetIds:['c-coral','c-fan','c-sand','c-channel'],label:'台面与谷底泥沙',detail:'分别对照较高岩石台面、泥沙区域和谷道，不混同不同表面。'},
    {id:'env-canyon-landforms-transport',quote:'真实海底的水流能够搬运、重新扬起和沉积泥沙',kind:'current',targetIds:['c-channel','c-sand'],label:'搬运与沉积示意',detail:'对照泥沙与槽道，短程粒子仅解释搬运，不表示量测流向。',secondaryKinds:['seabed']},
    {id:'env-canyon-landforms-gravity',quote:'含沙较多、密度较大的水体还可能在重力作用下沿坡下行，称为浑浊流',kind:'current',targetIds:['c-channel','c-fan'],label:'浑浊流原理示意',detail:'理解含沙水体沿示意坡面下行，不声称当前峡谷正在发生浑浊流。',secondaryKinds:['seabed']},
    {id:'env-canyon-landforms-limit',quote:'但本片只演示地貌关系，不能看着模型就认定某次地震或某一种水流造出了它。',kind:'current',targetIds:['c-channel','c-fan'],label:'塑造过程仅作示意',detail:'继续对照前述槽道与泥沙，单凭外形不能断定形成事件。',secondaryKinds:['seabed']}
  ],
  'env-canyon-food':[
    {id:'env-canyon-food-current',quote:'峡谷回声里的水不是静止背景。',kind:'current',targetIds:['c-channel','c-sand'],label:'水流运输示意',detail:'看水体中示意颗粒的输送，真实流向和输送量仍需测量。'},
    {id:'env-canyon-food-snow',quote:'含有表层有机碎屑的颗粒不断下沉，常被称为海洋雪，并不是冰雪。',kind:'snow',targetIds:['c-channel'],label:'海洋雪下沉示意',detail:'观察向海床沉降的示意颗粒，不将其当作冰雪或已鉴定的颗粒成分。'},
    {id:'env-canyon-food-feeding',quote:'冷水珊瑚和许多海绵能够从流经身边的水中取食。',kind:'biology',targetIds:['c-coral','c-sponge'],label:'珊瑚与海绵取食示意',detail:'沿真实群落标记看枝条和杯管形态，水流与供食关系为示意。',secondaryKinds:['current']},
    {id:'env-canyon-food-limit',quote:'本场景没有设置热液喷口',kind:'biology',targetIds:['c-coral','c-sponge'],label:'当前峡谷的食物来源',detail:'继续观察珊瑚与海绵，不把热液管虫的化能供食过程套用到这里。'}
  ],
  'env-canyon-habitat':[
    {id:'env-canyon-habitat-community',quote:'在峡谷回声里找生命，先看它附着的表面，再看周围水体。',kind:'biology',targetIds:['c-coral','c-sponge'],label:'群落与附着表面',detail:'先按实体标记找到群落，再对照各自所处岩面和水体。'},
    {id:'env-canyon-habitat-rock',quote:'暴露岩面能提供附着位置',kind:'wall',targetIds:['c-wall','c-coral'],label:'暴露岩面与台阶',detail:'观察岩壁及珊瑚下方的岩石台面，辨认可附着的表面。'},
    {id:'env-canyon-habitat-mud',quote:'泥沙覆盖的谷底则是另一种栖息环境。',kind:'seabed',targetIds:['c-sand','c-channel'],label:'泥沙槽道与谷底',detail:'将低处泥沙表面与较高群落台面分开看，不改变海绵原有位置。'},
    {id:'env-canyon-habitat-light',quote:'画面的亮区来自潜器灯光和教学照明，不是阳光照进深谷。',kind:'rov',targetIds:[],label:'观察灯光示意',detail:'看当前潜器照明范围，亮度不能证明自然光照或群落分布原因。'},
    {id:'env-canyon-habitat-evidence',quote:'珊瑚在某处出现，可能与表面、水流和食物有关',kind:'biology',targetIds:['c-coral','c-sponge'],label:'群落分布线索',detail:'回到群落的真实位置比较所在表面，模型外形不能证明分布原因。'}
  ],
  'env-canyon-investigation':[
    {id:'env-canyon-investigation-question',quote:'在峡谷回声，我们要把群落、海床和水体放在一起调查。',kind:'overview',targetIds:['c-coral','c-sponge','c-channel'],label:'群落、海床与水体',detail:'分别对照群落标记与谷道，理解调查对象之间的位置联系。'},
    {id:'env-canyon-investigation-images',quote:'照片保留珊瑚、海绵及其附着表面的样子',kind:'biology',targetIds:['c-coral','c-sponge'],label:'群落与岩面影像',detail:'在群落各自台面位置观察外形和附着表面，不移动对象来凑构图。'},
    {id:'env-canyon-investigation-pair',quote:'两处水样则用同一检测方法比较水体指标。',kind:'sampling',targetIds:['c-fan','c-channel'],label:'同类水样A与B',detail:'找到两个原有采水站，水样与水样比较相同指标。'},
    {id:'env-canyon-investigation-conditions',quote:'取样必须保留位置、深度、时刻和编号，还要考虑两站条件不同。',kind:'sampling',targetIds:['c-fan','c-channel'],label:'样本与条件记录',detail:'核对站位和记录，不用模型Y坐标判定哪瓶真实水样更深。'},
    {id:'env-canyon-investigation-analysis',quote:'回到船上继续分析和重复观测，才可能检验原因',kind:'sampling',targetIds:['c-fan','c-channel'],label:'水样仍待分析',detail:'继续对照A、B采水站，模拟读数不等于化验结果或因果结论。'}
  ]
});
