// SPDX-License-Identifier: GPL-3.0-only
'use strict';
(() => {
  const form=document.getElementById('brief-form');
  const fieldNames=['theme','audience','experience','scope','style','source'];
  const initial=Object.fromEntries(fieldNames.map(name=>[name,form.elements.namedItem(name).value]));
  const briefFeedback=document.getElementById('brief-feedback');
  const templateFeedback=document.getElementById('template-feedback');
  const templateNodes=Array.from(document.querySelectorAll('[data-template-title]'));

  function buildPrompt(values) {
    return `请按当前工作区的项目约定，新建一个独立子项目，制作“${values.theme}”的交互网页。

目标用户：
${values.audience}

核心体验：
${values.experience}

首版范围：
${values.scope}

视觉方向：
${values.style}

代码与资料：
${values.source}
对无法确认的内容明确标注。

技术沉淀要求：
说明借鉴的源码机制，分别记录直接复用、提炼改写和新增实现。把适合迁移的规则与界面分开，至少用一份不同主题的数据验证，并留下输入输出、适用边界与验收证据。

交付要求：
页面说明它展示什么、可以怎么玩、从哪里开始。
完成后启动网页并在浏览器打开，保留服务运行；实际操作验证主流程，记录已知限制和再次启动的方法。

请先简短说明主线、资料来源和实现计划，然后直接开始完成首版。技术细节可以自主决定，并说明影响体验的重要取舍。`;
  }

  function updatePrompt(values) {
    document.getElementById('text-start').textContent=buildPrompt(values);
    document.getElementById('prompt-start').open=true;
  }

  function currentValues() {
    return Object.fromEntries(fieldNames.map(name=>[name,form.elements.namedItem(name).value.trim()]));
  }

  form.addEventListener('submit',event=> {
    event.preventDefault();
    const values=currentValues();
    if(fieldNames.some(name=>!values[name])) {
      briefFeedback.textContent='请先填写六项内容，说明你的主题、用户与首版范围。';
      briefFeedback.classList.add('error');
      return;
    }
    updatePrompt(values);
    briefFeedback.textContent=`已生成“${values.theme}”的首版指令，可在下方复制。`;
    briefFeedback.classList.remove('error');
    document.getElementById('prompt-start').scrollIntoView({block:'start'});
  });

  document.getElementById('reset-brief').addEventListener('click',()=> {
    fieldNames.forEach(name=>{form.elements.namedItem(name).value=initial[name];});
    updatePrompt(initial);
    briefFeedback.textContent='已恢复苏轼样例及对应首版指令。';
    briefFeedback.classList.remove('error');
  });

  function templatesText() {
    return '实现与指令手册 · 江山时序研究\n'+
      '按阶段选择模板，并替换成自己的主题、现象和验收要求。\n\n'+
      templateNodes.map(node=>`${node.dataset.templateTitle}\n${'='.repeat(24)}\n${node.textContent.trim()}`).join('\n\n\n');
  }

  document.querySelectorAll('[data-copy]').forEach(button=> {
    button.addEventListener('click',async()=> {
      const node=document.getElementById(button.dataset.copy);
      try {
        await navigator.clipboard.writeText(node.textContent.trim());
        button.textContent='已复制 ✓';
        templateFeedback.textContent=`已复制：${node.dataset.templateTitle}`;
        templateFeedback.classList.remove('error');
        setTimeout(()=>{button.textContent='复制指令 ↗';},2200);
      } catch (_) {
        templateFeedback.textContent='自动复制未成功，可选中模板文字后手动复制。';
        templateFeedback.classList.add('error');
        node.focus();
      }
    });
  });

  document.getElementById('download-prompts').addEventListener('click',()=> {
    const blob=new Blob(['\ufeff',templatesText()],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;
    link.download='实现与指令模板-江山时序.txt';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),10000);
    templateFeedback.textContent='已生成包含当前首版指令及其余五组模板的 TXT 文件。';
    templateFeedback.classList.remove('error');
  });

  function openLinkedTemplate() {
    const target=document.getElementById(window.location.hash.slice(1));
    if(target?.tagName==='DETAILS') target.open=true;
  }
  window.addEventListener('hashchange',openLinkedTemplate);
  openLinkedTemplate();
})();
