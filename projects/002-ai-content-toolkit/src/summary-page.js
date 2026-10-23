/* Readable counterpart of the shared six-tool summary poster. No API calls. */
(() => {
  'use strict';
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function render(){
    const s=window.RESEARCH.summary;
    return `<article class="summary-page">
      <header class="summary-header"><p class="eyebrow">SIX TOOLS / ONE PICTURE</p><h1>${esc(s.title)}</h1><p>${esc(s.intro)}</p>
        <div class="summary-actions"><a class="button" href="./six-tools-summary.jpg" download="六个AI工具-理解总图.jpg">下载完整总图 JPG ↓</a><a class="text-link" href="./six-tools-summary.svg" target="_blank" rel="noopener">打开可放大的矢量图 ↗</a></div>
        <p class="disclosure">一张总图保存全部要点。下面是相同内容的自适应阅读版，可进入每个工具查看更详细的图解和固定源码。</p>
      </header>
      <section class="summary-overview" aria-label="六个工具的总体作用"><div class="summary-start">你提供：目标 + 原始资料或素材 + 判断标准</div>
        <div class="summary-map">${s.map.map(item=>`<div><small aria-hidden="true">↓</small><h2>${esc(item.title)}</h2><b>${esc(item.tools)}</b><p>${esc(item.input)}<span aria-hidden="true">↓</span><strong>${esc(item.output)}</strong></p><p>${esc(item.note)}</p></div>`).join('')}</div>
        <p class="summary-map-note">这是能力地图。六个项目各自独立，按任务选择；并非一个库里的六个模块，也不要求全部串联。</p>
      </section>
      <section aria-labelledby="summary-tools-heading"><div class="section-heading"><div><h2 id="summary-tools-heading">用同一套问题，理解每一个工具</h2><p>按之前从简单到复杂的学习顺序整理。</p></div></div>
        <div class="summary-cards">${s.cards.map((card,i)=>`<article class="summary-card"><header><p class="section-kicker">${String(i+1).padStart(2,'0')} / ${esc(card.type)}</p><h3>${esc(card.name)}</h3><p>${esc(card.purpose)}</p></header>
          <ol class="summary-mini-flow" aria-label="${esc(card.name)} 处理流程">${card.flow.map(step=>`<li>${esc(step)}</li>`).join('')}</ol>
          <dl>${[['capability','能力'],['principle','原理'],['understanding','我们的理解'],['value','意义'],['scenes','使用场景']].map(([key,label])=>`<div><dt>${label}</dt><dd>${esc(card[key])}</dd></div>`).join('')}</dl>
          <div class="summary-boundary"><b>要记住的边界</b><p>${esc(card.boundary)}</p></div>
          <a class="text-link" href="#/tool/${card.id}/principles">进入详细图解与源码依据 →</a>
        </article>`).join('')}</div>
      </section>
      <section class="summary-section"><h2>放在一起，我们真正理解了什么？</h2><div class="summary-distinctions">${s.distinctions.map(([title,desc])=>`<div><h3>${esc(title)}</h3><p>${esc(desc)}</p></div>`).join('')}</div></section>
      <section class="summary-section summary-value"><p class="section-kicker">FROM UNDERSTANDING TO BUILDING</p><h2>对你有什么价值？</h2><p>以你目前“理解原理，并学习如何实现类似产品”的目标来归纳：</p>
        <ol>${s.personal.map(([title,desc],i)=>`<li><span aria-hidden="true">${i+1}</span><div><h3>${esc(title)}</h3><p>${esc(desc)}</p></div></li>`).join('')}</ol>
        <div class="summary-example"><b>一个可以继续探索的组合</b><p>${esc(s.example)}</p><small>这是设计思路，接口与数据传递仍需验证和适配。</small></div>
        <p class="summary-takeaway">${esc(s.takeaway)}</p>
      </section>
      <footer class="summary-evidence"><p>${esc(s.caveat)}</p><p>整理日期：2026-10-23。效果、资源需求和服务可用性仍应通过实际任务验证。</p><a class="text-link" href="#/experiments">带着具体问题，进入验证计划 →</a></footer>
    </article>`;
  }
  window.SummaryPage={render};
})();
