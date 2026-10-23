/* Authored teaching examples. No model calls or generated audio. */
(() => {
  'use strict';
  const base='https://github.com/souzatharsis/podcastfy/blob/053b54a0917e35edb2808049499292361ccaae7b/';
  const source=(path,label)=>`<a class="source-link" href="${base}${path}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`;
  const modes={
    read:{title:'直接朗读：保留文章表达',body:'<div class="pf-line"><b>朗读者</b><p>关键词检索匹配文字；语义检索比较含义。图片可以直接编码成向量，不必先生成文字描述。发票编号等精确信息通常还需要关键词匹配。</p></div>',note:'主要增加声音，信息顺序和书面表达基本不变。仅供理解 TTS 的职责，不是 Kokoro 或 Podcastfy 的生成结果。'},
    dialogue:{title:'对话改编：重组听众理解的顺序',body:'<div class="pf-line"><b>Person1 · 总结者</b><p>找素材有两条常用思路：按字找，或者按意思找。</p></div><div class="pf-line pf-second"><b>Person2 · 追问者</b><p>那我记得照片里有狗，但文件名只有数字，也可能找到？</p></div><div class="pf-line"><b>Person1 · 总结者</b><p>可以尝试语义检索。图片能直接编码成向量，不一定先写成一句描述。</p></div><div class="pf-line pf-second"><b>Person2 · 追问者</b><p>但如果要找某个发票编号，仍得看精确文字是否匹配。</p></div>',note:'增加追问与例子，让知识按对话展开。例子是作者为了讲解而写，不是新增的实验事实。真正生成时要逐项核对来源。'}
  };
  function modeBody(key){const m=modes[key];return `<h3>${m.title}</h3>${m.body}<p class="disclosure">${m.note}</p>`;}
  function effects(){return `<section class="reading-section pf-lesson"><p class="section-kicker">HEAR THE STRUCTURE / 先看节目怎么写</p><h2>不是换两种声音读文章，而是先重新写稿</h2>
    <div class="pf-source"><small>同一份原始资料 · 教学文本</small><p>关键词检索匹配文字；语义检索比较含义。图片可以直接编码成向量，不必先生成文字描述。发票编号等精确信息通常还需要关键词匹配。</p></div>
    <div class="du-case-tabs" role="group" aria-label="比较朗读与对话改编"><button data-pf-mode="read" aria-pressed="false">直接朗读</button><button data-pf-mode="dialogue" aria-pressed="true">对话改编</button></div>
    <div id="pf-example" class="pf-example" aria-live="polite">${modeBody('dialogue')}</div>
    <p class="du-demo-label"><b>人工编写的效果示意。</b>本页没有运行 Podcastfy，没有合成试听音频。可以到官方样例页听作者的案例，但它不能证明我们的中文资料会有同样效果。</p>
    ${source('README.md','官方音频案例与输入来源')}<a class="text-link pf-next" href="#/tool/podcastfy/principles">继续看：两个角色怎样进入语音流程 →</a>
    <div class="pf-value"><b>它的价值：把重复的制作步骤组织起来</b><p>批量把知识资料改编成节目、复用角色和风格设置、替换文稿或语音后端。价值取决于节省的制作时间，是否超过审稿和修音的时间。</p></div></section>`;}
  const soundModes={
    segments:{title:'普通路径：每个角色片段分别合成',steps:['解析 Person1 / Person2','分别选择声音 A / B','逐段生成语音','按原稿顺序拼接'],note:'同一份稿件里不同段落被分配给不同声音。已检查合并逻辑主要是顺序相加，不是实时对话，也不自动提供自然抢话、专业混音或响度统一。'},
    multi:{title:'多说话人路径：把对话交给对应服务',steps:['保留分角色对话','选择支持的多人后端','服务返回音频块','合并音频块并导出'],note:'后端可联合处理多个角色，但仍依据给定稿件。研究版本此分支硬编码 en-US-Studio-MultiSpeaker 与 R / S 声音，不能把它当作任意中文音色组合的已验证能力。'}
  };
  function soundBody(key){const m=soundModes[key];return `<h3>${m.title}</h3><ol class="pf-chain">${m.steps.map(s=>`<li>${s}</li>`).join('')}</ol><p>${m.note}</p>`;}
  function principles(){return `<section class="reading-section pf-lesson"><p class="section-kicker">FROM MODEL TO WORKFLOW / 从模型走到制作流程</p><h2>一个写稿环节，一个发声环节</h2>
    <div class="pf-comparison"><article><small>KOKORO</small><b>文字 → 声音</b><p>核心是语音合成模型。</p></article><article><small>DIGUP</small><b>内容 → 索引 → 找回</b><p>核心是编码与检索。</p></article><article><small>PODCASTFY</small><b>资料 → 对话 → 声音</b><p>核心是组织生成流程。</p></article></div>
    <p>Podcastfy 本身不是一个新训练的“播客大模型”。它把资料提取器、提示模板、文稿 LLM、TTS 后端和音频处理串起来。两个角色通常由同一文稿生成链写出，再选择两种声音。</p>
    <figure class="pf-figure"><figcaption><b>图 1 · 文稿是两个模型环节之间的交接物</b><span>橙色表示建议插入的人工检查，默认调用不会自动停下来等待审批。</span></figcaption>
      <ol class="pf-pipeline"><li><small>输入处理</small><b>资料</b><span>正文、字幕或图像</span></li><li><small>生成文字</small><b>LLM 写稿</b><span>内容、角色、结构</span></li><li class="pf-human"><small>人工检查</small><b>审阅稿件</b><span>事实、遗漏、术语</span></li><li><small>生成声音</small><b>TTS 配音</b><span>音色、发音、韵律</span></li><li><small>音频处理</small><b>合并导出</b><span>片段顺序与编码</span></li></ol>
      <p class="disclosure">transcript_only → 保存文稿 → 人工修订 → transcript_file → 配音。这是一种可采用的分步用法。</p></figure>
    ${source('podcastfy/client.py','查看主流程与两阶段入口')}
    <h3>角色标签不是音色向量，更不是两个 Agent</h3>
    <div class="pf-tag-example"><code>&lt;Person1&gt;先看关键词检索。&lt;/Person1&gt;<br>&lt;Person2&gt;那语义检索有什么不同？&lt;/Person2&gt;</code><p>这些标签说明“哪段由谁说”。文稿中的总结者、追问者是内容角色；TTS 的声音 A、B 是音色设置。标签不包含声音模型，也不代表真人声纹。</p></div>
    <div class="pf-comparison pf-two"><article><b>改角色、风格或语言</b><p>影响文稿怎么写，需要重新生成或修改稿件。默认角色是总结者与追问／澄清者，但不是每句话都必须严格问答。</p></article><article><b>只换音色</b><p>可以复用同一份审阅稿，再合成音频。术语错读也应检查 TTS，不要误认为都是写稿模型的问题。</p></article></div>
    ${source('podcastfy/conversation_config.yaml','角色、语言与声音设置')}
    <figure class="pf-figure"><figcaption><b>图 2 · 同一份对话稿，两种音频生成路径</b><span>切换查看实现分工；本页不调用语音服务。</span></figcaption>
      <div class="du-case-tabs" role="group" aria-label="选择 Podcastfy 配音路径"><button data-pf-sound="segments" aria-pressed="true">逐段配音</button><button data-pf-sound="multi" aria-pressed="false">多说话人后端</button></div>
      <div id="pf-sound-path" aria-live="polite">${soundBody('segments')}</div></figure>
    ${source('podcastfy/text_to_speech.py','两条音频处理分支')}
    <h3>长节目怎样保持前后衔接？</h3>
    <figure class="pf-figure"><figcaption><b>图 3 · 分段写作时带上已生成的对话</b><span>概念图；不是向量检索，也不保证记住全部事实。</span></figcaption>
      <div class="pf-longform"><div><b>第 1 次</b><span>原始内容与第 1 块 → 生成对话 1</span></div><div><b>第 2 次</b><span>对话 1 + 第 2 块 → 生成对话 2</span></div><div><b>第 3 次</b><span>对话 1、2 + 第 3 块 → 生成对话 3</span></div></div>
      <p>源码用“前面已经说过什么”指导后续衔接，再拼接输出。重复输入会增加成本与上下文压力，也可能把早期错误带到后面。</p></figure>
    <p>研究版本默认配置目标最多 8 块、最小 600 字符，但实际按英文句号加空格切句；这些配置不是硬性的 token 上限，也不能保证固定节目时长。中文长文、单个长句和长上下文需单独测试。longform 当前拒绝图片输入。</p>
    ${source('podcastfy/content_generator.py','长文切分与上下文传递')}
    <h3>“本地”要逐个环节判断</h3>
    <div class="pf-network"><div><b>资料获取</b><p>本地文本与 PDF 可在本机读取；网页、字幕和主题搜索需要网络。</p></div><div><b>文稿生成</b><p>is_local 选择 Llamafile；模板仍通过 Hub 拉取，模型文件也需事先准备。</p></div><div><b>语音生成</b><p>由 TTS 后端决定。Edge 无需 API 密钥，也仍然是网络服务。</p></div><div><b>合并导出</b><p>本机处理音频。最终文件存在本地，不代表前面没有调用云端。</p></div></div>
    ${source('podcastfy/content_generator.py','本地后端与模板加载')} ${source('usage/local_llm.md','本地 LLM 文档')}
    </section>`;}
  function mount(){
    const root=document.getElementById('detail-content'); if(!root)return;
    for(const [attr,target,render] of [['pfMode','#pf-example',modeBody],['pfSound','#pf-sound-path',soundBody]]){
      const buttons=root.querySelectorAll(attr==='pfMode'?'[data-pf-mode]':'[data-pf-sound]');
      buttons.forEach(button=>button.addEventListener('click',()=>{
        buttons.forEach(el=>el.setAttribute('aria-pressed',String(el===button)));
        root.querySelector(target).innerHTML=render(button.dataset[attr]);
      }));
    }
  }
  window.PodcastfyLearning={effects,principles,mount};
})();
