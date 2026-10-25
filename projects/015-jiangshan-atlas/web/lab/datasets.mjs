// SPDX-License-Identifier: GPL-3.0-only
// Fictional teaching fixtures. Positions are normalized diagram coordinates, not geography.
export const datasets = {
  delivery: {
    id:'delivery',title:'物流流转',unit:'小时',min:0,max:12,
    description:'一件样例包裹从揽收到签收。位置是流程示意，时间为虚构教学数据。',
    phases:[{id:'collection',from:0,to:3,label:'揽收阶段'},{id:'sorting',from:3,to:7,label:'分拨阶段'},{id:'transport',from:7,to:11,label:'运输阶段'},{id:'received',from:11,to:13,label:'签收阶段'}],
    entities:[{id:'origin',label:'揽收点',position:[.12,.64]},{id:'hub',label:'分拨中心',position:[.36,.29]},{id:'transfer',label:'干线中转',position:[.65,.55]},{id:'destination',label:'派送站',position:[.88,.25]},{id:'reserve',label:'备用站（暂无事件）',position:[.35,.88]}],
    events:[{id:'picked',time:0,entityId:'origin',title:'包裹已揽收',detail:'同一个事件同时确定时间和当前节点。图示、时间轴、说明卡读取同一个状态。'},{id:'sorted',time:3,entityId:'hub',title:'抵达分拨中心',detail:'第 3 小时属于新的分拨阶段：[0,3) 已结束，[3,7) 开始。边界归属由数据规则决定。'},{id:'departed',time:7,entityId:'transfer',title:'进入干线运输',detail:'选中这个事件后，时间跳到 7，阶段切到运输，当前节点与已发生事件同步更新。'},{id:'received',time:11,entityId:'destination',title:'包裹已签收',detail:'最后一个事件之后仍可查看第 12 小时。事件导航到边界时停止，时间轴仍在有效范围内。'}]
  },
  release: {
    id:'release',title:'项目迭代',unit:'天',min:0,max:14,
    description:'一个虚构的小项目从需求到发布。使用相同核心和界面，仅替换这份数据。',
    phases:[{id:'discovery',from:0,to:4,label:'需求阶段'},{id:'prototype',from:4,to:8,label:'原型阶段'},{id:'integration',from:8,to:12,label:'联调阶段'},{id:'release',from:12,to:15,label:'发布阶段'}],
    entities:[{id:'brief',label:'需求确认',position:[.12,.28]},{id:'prototype',label:'交互原型',position:[.37,.65]},{id:'integration',label:'接口联调',position:[.63,.28]},{id:'release',label:'版本发布',position:[.88,.61]}],
    events:[{id:'scoped',time:0,entityId:'brief',title:'明确首版范围',detail:'对象从包裹站点换成项目环节，数据仍然使用 entity、event、phase 三类结构。'},{id:'prototyped',time:4,entityId:'prototype',title:'原型可操作',detail:'新的主题无需重写时序选择与前后导航，只替换实体、事件和阶段清单。'},{id:'integrated',time:8,entityId:'integration',title:'主流程联调通过',detail:'输入相同类型的动作，得到相同结构的视图数据。这是本次验证的复用边界。'},{id:'released',time:12,entityId:'release',title:'发布演示版本',detail:'这一案例验证了线性事件与阶段浏览。真实项目的并行任务、分支和权限还需要新的业务模型。'}]
  }
};
