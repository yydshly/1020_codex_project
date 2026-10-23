"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { recommend, taskState, buildTask } = require("../web/decision-model.js");

const completeTask = {
  goal: "保存正文后重新打开，仍显示本次保存的内容。",
  invariants: "旧版本不能覆盖新版本。",
  boundary: "内容模块拥有正文；编辑入口调用保存用例。",
  failures: "验证并发修改、存储失败和重启恢复。",
  evidence: "运行实际保存流程并记录版本、结果与日志位置。",
  revisit: "真实使用证明多个业务能力需独立维护时再评估边界。"
};

function recommendations(...pressures) {
  return recommend(new Set(pressures));
}

function baseOf(items) {
  const bases = items.filter(item => item.label === "整体起点");
  assert.equal(bases.length, 1, "每个建议组合应有且只有一个整体起点");
  return bases[0];
}

function assertSimpleBase(items) {
  assert.match(baseOf(items).name, /一个应用.*简单/);
  assert.doesNotMatch(baseOf(items).name, /模块化单体/);
}

test("仅数据重要性增加保护要求，不升级为模块化或事件溯源", () => {
  const items = recommendations("data");
  assertSimpleBase(items);
  assert.equal(items.length, 2);
  const protection = items.find(item => item.label === "数据保障");
  assert.ok(protection, "应给出数据保障建议");
  assert.match(protection.rule, /恢复/);
  assert.ok(items.every(item => !/事件溯源/.test(item.name)));
  assert.ok(items.every(item => item.conditional === false));
});

test("仅外部接入变化保持简单起点，在交互边界使用适配器", () => {
  const items = recommendations("external");
  assertSimpleBase(items);
  assert.equal(items.length, 2);
  assert.ok(items.some(item => /端口与适配器/.test(item.name)));
  assert.ok(items.every(item => !/独立服务|CQRS|事件溯源/.test(item.name)));
});

test("仅后台任务保持简单起点，事件驱动局部采用", () => {
  const items = recommendations("async");
  assertSimpleBase(items);
  assert.equal(items.length, 2);
  const events = items.find(item => item.label === "后续协作");
  assert.ok(events);
  assert.match(events.name, /局部.*事件驱动/);
  assert.match(events.rule, /可靠交付/);
  assert.ok(items.every(item => !/独立服务|事件溯源/.test(item.name)));
});

test("模块化候选由多个业务责任的明确输入触发", () => {
  const withoutModules = recommendations("rules", "external", "data", "extensions", "async", "deploy", "reads", "replay");
  assertSimpleBase(withoutModules);
  const withModules = recommendations("modules");
  assert.match(baseOf(withModules).name, /模块化单体候选/);
  assert.equal(withModules.length, 1, "模块化本身不自动附带 DDD、插件或分布式模式");
});

test("独立部署、复杂读模型和历史重放各自只提出条件性评估", async t => {
  for (const [pressure, expected] of [["deploy", /独立服务化/], ["reads", /CQRS/], ["replay", /事件溯源/]]) {
    await t.test(pressure, () => {
      const items = recommendations(pressure);
      assertSimpleBase(items);
      const candidate = items.find(item => expected.test(item.name));
      assert.ok(candidate, "相应压力应产生可审视的候选");
      assert.equal(candidate.conditional, true, "不可把候选当成已采用的结构");
      assert.equal(candidate.label, "条件性评估");
      assert.equal(items.length, 2);
    });
  }
});

test("任务状态只报告空、部分和完整输入的填写情况", () => {
  const empty = taskState({});
  assert.deepEqual(Object.keys(empty).sort(), ["filled", "missing"]);
  assert.equal(empty.filled, 0);
  assert.equal(empty.missing.length, 6);

  const partial = taskState({ goal: completeTask.goal, boundary: completeTask.boundary, evidence: " \n\t ", unrelated: "不属于任务卡的内容" });
  assert.equal(partial.filled, 2, "空白输入与额外字段不能增加填写进度");
  assert.equal(partial.missing.length, 4);
  assert.ok(partial.missing.includes("计划执行的验证与证据"));

  const complete = taskState(completeTask);
  assert.deepEqual(complete, { filled: 6, missing: [] });
  assert.ok(!("passed" in complete) && !("approved" in complete), "填写完整不产生通过或批准状态");
});

test("完整任务卡仍明确为未执行草案，实际证据保持待记录", () => {
  const card = buildTask("正文保存", completeTask);
  assert.match(card, /已填写 6 \/ 6 项，只表示信息填写情况/);
  assert.match(card, /状态：实现前草案；未检查仓库，未执行测试/);
  assert.match(card, /填写完整不代表验收通过/);
  const evidence = card.split("## 实现后的证据（必须由实际执行补充）")[1];
  assert.ok(evidence, "必须保留供实际执行者填写的证据区域");
  const evidenceRows = evidence.split("\n").filter(line => line.startsWith("- "));
  assert.equal(evidenceRows.length, 3);
  assert.ok(evidenceRows.every(line => line.endsWith("：待记录")), "计划输入不得冒充执行结果");
});

test("中文多行输入保留内部换行，空白字段明确标为待补充", () => {
  const goal = "保存草稿后重新打开。\n第二步：确认中文与标点完整。\n\n第三步：比较保存前后的版本。";
  const card = buildTask("  我的中文项目  ", { ...completeTask, goal: ` \n${goal}\n `, failures: " \t\n " });
  assert.ok(card.startsWith("# 我的中文项目 · 单次实现约束卡\n"));
  assert.ok(card.includes(`## 目标与可观察的验收\n${goal}\n\n`));
  assert.match(card, /已填写 5 \/ 6 项/);
  assert.match(card, /## 失败、并发与恢复场景\n待补充；/);
  assert.ok(buildTask(" \n ", {}).startsWith("# 待命名项目 ·"));
});

test("多种压力同时存在，独立服务、CQRS 和事件溯源仍保留评估条件", () => {
  const items = recommendations("modules", "rules", "external", "data", "extensions", "async", "deploy", "reads", "replay");
  assert.match(baseOf(items).name, /模块化单体候选/);
  for (const expected of [/独立服务化/, /CQRS/, /事件溯源/]) {
    const matches = items.filter(item => expected.test(item.name));
    assert.equal(matches.length, 1);
    assert.equal(matches[0].conditional, true);
    assert.equal(matches[0].label, "条件性评估");
    assert.ok(matches[0].reason.length > 0 && matches[0].rule.length > 0, "每个候选都需携带判断理由与验证要求");
  }
  assert.equal(items.filter(item => item.conditional).length, 3);
});
