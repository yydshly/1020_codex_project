// SPDX-License-Identifier: GPL-3.0-only
// Authored teaching narration. Audio durations are derived separately; stable IDs bind all adapters.

const freezeDeep=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freezeDeep);Object.freeze(value);}return value;};

export const directorMissionBriefs=freezeDeep({
  "vents": {
    "title": "黑烟囱怎样形成，生命靠什么",
    "kicker": "热液之境 / 一次近底科考",
    "location": "一片虚构的深海火山岩脊，海底有热水喷口。",
    "role": "跟随水面科考船放出的黄色无人潜器，一起下到海床。",
    "mission": "先弄懂热液、矿物烟囱和食物来源三个原理，再演示近、远同类水样怎样配对，分清已有知识与待检验问题。",
    "notice": "本片为教学模拟，站位、水深、时间、读数与演示样本为设计数据；纵向距离已压缩。原理解释来自公开科学知识，演示数值与记录不能证明新的实测结论。"
  },
  "canyon": {
    "title": "生命住在哪里，怎样做比较",
    "kicker": "峡谷回声 / 从岩壁到谷底",
    "location": "一条虚构的深海峡谷，有陡峭岩壁、岩石台面和泥沙海床。",
    "role": "跟随黄色无人潜器，从水面科考船出发，沿岩壁进入峡谷。",
    "mission": "认识栖息表面与食物来源，记录珊瑚和海绵，再用台面侧、深谷侧的同类水样学习如何比较和保留条件差异。",
    "notice": "本片为教学模拟，站位、水深、时间、读数和演示样本为设计数据；纵向距离已压缩，模型仅表现形态。真实的群落分布原因需要检测、重复采样和更充分的资料。"
  }
});

const shotsByMission=freezeDeep({
  "vents": [
    {
      "id": "vents-establish",
      "duration": 18,
      "entityId": "landing",
      "eventId": "v-arrive",
      "framing": "establishing",
      "title": "出发前，先带上三个问题",
      "narration": "船上的人把黄色无人潜器放下海。我们选这片已有裂缝和喷流迹象的岩脊，要弄懂三个问题：热水从哪里来，黑烟囱怎样长成，没有阳光的管虫靠什么生活。随后再采近、远两瓶水，学习怎样把问题变成一次可比较的调查。",
      "objective": "记住热水、黑烟囱和食物这三个问题。",
      "callouts": [
        {
          "label": "跟谁去",
          "detail": "跟随母船放出的黄色无人潜器。"
        },
        {
          "label": "这次要懂什么",
          "detail": "热水来源、烟囱形成、生命的食物来源。"
        }
      ],
      "learning": "mission",
      "explanation": null
    },
    {
      "id": "vents-equipment",
      "duration": 42,
      "entityId": "landing",
      "eventId": "v-arrive",
      "framing": "detail",
      "title": "潜器带什么，船上做什么",
      "narration": "人留在母船上，黄色遥控无人潜器不载人。灯光和相机让操作员看清海床，声呐帮助辨认方位和障碍；推进器负责移动、转向和悬停。浮力材料托住机体，耐压舱保护电子设备。脐带输送电力和指令，并把画面传回船上控制台。机械臂操作工具，随身的小型采水瓶封住水样；海底的采水站是提前布放的设备。船员用绞车放下和收回潜器。看清目标、稳住位置、操作取样，需要这套设备共同配合；画面和读数仍为教学模拟。",
      "objective": "找到随身设备、连接母船的脐带和提前布放的采水站。",
      "callouts": [
        {
          "label": "潜器随身设备",
          "detail": "灯光相机看，声呐辅助辨位，推进器稳住，机械臂与小采水瓶操作。"
        },
        {
          "label": "母船与预置设备",
          "detail": "脐带传电传令回图，绞车布放回收；海底采水站提前布放。"
        }
      ],
      "learning": "equipment",
      "explanation": "equipment"
    },
    {
      "id": "vents-approach",
      "duration": 16,
      "entityId": "basalt",
      "eventId": "v-map",
      "framing": "approach",
      "title": "下到海床，先找裂缝",
      "narration": "跟着黄色潜器往下走，四周越来越暗。深海没有阳光，潜器靠前面的灯照亮海床。现在能看到起伏的岩脊和裂缝，我们贴着岩面向前寻找，看看黑色水流究竟从哪里冒出来。",
      "objective": "跟着灯光，看清岩脊与裂缝，寻找热水出口。",
      "callouts": [
        {
          "label": "潜器探照灯",
          "detail": "照亮眼前的岩石和海床。"
        },
        {
          "label": "海底岩脊",
          "detail": "潜器沿着起伏的岩面寻找喷口。"
        }
      ],
      "learning": null,
      "explanation": null
    },
    {
      "id": "vents-fluid",
      "duration": 22,
      "entityId": "basalt",
      "eventId": "v-map",
      "framing": "detail",
      "learning": "fluid",
      "explanation": "hydrothermal",
      "title": "地下的水怎样变成热液",
      "narration": "热液就是受地下热源加热、又与岩石发生反应的水。看这个剖面：冷海水沿裂缝下渗，在地下受热，带上与岩石反应产生的物质，再沿通道上涌。这是一套水的循环，我们接下来要找的喷口，就是它重新进入海洋的出口。",
      "objective": "沿冷水下渗、地下加热、热液上涌的箭头走一遍。",
      "callouts": [
        {
          "label": "冷海水下渗",
          "detail": "海水沿岩石裂缝进入地下。"
        },
        {
          "label": "热液重新上涌",
          "detail": "受热并与岩石反应后，从喷口回到海洋。"
        }
      ]
    },
    {
      "id": "vents-discover",
      "duration": 20,
      "entityId": "chimney",
      "eventId": "v-vent",
      "framing": "orbit",
      "title": "黑烟和烟囱是怎样形成的",
      "narration": "出口叫热液喷口。热水遇到冷海水后，一些矿物从水中析出，变成细小固体颗粒，悬浮时像黑烟，并不是燃烧或岩浆。另一些矿物沉在出口周围，逐层垒成中空烟囱。所以眼前的岩柱、流出的热水和黑色颗粒，是三个不同的东西。",
      "objective": "分清岩柱、热水和悬浮矿物颗粒。",
      "callouts": [
        {
          "label": "黑色羽流",
          "detail": "主要表现热液混合后析出的矿物颗粒。"
        },
        {
          "label": "矿物烟囱",
          "detail": "出口周围的矿物逐层沉积，形成中空岩柱。"
        }
      ],
      "learning": "smoker",
      "explanation": "black-smoker"
    },
    {
      "id": "vents-life",
      "duration": 20,
      "entityId": "garden",
      "eventId": "v-life",
      "framing": "detail",
      "title": "食物怎样从细菌到管虫",
      "narration": "热液中的某些物质与海水成分反应，可以释放化学能。一些微生物利用这种能量制造有机食物。这里以有共生细菌的热液管虫为例：细菌住在管虫体内并供给养分。管虫不是直接吃矿物；也不是所有深海生命都依靠热液。",
      "objective": "顺着化学能、微生物、共生管虫的关系看食物从哪里来。",
      "callouts": [
        {
          "label": "微生物制造食物",
          "detail": "用化学反应的能量制造有机物。"
        },
        {
          "label": "共生管虫示例",
          "detail": "某些热液管虫由体内共生细菌供养。"
        }
      ],
      "learning": "food",
      "explanation": "food-web"
    },
    {
      "id": "vents-investigate",
      "duration": 17,
      "entityId": "plume",
      "eventId": "v-plume",
      "framing": "compare",
      "title": "先取喷口外缘的A瓶水",
      "narration": "要比较热液对周围水体的影响，先在喷口外缘取A瓶水。点击演示采水，可以看瓶盖闭合，把这个位置的水封住，并记下站位、深度、时刻和编号。此时只有一个样本，还不能判断热液带来了什么变化，我们还需要另一瓶同类水。",
      "objective": "点击演示采水，查看A水样的站位和记录。",
      "callouts": [
        {
          "label": "A瓶：喷口外缘水",
          "detail": "水样与采样站位、深度、时刻、编号绑定。"
        },
        {
          "label": "一个样本不够",
          "detail": "还需要另一处按同样方法取得的水样。"
        }
      ],
      "learning": "sample-near",
      "explanation": null
    },
    {
      "id": "vents-background",
      "duration": 18,
      "entityId": "flank",
      "eventId": "v-background",
      "framing": "compare",
      "title": "再取远处的B瓶水",
      "narration": "现在远离喷口，在背景站再取B瓶水。这里同样使用采水瓶，让水和水按照相同方法比较，并记录站位、深度、时刻和编号。两处环境条件并不完全一样，因此样本不同也不能马上归因于热液，之后还要化验并重复采样。",
      "objective": "点击演示采水，完成与A瓶同类的B水样记录。",
      "callouts": [
        {
          "label": "B瓶：背景站水",
          "detail": "与A瓶同为水样，采用相同采样方法。"
        },
        {
          "label": "保留环境差异",
          "detail": "深度、时刻等条件也可能影响比较。"
        }
      ],
      "learning": "sample-far",
      "explanation": null
    },
    {
      "id": "vents-compare",
      "duration": 22,
      "entityId": "flank",
      "eventId": "v-background",
      "framing": "compare",
      "learning": "compare",
      "explanation": "comparison",
      "title": "两瓶水要怎样比较",
      "narration": "把A、B两瓶并排，先核对它们都是水样，再核对采样方法、深度和时刻。之后才比较化验得到的同一项成分。这里展示的是采样与比较的方法；若出现数值，都会标为教学示例。还要重复取样，不能凭两瓶水就宣布找到了原因。",
      "objective": "先核对是否可比，再区分记录、示例和待化验结果。",
      "callouts": [
        {
          "label": "同类、同指标",
          "detail": "水样与水样比较同一项检测结果。"
        },
        {
          "label": "差异不等于原因",
          "detail": "还需化验、重复采样和排除其他影响。"
        }
      ]
    },
    {
      "id": "vents-summary",
      "duration": 22,
      "entityId": "beacon",
      "eventId": "v-beacon",
      "framing": "compare",
      "learning": "summary",
      "explanation": "summary",
      "title": "哪些已知，哪些还没证明",
      "narration": "返航前把三类内容分开：热液循环、烟囱形成和化能合成，是已有科学知识；本片的喷口、管虫和样本位置，是模拟观察记录；两瓶水的成分与热液影响范围，仍需真实取样和化验才能回答。我们学会了调查方法，没有得到新的实测结论。",
      "objective": "把已有知识、模拟记录和待检验问题分别归位。",
      "callouts": [
        {
          "label": "已有科学知识",
          "detail": "解释热液、矿物烟囱与部分生命的供养机制。"
        },
        {
          "label": "本片没有实测结论",
          "detail": "演示样本与模拟读数不能证明新的科学发现。"
        }
      ]
    },
    {
      "id": "vents-depart",
      "duration": 18,
      "entityId": "beacon",
      "eventId": "v-beacon",
      "framing": "departure",
      "title": "带着记录返航",
      "narration": "潜器沿信标方向返回母船。这次我们回答了三个基础问题，也看懂了如何取得一对同类水样。真正调查还要分析样本、重复观测，结果才可能支持或否定原来的猜想。你可以回到任一章节继续看，演示采样不会替你写入个人报告。",
      "objective": "回想三个基础答案，并选出还需要真实证据的问题。",
      "callouts": [
        {
          "label": "三个基础答案",
          "detail": "热液循环、矿物沉积、微生物供养。"
        },
        {
          "label": "继续探索",
          "detail": "自由观察与个人记录仍由你自己决定。"
        }
      ],
      "learning": null,
      "explanation": null
    }
  ],
  "canyon": [
    {
      "id": "canyon-establish",
      "duration": 18,
      "entityId": "c-entry",
      "eventId": "c-arrive",
      "framing": "establishing",
      "title": "去峡谷，要弄懂哪三件事",
      "narration": "我们跟黄色无人潜器去一条峡谷。这里有岩壁、泥沙海床和不同群落，适合带着三个问题调查：生物住在什么表面，没有阳光时食物怎样送到，两个站点的水体能怎样比较。我们会拍摄、成对采水，再把知道的和待检验的分开。",
      "objective": "记住住在哪里、吃什么、怎样比较这三个问题。",
      "callouts": [
        {
          "label": "母船与潜器",
          "detail": "船上的人通过缆线接收水下画面。"
        },
        {
          "label": "三个调查问题",
          "detail": "栖息表面、食物来源、同类水样比较。"
        }
      ],
      "learning": "mission",
      "explanation": null
    },
    {
      "id": "canyon-equipment",
      "duration": 42,
      "entityId": "c-entry",
      "eventId": "c-arrive",
      "framing": "detail",
      "title": "潜器带什么，船上做什么",
      "narration": "人留在母船上，黄色遥控无人潜器不载人。灯光和相机让操作员看清海床，声呐帮助辨认方位和障碍；推进器负责移动、转向和悬停。浮力材料托住机体，耐压舱保护电子设备。脐带输送电力和指令，并把画面传回船上控制台。机械臂操作工具，随身的小型采水瓶封住水样；海底的采水站是提前布放的设备。船员用绞车放下和收回潜器。看清目标、稳住位置、操作取样，需要这套设备共同配合；画面和读数仍为教学模拟。",
      "objective": "找到随身设备、连接母船的脐带和提前布放的采水站。",
      "callouts": [
        {
          "label": "潜器随身设备",
          "detail": "灯光相机看，声呐辅助辨位，推进器稳住，机械臂与小采水瓶操作。"
        },
        {
          "label": "母船与预置设备",
          "detail": "脐带传电传令回图，绞车布放回收；海底采水站提前布放。"
        }
      ],
      "learning": "equipment",
      "explanation": "equipment"
    },
    {
      "id": "canyon-wall",
      "duration": 17,
      "entityId": "c-wall",
      "eventId": "c-wall-view",
      "framing": "orbit",
      "title": "先看岩壁和谷底在哪里",
      "narration": "现在来到峡谷岩壁旁。看潜器身后的陡壁，再看下方的深槽，就能知道我们正贴着一面很高的海底岩壁前进。先把岩壁、台面和裂缝拍清楚，后面发现生物时，才能知道它们住在什么地方。",
      "objective": "把潜器当参照，找出陡壁、台面和下方的深槽。",
      "callouts": [
        {
          "label": "陡峭岩壁",
          "detail": "潜器正沿着这面岩壁向前走。"
        },
        {
          "label": "下方的深槽",
          "detail": "接下来还会去看更低处的海床。"
        }
      ],
      "learning": "habitat",
      "explanation": null
    },
    {
      "id": "canyon-habitat",
      "duration": 22,
      "entityId": "c-wall",
      "eventId": "c-wall-view",
      "framing": "detail",
      "learning": "habitat",
      "explanation": "habitat",
      "title": "生物的住处包括什么",
      "narration": "栖息地不只是一个地名，还包括生物附着的表面、水体条件和食物怎样到达。岩壁与泥底提供不同表面，水流可以带来食物。我们先把这些情况记录下来；不能只看模型，就断定某种地形一定决定了哪种生物生活在这里。",
      "objective": "把附着表面、水流和食物一起看，而不只认地点名。",
      "callouts": [
        {
          "label": "附着的表面",
          "detail": "岩壁、岩石台面和泥沙海床并不相同。"
        },
        {
          "label": "食物与水体",
          "detail": "水流能带来食物，外形本身不能证明因果。"
        }
      ]
    },
    {
      "id": "canyon-coral",
      "duration": 19,
      "entityId": "c-coral",
      "eventId": "c-coral-view",
      "framing": "detail",
      "title": "珊瑚怎样在黑暗里取食",
      "narration": "这些像树枝一样展开的是冷水珊瑚的示意。深海里没有阳光，它们从流过身边的水里捕捉食物。潜器停在岩石台面旁拍摄，我们要记下珊瑚长什么样，也要记下它附着在哪一片岩面上。",
      "objective": "看清珊瑚的枝条，再看看它下面的岩石。",
      "callouts": [
        {
          "label": "枝状冷水珊瑚",
          "detail": "从流过身边的水里捕捉食物。"
        },
        {
          "label": "岩石台面",
          "detail": "记录珊瑚所在的这片岩面。"
        }
      ],
      "learning": "food",
      "explanation": null
    },
    {
      "id": "canyon-sediment",
      "duration": 18,
      "entityId": "c-fan",
      "eventId": "c-fan-view",
      "framing": "compare",
      "title": "先取靠近台面的A瓶水",
      "narration": "离开珊瑚台，我们来到靠近台面一侧的采水站。这里用采水瓶取A瓶水，并拍下周围海床。点击演示后，查看编号、站位、深度和时刻。照片能记录外形，水样能送去检测成分；它们回答不同问题，不能互相替代。",
      "objective": "点击演示，取得A水样并核对完整站位记录。",
      "callouts": [
        {
          "label": "A瓶：台面侧水",
          "detail": "使用采水瓶，保留位置、深度和时刻。"
        },
        {
          "label": "照片与水样",
          "detail": "照片记录外观，成分结果需要检测。"
        }
      ],
      "learning": "sample-near",
      "explanation": null
    },
    {
      "id": "canyon-channel",
      "duration": 17,
      "entityId": "c-channel",
      "eventId": "c-deep",
      "framing": "compare",
      "title": "再取深谷侧的B瓶水",
      "narration": "潜器进入更远的深谷通道，在这里再取B瓶水。它与A瓶都是水样，才能比较同一项水体指标。但这里更深，时刻也不同，这些条件必须记录下来。若两瓶有差别，还需要重复采样和更多控制，不能直接归因于周围群落。",
      "objective": "点击演示采水，核对B瓶与A瓶的共同点和条件差异。",
      "callouts": [
        {
          "label": "B瓶：深谷侧水",
          "detail": "与A瓶同类、同方法，比较相同检测项目。"
        },
        {
          "label": "深度也是条件",
          "detail": "深度、时刻等差异必须保留，不能忽略。"
        }
      ],
      "learning": "sample-far",
      "explanation": null
    },
    {
      "id": "canyon-compare",
      "duration": 22,
      "entityId": "c-channel",
      "eventId": "c-deep",
      "framing": "compare",
      "learning": "compare",
      "explanation": "comparison",
      "title": "比较之前先核对条件",
      "narration": "两瓶水摆在一起，先核对介质和方法，再看站位、深度与时刻。真正的成分差异要靠同一种检测方法得到。这里的表格是教学演示，即使出现示例数字，也不是刚测出的结果。它帮助我们提出下一次调查要控制什么，而不能替代证据。",
      "objective": "分清样本记录、教学示例与尚未取得的检测结果。",
      "callouts": [
        {
          "label": "同类样本比较",
          "detail": "用同种方法比较水样中的同一指标。"
        },
        {
          "label": "仍要真实检测",
          "detail": "示例数字不能当作本航次测量结果。"
        }
      ]
    },
    {
      "id": "canyon-sponges",
      "duration": 19,
      "entityId": "c-sponge",
      "eventId": "c-sponge-view",
      "framing": "detail",
      "title": "再看另一种住在海床的生命",
      "narration": "看，这片群落是一根根管子和张口的杯子，这是海绵的形态示意。海绵能从流经身体的水里获取食物。我们拍下它们，再回看刚才枝状的珊瑚，就有了两种生命和两处海床可以比较。",
      "objective": "找出管状和杯状海绵，想想它们与珊瑚外形有何不同。",
      "callouts": [
        {
          "label": "管状与杯状海绵",
          "detail": "从流经身体的水里获取食物。"
        },
        {
          "label": "和珊瑚一起比较",
          "detail": "既看外形，也看各自所在的海床。"
        }
      ],
      "learning": "habitat",
      "explanation": null
    },
    {
      "id": "canyon-summary",
      "duration": 22,
      "entityId": "c-marker",
      "eventId": "c-marker-view",
      "framing": "compare",
      "learning": "summary",
      "explanation": "summary",
      "title": "把照片、样本和答案分开",
      "narration": "现在整理收获：珊瑚和海绵能从水中获取食物，这是已有知识；模型里的外形、站点和两瓶水，是本片的模拟观察；哪种水体条件影响了群落分布，仍需要真实检测和更多站点。不能凭一段影片或几项模拟读数，就宣布找到了原因。",
      "objective": "分别说出已有知识、模拟记录和仍待检验的问题。",
      "callouts": [
        {
          "label": "我们已学会",
          "detail": "把群落、海床与采水位置放在一起观察。"
        },
        {
          "label": "原因尚待检验",
          "detail": "真实生态结论需要实地资料和更充分的调查。"
        }
      ]
    },
    {
      "id": "canyon-depart",
      "duration": 18,
      "entityId": "c-marker",
      "eventId": "c-marker-view",
      "framing": "departure",
      "title": "沿标记回船，留下下一问",
      "narration": "潜器沿归航标记返回母船。这次我们认清了岩壁、珊瑚和海绵，也学会把两瓶同类水样和各自的条件一起记录。回船以后，研究人员还要检测、复查和重复观测。你可以自由重访任一站点，个人报告仍由你决定记录什么。",
      "objective": "回想调查方法，选出一个还想用真实证据回答的问题。",
      "callouts": [
        {
          "label": "返航与复查",
          "detail": "照片、样本和站位记录需要一起检查。"
        },
        {
          "label": "自己继续探索",
          "detail": "演示记录不会自动写入个人报告。"
        }
      ],
      "learning": null,
      "explanation": null
    }
  ]
});

/** Return authored, deeply frozen shot data. Unknown missions are explicit errors. */
export function getDirectorShots(missionId){
  if(typeof missionId!=='string'||!Object.hasOwn(shotsByMission,missionId))throw new RangeError(`没有这个航次的导演脚本：${String(missionId)}`);
  return shotsByMission[missionId];
}
