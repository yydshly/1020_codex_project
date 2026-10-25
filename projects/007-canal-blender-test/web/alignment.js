"use strict";

async function showAlignment() {
  const scope = document.getElementById("alignment-scope");
  try {
    const responses = await Promise.all([fetch("data/alignment-v4.json"), fetch("data/render-v4-stats.json")]);
    if (responses.some(response => !response.ok)) throw new Error("对齐记录尚不可读");
    const [report, statistics] = await Promise.all(responses.map(response => response.json()));
    const before = report.baseline_v3;
    const after = report.aligned_v4;
    const metric = "rms_anchor_error_pixels_at_1672x942";
    if (!Number.isFinite(before[metric]) || !Number.isFinite(after[metric])) throw new Error("缺少有效的选点指标");
    document.getElementById("alignment-before").textContent = `${before[metric].toFixed(1)} px`;
    document.getElementById("alignment-after").textContent = `${after[metric].toFixed(1)} px`;
    scope.textContent = `${after.anchors.length} 个人工选点，按 1672 × 942 画幅计算。RMS 是这些点的均方根投影偏差，不是整体相似度、自动重建精度或模型能力排名。选点和对应的几何位置均有近似。`;
    const shorelineMetric = "shoreline_point_to_projected_line_rms_pixels";
    if (Number.isFinite(before[shorelineMetric]) && Number.isFinite(after[shorelineMetric])) {
      const shorelineCount = report.shoreline_constraints.reduce((count, shoreline) => count + shoreline.target_points_normalized_top_left.length, 0);
      scope.textContent += ` 另有 ${shorelineCount} 个岸线点到投影直线的 RMS：${before[shorelineMetric].toFixed(1)} → ${after[shorelineMetric].toFixed(1)} px，这是另一口径，不混入上方选点指标。`;
    }
    document.getElementById("alignment-timing").textContent = `本次正式主图纯渲染 ${statistics.render_seconds.toFixed(2)} 秒；主图单次脚本执行 ${statistics.total_seconds.toFixed(2)} 秒，独立机位另渲染 ${statistics.independent_view_render_seconds.toFixed(2)} 秒。均不代表本轮总投入，不包含此前分析、编写脚本和两张预览筛选。`;
    const pointNames = {
      cafe_bookshop_base: "咖啡店 / 书店分界底部",
      bookshop_pottery_base: "书店 / 第三店分界底部",
      pottery_right_base: "第三店右下角",
      cafe_bookshop_eave: "咖啡店 / 书店屋檐分界",
      bookshop_pottery_eave: "书店 / 第三店屋檐分界",
      pottery_right_eave: "第三店右侧屋檐",
      cafe_left_base: "咖啡店左下角",
      canopy_front_right: "雨棚右前角",
      bridge_shop_bank_end: "桥的店铺侧桥台",
      bridge_deck_crown: "桥面拱顶",
      bridge_far_bank_end: "桥的对岸桥台",
      bridge_inner_crown: "桥洞内侧拱顶"
    };
    const previousPoints = new Map(before.anchors.map(point => [point.name, point]));
    const rows = after.anchors.map(point => {
      const row = document.createElement("tr");
      const values = [pointNames[point.name] || point.name, point.target_normalized_top_left.map(value => `${(value * 100).toFixed(1)}%`).join(", "), `${previousPoints.get(point.name).error_pixels.toFixed(1)} px`, `${point.error_pixels.toFixed(1)} px`];
      values.forEach((value, index) => {
        const cell = document.createElement(index === 0 ? "th" : "td");
        if (index === 0) cell.scope = "row";
        cell.textContent = value;
        row.append(cell);
      });
      return row;
    });
    document.getElementById("alignment-points").replaceChildren(...rows);
  } catch (error) {
    scope.textContent = `${error.message}；可使用下方原始 JSON 下载链接核查。未读取到的指标不补填估算。`;
  }
}

showAlignment();
