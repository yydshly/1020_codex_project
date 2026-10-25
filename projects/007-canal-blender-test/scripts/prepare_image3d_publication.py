"""Prepare the public image-to-3D report from preserved local research assets."""
from pathlib import Path
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'web'
page = WEB / 'research-closure.html'
archive = WEB / 'research-closure-local-original.html'
if not archive.exists():
    shutil.copy2(page, archive)
text = page.read_text(encoding='utf-8')

updates = {
    '从 DSH 源帖到本地 Blender、雨后老街、猫漫游与完整街区的研究收束：源效果、真实实验、全部历史版本、能力边界和投入产出。': '图生3D探索：三档参考图只选最简预算版，用AI看图后驱动Blender重建可编辑场景，经历对齐、材质、补景、角色走跑与街区扩展，说明结论、意义及投入产出。',
    '<title>007 · AI × Blender｜探索全记录与研究结论</title>': '<title>007 · 图生 3D 探索｜从参考图到可漫游街区</title>',
    '探索收束 · 本地整理 · 2026.10.25': '图生 3D · 研究归档 · 2026.10.25',
    '<a href="#conclusion">结论</a><a href="#source">源帖效果</a><a href="#reference">参考与引导</a>': '<a href="#conclusion">结论</a><a href="#understanding">完整概述图</a><a href="#source">源帖效果</a><a href="#reference">三档参考与选择</a>',
    '<span class="eyebrow">From a showcase to an editable world</span><h1>能控制 Blender，<br>离真实世界还有多远？</h1>': '<span class="eyebrow">Image to 3D / From a picture to a walkable scene</span><h1>从一张图，<br>到可编辑、可漫游的 3D 街区。</h1>',
    '从 DeepSeek 展示帖出发，我们用 Codex 驱动本机 Blender，经历单图场景、视觉对齐、材质试验、猫的走跑，以及两岸街区的补全。这一页保留成果，也保留没有达到的目标。': '我们验证了图生 3D：从三档图片中选最简单的预算版，让 Codex 理解图片，通过 Python/bpy 在 Blender 重建几何、材质与灯光，再接入网页漫游。这里保留源帖效果、我们的真实产物，以及从对齐、反光、补景到角色和整片街区的探索。',
    '本轮只整理研究，不继续修改场景。已有模型、网页与实验版本保留；未提交、未发布。': '本轮补齐三档原图、完整概述与研究结论，按用户授权提交并部署网页。已有模型与实验版本保留，不再继续优化场景。',
    '<a class="button primary" href="#source">先看源效果与我们的结果 ↓</a>': '<a class="button primary" href="#understanding">先看完整概述图 ↓</a>',
    '<strong>有限完成</strong><span>可漫游户外空间；未高保真还原</span>': '<strong>图生 3D</strong><span>已生成可漫游原型；未高保真还原</span>',
    '<h2>执行能力已验证，视觉目标没有完整达成。</h2><p>最有价值的发现是：AI 与 Blender 的连接和命令执行容易验证，持续稳定地得到好场景更依赖资产、约束、空间设计和审美验收。后期继续逐项微调，新增研究信息已经有限。</p>': '<h2>图生 3D 已实现，高保真还原仍未达成。</h2><p>输入一张参考图，已经得到能修改、换角度渲染和走进去的三维场景。采用的是 AI 看图后程序化建场景；背面与镜头外内容包含后续设计。质量的主要成本来自构图、资产、空间合理性、材质与动作验收。</p>',
    '<h3>从指令到可编辑 3D</h3>': '<h3>从图片到可编辑 3D</h3>',
    '本机建模、材质与相机调整、Cycles 渲染、另存工程、导出 GLB，以及网页实时查看和沿道路漫游均已跑通。结果是有几何的场景，能换角度查看。': '以实际选中的参考图为输入，完成几何、材质、灯光和相机重建，保存真实 Blender 工程、渲染与 GLB，并实现网页查看和沿道路漫游。输出包含可编辑几何。',
    '受源展示启发，独立验证“AI 编写与迭代 Blender 场景”的可行性，并探索它转成可漫游网页的成本。我们验证了这条工作流，未完成源帖复现，也未完成照片级老街。': '受源展示启发，实现了从图到可编辑、可漫游 3D 的独立原型，验证它适合快速搭景、参数化修改与资产复用。没有复现源帖同一任务，也没有达到照片级老街；后期持续精修的投入回报已经下降。',
    '本轮仅在本地研究页带出处展示，未发布。': '本页带出处用于研究比较与评论，图像不因插件开源而获得开放许可。',
    '<span id="guide-original"></span><section id="reference">': '<section id="reference">',
    '<h2>我们的测试参考，与源帖是两件事。</h2><p>讨论过更复杂的场景后，我们另行生成了中等复杂度的“雨后临水老街”，用来控制范围：连续店面、石桥、河面、湿铺地、暖窗与暮色。没有把源站站台图直接作为本次建模输入。</p>': '<h2>三档入口图，只选最简单一档实际建模。</h2><p>我们先生成结构清楚的临水老街，再把范围扩大成山城、电车和多层街道，最后考虑耗时与效果，收敛为三店一桥的预算版。三张都是这次对话生成的概念图；只有最后一张进入 Blender 实测，另外两张保留作选题方案，未进行三档还原能力对比。</p>',
    '本聊天生成并采用的测试入口概念图，1672×941。不是 X 原帖图片，不是 Blender 渲染，也没有作为整张背景纹理贴进场景。': '三个生成方案中实际选用的较简预算版，1672×941。不是 X 原帖图片或 Blender 渲染，也没有作为整张背景贴图冒充三维。',
    '<strong>正式采用的入口概念图 · AI 生成</strong>': '<strong>实际采用 · 三档中范围最收敛的预算版</strong>',
    '<p class="caption-note">归档缺口：早前讨论的不同复杂度生成图，未找到可确认的独立项目文件；本页展示已归档的正式采用版本，不补造“历史原图”。</p>': '<p class="caption-note">三张均从本次对话生成图存档中恢复并核对 SHA-256，没有重新生成替代图。上一版只查项目素材目录而漏列另外两张，本轮已补齐。<a href="research-data/reference-options.json">查看三方案来源、生成顺序与选用记录 ↗</a>。</p>',
    '本次是<b>看图后重新组织几何与材质的脚本建场景</b>，不是自动从单图恢复真实扫描，也没有调用外部图生 3D 网络。': '本次已经实现<b>图生 3D：看图后重新组织几何、材质与灯光的脚本建场景</b>。实现方式是 AI 视觉理解与 Blender 执行，没有调用外部端到端图生 3D 网络，也不属于精确扫描恢复。',
    '保留下来的不是“照片变世界已经解决”，而是一套可复用的工作流与判断标准：先定输入、范围和验收；区分模型、资产、连接层与渲染器；记录真实结果和失败；把高质量资产与人工审美当作独立投入。对库的机制与此类流程的局限已经有足够理解，本轮在这里停止。': '我们已经验证图生 3D 原型可行，其价值在于快速构建与修改空间、复用资产和批量自动化。要继续提升保真度，需要把空间设计、高质量资产和审美验收作为独立投入；不能期待接上插件就自动完成。先定输入、范围与验收，再决定是否继续精修，这比无限扩景更能控制投入产出。本轮保留成果与方法，不继续优化场景。',
    '旧工程与网页继续保留；本轮没有新增建模、渲染、安装或发布。': '旧工程与网页继续保留；本轮更新研究资料并发布，没有新增建模、渲染或安装。',
    '本地归档的是探索过程和实际能力边界。最终街区作为原型保留；高保真还原未完成，不再继续场景优化。': '归档从三档图片选择到可漫游街区的图生 3D 探索。原型能力已验证，高保真还原未完成；保留全部既有实验版本，不再继续场景优化。',
}
for old, new in updates.items():
    if old in text:
        text = text.replace(old, new)
    elif new not in text:
        raise RuntimeError('Publication edit no longer matches: ' + old[:90])

guide = '''
  <span id="guide-original"></span><section id="understanding"><div class="section-head"><span class="eyebrow">Overview / Our understanding</span><h2>完整概述图：能力、原理、验证与意义。</h2><p>采用这次对话专门生成的《AI 控制 Blender：效果、原理与验证》原图作为主引导与目录封面。它把源帖展示、两条控制路线、验证场景、公平比较方式和研究意义放在一张图里；后续实际成果与修正结论由本页补充。</p></div>
    <div class="grid2 overview-guide"><figure class="media-card"><a href="media/control-guide-original.png" data-image data-caption="本对话专门生成的完整概述图《AI控制Blender：效果、原理与验证》，1024×1536原件。图中的源效果是解释性示意，不替代后面四张原帖媒体；MCP是可选路线，本次实际使用Python/bpy，没有进行两模型公平比较。"><img src="media/control-guide-original.png" alt="专门生成的完整概述图：源效果、DeepSeek与Codex控制方式、验证、公平比较和意义" loading="lazy"></a><figcaption><strong>完整概述图 · 原件保留</strong><span>点击放大，或<a href="overview.html">独立阅读 / 下载 ↗</a>。图片中的方法建议与本页已完成的实验范围分开理解。</span></figcaption></figure>
    <article class="panel"><span class="tag">我们当前的理解</span><h3>输入是图片，输出是可编辑场景。</h3><p>图生 3D 不必只指调用一个专门的生成网络。本次路线是 AI 理解图像，生成并迭代 Blender 脚本，得到有真实几何、材质与灯光的场景；之后导出并开发网页查看、漫游。</p><h3>连接层让控制发生，质量需要闭环。</h3><p>DSH、MCP 或直接脚本都可以把操作交给 Blender。差异还包括宿主、协议、会话和视觉反馈；最终质量需要看实际产物，不能只看工具是否接通。</p><h3>我们做到了原型，保真度仍有上限。</h3><p>只用最简单预算版执行建模，再探索对齐、反射、补景、角色与完整街区。可编辑、可换视角和可漫游已经成立；高保真材质、合理空间和自然动作仍有差距。</p><h3>意义在于更快搭景，并知道何时停。</h3><p>快速原型、批量修改与资产复用有价值。持续修补低质量基础的收益会下降，需先设置验收标准与预算。</p><p class="small">海报生成于前期，保留原件而不重绘。其中 MCP 与公平对比是机制 / 待验证设想；源作者费用为自述。后续结论以本页证据为准。</p><div class="actions"><a class="button primary" href="overview.html">完整图独立页 ↗</a><a class="button" href="#reference">看三档入口 ↓</a></div></article></div>
  </section>
'''
if 'id="understanding"' not in text:
    text = text.replace('  <section id="source">', guide + '\n  <section id="source">', 1)

options = '''
    <div class="grid3 reference-options">
      <figure class="media-card"><a href="research-media/reference-levels/reference-initial.png" data-image data-caption="第一张历史入口：初始临水老街，原件1672×941。生成提示限定三店、一桥、五盏街灯和一棵树；这些是设计约束，不是精确图像计数。此图未进入后续建模。"><img src="research-media/reference-levels/reference-initial.png" alt="初始档：结构清楚的中式临水老街入口图" loading="lazy"></a><figcaption><span class="tag">01 / 初始档 · 未建模</span><strong>临水老街，先把结构说清楚</strong><span>三店、一桥、两岸通路、五盏街灯等提示约束，提出可数、可连接的测试题。</span></figcaption></figure>
      <figure class="media-card"><a href="research-media/reference-levels/reference-complex.png" data-image data-caption="第二张历史入口：高复杂山城运河与电车枢纽，1672×941原件。提示包含约10–12栋建筑、双桥、轨道、多层道路和阶梯；只用于展示更复杂方案，没有据此生成3D。"><img src="research-media/reference-levels/reference-complex.png" alt="高复杂档：山城、双桥、电车和多层街道" loading="lazy"></a><figcaption><span class="tag warn">02 / 高复杂档 · 未建模</span><strong>山城、电车与多层街区</strong><span>更完整的世界方向，也带来更多建筑、交通、标高和遮挡关系；因时间与质量风险未启动。</span></figcaption></figure>
      <figure class="media-card selected"><a href="media/reference.png" data-image data-caption="第三张历史入口：最终选中的最简单预算档，1672×941原件。三店、一桥、三盏街灯，排除电车、复杂道路和山城天际线。只有这一张进入实际Blender建模。"><img src="media/reference.png" alt="最简预算档：实际选中的三家店面与一座桥" loading="lazy"></a><figcaption><span class="tag">03 / 最简预算档 · 实际采用</span><strong>缩小范围，保留精致感和氛围</strong><span>保留三店、一桥与短河岸，移除电车和多层路网。下方全部 Blender 迭代由这一张图开始。</span></figcaption></figure>
    </div><div class="callout"><strong>我们选择了最简单一档，没有验证三档都能还原。</strong><p>这里的“最简单”指这次讨论中最终控制下来的测试范围；仍保留了精致材质与雨后反光目标。三张是选题过程，不是三档同预算建模基准。后续全街区来自逐步扩展与设计，并非直接把高复杂候选自动还原。</p></div>
'''
if 'class="grid3 reference-options"' not in text:
    anchor = '    <figure class="media-card"><a href="media/reference.png" data-image data-caption="三个生成方案中实际选用'
    if anchor not in text:
        raise RuntimeError('Missing selected reference figure')
    text = text.replace(anchor, options + '\n' + anchor, 1)

old = next((line for line in text.splitlines() if '<div class="grid2 render-grid"><figure class="media-card"><a href="media/control-guide-original.png"' in line), None)
if old:
    history = '    <details class="panel render-grid"><summary>历史附件：V1–V3 的流程 SVG（不再作主引导）</summary><figure class="media-card"><a href="media/exploration-guide.svg" data-image data-caption="V1–V3时期的历史流程SVG，按原件保留。当前主引导为上方专门生成的完整概述图。"><img src="media/exploration-guide.svg" alt="V1–V3 历史流程图" loading="lazy"></a><figcaption>历史图只覆盖早期过程，不包含后续对齐、角色和街区扩展。<a href="guide.html">原历史引导页 ↗</a></figcaption></figure></details>'
    text = text.replace(old, history)
if 'research-closure-local-original.html' not in text:
    text = text.replace('<a href="#top">回到页首 ↑</a>', '<a href="#top">回到页首 ↑</a><a href="research-closure-local-original.html">上次仅本地整理稿</a>')
page.write_text(text, encoding='utf-8')

overview = '''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>007 · 图生3D完整概述图</title><link rel="stylesheet" href="research-closure.css"><style>.overview-wrap{max-width:1080px;margin:30px auto;padding:0 20px}.overview-wrap img{width:100%;height:auto;background:white}.overview-wrap p{font-size:13px}.overview-wrap .actions{position:sticky;top:0;background:#f3f1eaf2;padding:12px 0;z-index:2}</style></head><body><main class="overview-wrap"><span class="eyebrow">007 / IMAGE TO 3D</span><h1>图生 3D：完整概述图</h1><p>沿用对话中专门生成的《AI 控制 Blender：效果、原理与验证》原件。当前实践已实现看图后程序化重建与网页漫游；海报中的部分比较是验证设想，实际未安装 DSH / MCP、未做公平模型对比。完整过程与结论见研究页。</p><div class="actions"><a class="button primary" href="index.html#understanding">返回研究页</a><a class="button" href="media/control-guide-original.png" download="AI-Blender-complete-overview.png">下载原图</a><a class="button" href="media/control-guide-original.png">原尺寸打开 ↗</a></div><figure><img src="media/control-guide-original.png" alt="AI控制Blender效果原理与验证完整概述图"><figcaption class="small">1024 × 1536 · 原字节保留 · SHA-256: 859a81d93dd20b277f4df5fe887775466816b77fda3e053428e510edbb474206</figcaption></figure><p>图内源场景是解释性示意；<a href="index.html#source">真实源帖四图</a>与<a href="index.html#results">我们的实际效果</a>分别留档。三档参考图只有最简单预算版实际进入建模。</p></main></body></html>'''
(WEB / 'overview.html').write_text(overview, encoding='utf-8')
provenance_path = WEB / 'research-media/source/provenance.json'
provenance = json.loads(provenance_path.read_text(encoding='utf-8'))
provenance['rights_note'] = 'Original-post photos are attributed to their rights holders and shown with original-post links for research comparison and commentary. No open-media reuse licence was found; plugin code licences do not cover these images or grant downstream reuse rights.'
provenance['publication_context'] = 'This research edition is prepared for publication on the user-authorized GitHub Pages site. Source photos remain distinct from generated explanatory diagrams and local experimental renders.'
provenance_path.write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Prepared public report, three reference options and original complete overview; scenes unchanged.')
