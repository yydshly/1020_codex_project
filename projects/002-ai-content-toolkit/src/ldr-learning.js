/* Authored research walkthrough; does not search, fetch or call an LLM. */
(() => {
  'use strict';
  const base='https://github.com/LearningCircuit/local-deep-research/blob/683a967df20fe98ec0ddc99668041e22b95ff78b/';
  const path='src/local_deep_research/';
  const source=(file,label)=>`<a class="source-link" href="${base}${path}${file}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`;
  const flowDetails={
    sources:[
      ['模型生成一批查询','第一轮围绕原问题生成搜索问题；符合配置和长度条件时，也可直接搜索原问题。后续轮次参考累计结果中最近的一部分，以及提问历史。','question_generator.generate_questions'],
      ['程序并行执行搜索','一批问题分别变成搜索查询，由搜索后端返回结果。程序执行搜索、收集返回值并处理搜索失败；模型本身不是搜索引擎。','run_parallel_searches → self.search.run'],
      ['程序累积结果，准备上下文','结果追加到累计列表。后续提问使用受 question_context_limit 限制的最近结果，不是每轮重新读完所有原文。','accumulated_search_results_across_all_iterations'],
      ['程序按轮次控制循环','主循环按设定次数运行。每轮记录搜索问题数、结果数等轻量信息；没有强制要求先产出完整分析、核验全部缺口，再决定是否继续。未生成问题时可跳过该轮搜索。','for iteration in range(1, iterations_to_run + 1)'],
      ['结束轮次后筛选与综合','可选相关性筛选处理累计结果，再进入最终综合与引用。设定轮次用尽不代表问题都已解决；取消、异常等分支未在主路径图中展开。','筛选累计来源 → 引用处理与综合']
    ],
    agent:[
      ['模型决定下一步动作','模型接收问题、系统提示、可用工具和当前上下文，选择搜索、读取资料，或输出答案。代码没有强制所有任务先生成完整研究树。','create_agent(model, tools, system_prompt, ...)'],
      ['模型输出工具名和参数','模型需要支持工具调用。可调用哪些工具取决于配置；例如搜索、fetch_content，以及启用时的 research_subtopic。','AIMessage.tool_calls'],
      ['程序执行，结果送回模型','框架执行请求的工具，将工具结果放回研究上下文；收集器记录来源。模型据此作下一次选择，更新的是任务上下文，不是模型权重。','agent.stream → 工具结果 → 下一次模型调用'],
      ['模型给出答案，进入引用处理','模型不再请求工具而输出回答时，进入最终整理。提示词鼓励资料足够时结束，但没有客观验证器保证此时已经查全、查对。','无工具调用且有回答 → _finalize'],
      ['程序也能限制或中断研究','程序设置递归步数上限。触及上限且已有资料时，可能基于现有来源综合部分结果；没有资料时可能报错或提示无结果。用户取消是另行处理的分支。','recursion_limit / GraphRecursionError']
    ]
  };
  const flowNode=(mode,index,title,role,kind='program')=>`<button type="button" class="ldr-node ldr-node-${kind}" data-ldr-flow="${mode}" data-ldr-step="${index}" aria-pressed="${index===0}" aria-controls="ldr-${mode}-explanation"><small>${role}</small><b>${title}</b></button>`;
  const arrow=label=>`<div class="ldr-arrow"><span aria-hidden="true">↓</span>${label?`<small>${label}</small>`:''}</div>`;
  const explanation=mode=>`<div class="ldr-flow-detail" id="ldr-${mode}-explanation" aria-live="polite" aria-atomic="true"><small>点击图中节点，查看代码对应的行为</small><h4>${flowDetails[mode][0][0]}</h4><p>${flowDetails[mode][0][1]}</p><code>${flowDetails[mode][0][2]}</code></div>`;
  function researchFlows(){return `<h3>两种流程，谁控制下一步？</h3>
    <p class="ldr-flow-intro">两张图简化自固定版本代码。绿色节点表示模型判断，米色节点表示程序或工具执行；可点击节点看说明，不会发起真实研究。</p>
    <div class="ldr-flow-grid">
      <figure class="ldr-flow-card"><figcaption><small>图 1 / SOURCE-BASED</small><h3>程序安排轮次</h3><p>一批问题 → 一批搜索 → 继续提问</p></figcaption>
        <div class="ldr-flow-input">输入：研究问题 + 轮次等配置</div>${arrow('')}
        <div class="ldr-cycle">
          ${flowNode('sources',0,'生成一批查询','1 · 模型','model')}${arrow('')}
          ${flowNode('sources',1,'并行搜索','2 · 程序 + 搜索后端')}${arrow('')}
          ${flowNode('sources',2,'累积结果，准备上下文','3 · 程序')}${arrow('')}
          ${flowNode('sources',3,'还有设定的轮次吗？','4 · 程序检查')}
          <p class="ldr-loop-caption">有 <span aria-hidden="true">↶</span> 携带部分已有结果，回到第 1 步</p>
        </div>${arrow('没有剩余轮次')}
        ${flowNode('sources',4,'筛选与综合，生成报告','5 · 程序组织 + 模型综合','output')}
        ${explanation('sources')}
        ${source('advanced_search_system/strategies/source_based_strategy.py','核对按轮次研究代码')}
      </figure>
      <figure class="ldr-flow-card"><figcaption><small>图 2 / LANGGRAPH-AGENT</small><h3>模型选择行动</h3><p>选择工具 → 查看结果 → 再作决定</p></figcaption>
        <div class="ldr-flow-input">输入：研究问题 + 工具与上下文</div>${arrow('')}
        <div class="ldr-cycle">
          ${flowNode('agent',0,'下一步做什么？','1 · 模型','model')}
          <div class="ldr-agent-fork">
            <div><p class="ldr-branch-label">继续调用工具 <span aria-hidden="true">↓</span></p>${flowNode('agent',1,'输出工具名 + 参数','2 · 模型','model')}${arrow('')}${flowNode('agent',2,'执行工具，返回结果','3 · 程序 + 工具')}</div>
            <div><p class="ldr-branch-label">不再调用工具 <span aria-hidden="true">↓</span></p>${flowNode('agent',3,'给出答案，整理引用','模型 + 程序','output')}<p class="ldr-branch-end">本次研究进入交付</p></div>
          </div>
          <p class="ldr-loop-caption">拿到结果 <span aria-hidden="true">↶</span> 回到第 1 步，由模型再次选择</p>
        </div>
        ${flowNode('agent',4,'达到上限，也可能结束','贯穿循环 · 程序边界','limit')}
        ${explanation('agent')}
        ${source('advanced_search_system/strategies/langgraph_agent_strategy.py','核对 Agent 循环代码')}
      </figure>
    </div>
    <p class="lesson-takeaway"><b>共同点是“模型 + 工具 + 资料反馈”；差别是循环由谁推动。</b>图 1 按设定轮次推进搜索，图 2 让模型选择动作、由程序限制执行。两种策略都不保证每轮更深入或更正确。</p>`;}
  function understanding(){return `<h3>我们刚才的理解，哪些准确，哪些需要修正？</h3>
    <p>“从整体到细节，持续搜索、理解、补充”可以帮助理解研究目标。具体到代码，要区分下面几件事。</p>
    <div class="ldr-differences"><table class="lesson-table"><thead><tr><th scope="col">原先的理解</th><th scope="col">代码中的实际行为</th></tr></thead><tbody>
      <tr><th scope="row">一定先整体规划，再逐层深入</th><td>普通研究不强制生成完整问题树；模型可随资料调整方向。详细报告流程更接近先组织章节、再分节研究。</td></tr>
      <tr><th scope="row">每轮都全面理解，再检查缺口</th><td>source-based 主要在各轮生成问题、累积结果，最终才集中综合；Agent 可以边看结果边选动作，但不保证完整核验。</td></tr>
      <tr><th scope="row">把所有资料都交给模型</th><td>后续提问只使用受配置限制的部分结果；页面读取、文本长度和聚焦摘取也有边界。来源出现在列表中不等于全文已被读完。</td></tr>
      <tr><th scope="row">一直查，直到资料充分</th><td>可能按轮数结束，也可能由模型结束；执行上限或异常可能让研究提前停止。结束状态和证据充分程度需要分别判断。</td></tr>
      <tr><th scope="row">多循环几次就更可靠</th><td>循环可能找到反例，也可能重复来源、放大早期误判。可选事实检查仍由模型完成，引用也需要核对是否支持结论。</td></tr>
      <tr><th scope="row">持续理解就是模型在学习</th><td>这里更新的是上下文、来源和报告，不更新模型权重；保存资料用于以后检索，也不等于训练模型。</td></tr>
    </tbody></table></div>
    <p>以上对照分别依据两种策略、读取工具、引用处理器和报告生成器；原理页对应段落均链接到同一固定版本。</p>
    <h3>“整体 → 细节”更贴近详细报告流程</h3>
    <div class="ldr-report-path" aria-label="详细报告流程"><span>初步研究结果</span><i aria-hidden="true">→</i><span>模型拟定章节</span><i aria-hidden="true">→</i><span>按小节继续研究</span><i aria-hidden="true">→</i><span>汇总报告与来源</span></div>
    <p>注意顺序：它先有初步发现，再生成报告结构。这是详细报告生成器的一条工作流程，不能当成所有策略都必须经过的第一步。</p>
    ${source('report_generator.py','核对 generate_report 的三个阶段')}
    <h3>如果自己实现类似产品，主要控制什么？</h3>
    <div class="pf-longform"><div><b>用户定目标</b><span>研究什么、从哪些角度看、比较范围和交付格式。写在提示词里的要求需要检查执行情况。</span></div><div><b>模型作判断</b><span>生成查询、解释资料、比较证据、撰写结论；Agent 路径还选择下一次工具调用。</span></div><div><b>程序管执行</b><span>配置可用工具，实际搜索和读取，管理上下文与来源，设置轮次或步数上限，处理失败与交付。</span></div></div>
    <p class="lesson-takeaway"><b>模型提供理解与生成能力，产品把能力组织成可运行、可追溯的研究过程。</b>真正值得学习的是查询如何产生、资料如何返回、来源如何保存和流程如何停止。部署让系统运行起来；研究质量还要用证据支持程度、覆盖范围和未解决问题来衡量。</p>`;}
  const rounds=[
    ['明确问题','比较两种资料检索方案，重点看精确编号、换一种说法能否搜到、维护成本。','用户给出范围；模型可把宽问题拆成可查的子问题。','还没有资料，不能直接宣称谁最好。'],
    ['搜索与阅读','教学材料 A 写着“方案甲支持文件编号匹配”；材料 B 写着“方案乙支持按描述检索”。','程序执行搜索和内容读取，把结果与来源交给模型。','两份功能描述没有回答 10 万份文档下的速度和成本。'],
    ['发现缺口，再补查','继续寻找版本说明、相同数据量的测试条件、部署与索引更新说明。','Agent 可调整查询或阅读更多来源；程序执行动作并记录结果。','如果仍找不到可靠测试，应保留未知，不能编造对比数值。'],
    ['综合并交付','甲支持编号匹配，乙支持按描述检索；谁更快、更省，需要在相同数据和环境下验证。','模型组织有来源的结论与限制，用户核对原文和适用条件。','完成一份报告，不等于所有问题都已有答案。']
  ];
  function effects(){return `<section class="reading-section ldr-lesson"><p class="section-kicker">QUESTION TO EVIDENCE / 从问题到依据</p><h2>输入研究任务，得到可以继续核查的报告</h2>
    <p>你不用预先找齐全部资料。提供问题与范围，再配置模型、搜索来源和研究策略；系统帮你查询、阅读、补充信息与整理结果。</p>
    <p class="du-demo-label"><b>人工教学推演。</b>方案甲、乙与材料 A、B 均为虚构说明，不是真实产品评测；按钮只切换预写文本，不执行搜索或模型推理。</p>
    <div class="du-case-tabs" role="group" aria-label="浏览研究过程"><button type="button" data-ldr-round="0" aria-pressed="true">1 · 明确问题</button><button type="button" data-ldr-round="1" aria-pressed="false">2 · 找到材料</button><button type="button" data-ldr-round="2" aria-pressed="false">3 · 发现缺口</button><button type="button" data-ldr-round="3" aria-pressed="false">4 · 综合报告</button></div>
    <div class="pf-example" aria-live="polite"><small id="ldr-round-number"></small><h3 id="ldr-round-title"></h3><p id="ldr-round-content"></p><div class="pf-longform"><div><b>谁在做什么</b><span id="ldr-round-action"></span></div><div><b>现在的边界</b><span id="ldr-round-limit"></span></div></div></div>
    <p class="lesson-takeaway"><b>核心价值是组织研究过程。</b>模型既参与写答案，也参与提出下一步要查什么。搜索引擎负责找资料，读取工具负责取回内容，程序负责执行与保存来源。</p>
    ${source('advanced_search_system/strategies/langgraph_agent_strategy.py','核对 Agent 研究循环')}<a class="text-link pf-next" href="#/tool/ldr/principles">看原理：模型如何调用工具、何时停止、引用如何产生 →</a></section>`;}
  function principles(){return `<section class="reading-section ldr-lesson"><p class="section-kicker">UNDERSTANDING × IMPLEMENTATION / 从理解回到代码</p><h2>研究循环的方向理解对了，实际执行还要看策略</h2>
    <p>Local Deep Research 把“找资料 → 模型分析 → 补查 → 综合”组织成自动流程。模型提供判断与写作能力，程序提供工具、资料管理和执行边界。主流程没有训练新的基础模型。</p>
    <p class="lesson-takeaway"><b>“整体到细节，反复查到完全理解”是一种研究思路。</b>代码实现的是有边界的查询与反馈循环，没有保证每次研究都先全面规划、逐层深入，直到所有结论得到验证。</p>
    ${researchFlows()}
    ${understanding()}
    <p>两张图只解释已核对的两种策略。子主题研究是 Agent 可选工具；本网页不执行工具，也不运行研究模型。</p>
    ${source('search_system.py','核对研究策略的选择')}
    <h3>搜索摘要、读原文与读摘要有什么区别？</h3>
    <div class="pf-longform"><div><b>搜索结果</b><span>通常帮助发现候选：标题、链接、摘要等。返回的信息取决于搜索后端，不等于已通读所有来源。</span></div><div><b>读取内容</b><span>fetch_content 可提供提取后的页面文字；仍受内容长度、可访问性、页面格式和设置限制。</span></div><div><b>聚焦摘取</b><span>也可让模型按指定关注点提取相关段落，减少上下文负担；摘要或摘取仍可能遗漏限定条件。</span></div></div>
    ${source('advanced_search_system/tools/fetch/__init__.py','核对读取模式与长度限制')}
    <h3>引用是怎么加进报告的？</h3>
    <figure class="pf-figure"><figcaption><b>图 3 · 把结论连回来源</b><span>引用提供追溯路径，不提供正确性保证。</span></figcaption><ol class="pf-chain"><li>收集来源<br><small>标题、URL、内容</small></li><li>分配编号<br><small>保留证据与出处</small></li><li>模型综合<br><small>用编号标注依据</small></li><li>格式化报告<br><small>编号链接回来源</small></li></ol></figure>
    <p>标准引用处理器把来源信息与正文送给模型，要求按给定编号引用。可选一致性检查会让模型比较来源冲突，但这仍是模型判断。引用编号可以存在，旁边的推断却仍然超出了原文。</p>
    <div class="pf-source"><small>人工引用练习 / 不是实际研究证据</small><p>教学材料 A：方案甲支持按文件编号检索。材料没有测试速度，也没有比较其他场景。</p></div>
    <div class="du-case-tabs" role="group" aria-label="比较结论与证据"><button type="button" data-ldr-claim="supported" aria-pressed="true">原文支持的结论</button><button type="button" data-ldr-claim="overreach" aria-pressed="false">超出原文的结论</button></div>
    <div class="lesson-takeaway" aria-live="polite"><b id="ldr-claim"></b><p id="ldr-claim-reason"></p></div>
    ${source('citation_handlers/standard_citation_handler.py','核对引用综合提示')}
    <h3>它什么时候停止？报告一定完整吗？</h3>
    <p>在 Agent 路径中，模型可以不再请求工具而给出答案；程序也设置执行步数边界，处理工具不可用、异常和用户取消。达到限制后，如果已经收集到资料，代码可能基于现有内容综合部分结果。<b>“任务结束”与“证据充分”需要分别判断。</b></p>
    <p>更多轮次、更长报告可能意味着更多调用；是否更深入，要看证据覆盖、反例、日期和条件，而不只看字数。</p>
    <h3>Local 是不是意味着完全离线？</h3>
    <div class="pf-network"><div><b>模型推理</b><p>可配置本地模型端点或云端服务。用本地模型通常要准备模型权重和运行服务；使用云端模型则会把提示与资料发送出去。</p></div><div><b>搜索与阅读</b><p>公开网页研究需要联网；自建搜索入口也可能访问上游引擎。只研究本地资料，需要相应来源与权限配置，不能由名称推断。</p></div></div>
    <p>资料库可以帮助以后检索已收集内容；这是“存储＋索引＋检索”，不是训练模型。安装 Web 应用、配置模型和配置搜索后端，是不同的准备步骤。</p>
    <p class="disclosure">深入核对日期：2026-10-23。沿用固定版本 683a967；未部署、未执行真实研究，未复现作者基准。页面示意与引用练习均为人工教学材料。</p></section>`;}
  function mount(){const root=document.getElementById('detail-content');if(!root)return;
    root.querySelectorAll('[data-ldr-flow]').forEach(button=>button.addEventListener('click',()=>{
      const mode=button.dataset.ldrFlow,step=Number(button.dataset.ldrStep),detail=flowDetails[mode][step];
      const panel=root.querySelector(`#ldr-${mode}-explanation`);
      panel.querySelector('h4').textContent=detail[0];panel.querySelector('p').textContent=detail[1];panel.querySelector('code').textContent=detail[2];
      root.querySelectorAll(`[data-ldr-flow="${mode}"]`).forEach(node=>node.setAttribute('aria-pressed',String(node===button)));
    }));
    if(root.querySelector('#ldr-round-title')){
      const draw=i=>{const r=rounds[i];root.querySelector('#ldr-round-number').textContent=`教学步骤 ${i+1} / 4`;root.querySelector('#ldr-round-title').textContent=r[0];root.querySelector('#ldr-round-content').textContent=r[1];root.querySelector('#ldr-round-action').textContent=r[2];root.querySelector('#ldr-round-limit').textContent=r[3];root.querySelectorAll('[data-ldr-round]').forEach(el=>el.setAttribute('aria-pressed',String(Number(el.dataset.ldrRound)===i)));};
      root.querySelectorAll('[data-ldr-round]').forEach(el=>el.addEventListener('click',()=>draw(Number(el.dataset.ldrRound))));draw(0);
    }
    if(root.querySelector('#ldr-claim')){
      const draw=mode=>{const ok=mode==='supported';root.querySelector('#ldr-claim').textContent=ok?'“方案甲支持编号检索。”（依据：教学材料 A）':'“方案甲在所有检索场景中最快。”（声称依据：教学材料 A）';root.querySelector('#ldr-claim-reason').textContent=ok?'结论没有超过这段材料描述的功能范围。真实研究仍需核对版本、配置和原文。':'有一个出处不代表得到支持：材料没有速度数据，也没有覆盖所有场景。需要额外证据，否则应删除或改写这个结论。';root.querySelectorAll('[data-ldr-claim]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.ldrClaim===mode)));};
      root.querySelectorAll('[data-ldr-claim]').forEach(el=>el.addEventListener('click',()=>draw(el.dataset.ldrClaim)));draw('supported');
    }
  }
  window.LdrLearning={effects,principles,mount};
})();
