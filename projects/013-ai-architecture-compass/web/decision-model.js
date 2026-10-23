"use strict";
// Pure decision rules shared by the page and its regression checks.
const ArchitectureDecision = (() => {
  const presets = {
    notes: ["modules", "rules", "external", "data"],
    avatar: ["modules", "rules", "external", "async"],
    tools: ["modules", "external", "extensions"],
    simple: []
  };
  function recommend(selected) {
    const items = [];
    const add = (label, name, reason, rule, conditional = false) => items.push({ label, name, reason, rule, conditional });
    if (selected.has("modules")) {
      add("整体起点", "模块化单体候选 + 清楚的用例", "已有多个业务能力需要分别维护，先划清责任与公开接口，统一部署。", "每份业务数据有明确所有者；跨模块通过公开入口协作，检查循环依赖。");
    } else {
      add("整体起点", "一个应用 + 简单的用例组织", "先完成一条真实流程，分清展示、规则与数据访问。单个外部接入或后台任务可以局部隔离。", "明确本次用例和规则归属；出现多个独立业务责任时再评估模块化。");
    }
    if (selected.has("rules")) add("业务建模", "在复杂规则处评估 DDD", "先统一语言、写出不变量与一致性边界，再决定是否需要聚合等战术模式。", "规则由明确的所有者统一维护；以冲突、并发等场景验证，记录模型带来的实际收益。");
    if (selected.has("external")) add("外部变化", "为重要交互采用端口与适配器", "将厂商 SDK、存储和输入入口的细节留在边缘。", "核心不导入外部实现；用真实适配器验证契约，避免为每个函数机械加接口。");
    if (selected.has("data")) add("数据保障", "完整性、兼容与恢复要求", "数据重要性优先转化为写入、备份、恢复和迁移约束。", "验证写入后重开、并发冲突与恢复；明确权威数据和可重建的派生数据。");
    if (selected.has("extensions")) add("能力扩展", "从真实扩展提炼插件协议", "稳定共同扩展点，明确生命周期和版本兼容。", "用两个真实扩展验证协议；同进程插件不作为安全沙箱。");
    if (selected.has("async")) add("后续协作", "局部采用事件驱动", "把允许延后的任务与主流程的成功条件区分清楚。", "先明确是否允许任务丢失；要求可靠交付时验证持久化、幂等、重试与恢复。");
    if (selected.has("deploy")) add("条件性评估", "评估一个模块的独立服务化", "先确认边界、运行压力与独立发布收益，再决定是否拆出。", "补齐远程契约、超时、去重、观测和独立部署验证。", true);
    if (selected.has("reads")) add("条件性评估", "在差异明显的部分评估 CQRS", "读写模型分别设计，可以先在同一应用与数据库实现。", "明确读取更新时机；引入异步投影时验证重建与延迟。", true);
    if (selected.has("replay")) add("条件性评估", "验证事件溯源的必要性", "事件成为状态来源，收益需覆盖历史兼容与重放成本。", "验证重放一致性、历史事件兼容与外部副作用隔离。", true);
    return items;
  }
  const taskFields = [
    ["goal", "目标与可观察的验收"],
    ["invariants", "必须始终成立的业务规则"],
    ["boundary", "规则所有者、入口与依赖"],
    ["failures", "失败、并发与恢复场景"],
    ["evidence", "计划执行的验证与证据"],
    ["revisit", "重新评估架构的条件"]
  ];
  function taskState(values) {
    const missing = taskFields.filter(([key]) => !String(values[key] || "").trim()).map(([, title]) => title);
    return { filled: taskFields.length - missing.length, missing };
  }
  function buildTask(name, values) {
    const state = taskState(values);
    return `# ${String(name || "待命名项目").trim() || "待命名项目"} · 单次实现约束卡\n\n状态：实现前草案；未检查仓库，未执行测试。\n已填写 ${state.filled} / ${taskFields.length} 项，只表示信息填写情况。\n\n${taskFields.map(([key, title]) => `## ${title}\n${String(values[key] || "").trim() || "待补充；先结合实际代码核实，影响正确性的缺失信息需要澄清。"}`).join("\n\n")}\n\n## 给 AI 的执行要求\n1. 读取适用项目指令、架构说明与相关 ADR，核对以上草案和真实代码；指出不一致。\n2. 为关键规则建立对应关系：规则 ID → 所有者及公开入口 → 可违反规则的场景 → 验证证据。\n3. 先完成一条端到端用例，保持依赖方向；涉及并发时验证检查与更新能原子地维护规则。\n4. 执行实际存在且适合改动的检查。若发现失败，定位原因；不通过删断言、跳过测试或放宽规则制造通过。\n5. 报告已执行、失败、未执行与证据位置。结构需要调整时，说明理由、影响与迁移方式，按项目决策机制更新 ADR、代码及检查。\n\n## 实现后的证据（必须由实际执行补充）\n- 实际修改及相关版本：待记录\n- 规则 ID / 场景 / 命令或操作 / 真实结果 / 证据位置：待记录\n- 未验证范围与后续处理：待记录\n\n说明：此卡整理输入，不保证架构合理或 AI 遵守；填写完整不代表验收通过。\n`;
  }
  return { presets, recommend, taskFields, taskState, buildTask };
})();
if (typeof module !== "undefined" && module.exports) module.exports = ArchitectureDecision;
