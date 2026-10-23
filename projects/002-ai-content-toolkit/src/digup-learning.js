/* Local teaching examples: no filesystem access, embedding model or real search. */
(() => {
  'use strict';
  const commit = '7db9537712995d14e50e0e44baa00f721b98f1c6';
  const source = (file, label) => `<a class="source-link" href="https://github.com/ARahim3/DigUp/blob/${commit}/${file}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`;
  const examples = {
    photo: { type:'图片', query:'“海边奔跑的小狗”', file:'IMG_0831.jpg', place:'整张图片', description:'文件名没有“小狗”或“海边”，画面本身仍可能与描述相关。', mechanism:'图片编码 → 与文字查询比较语义', limit:'相近场景也可能被误判；编号、小字等细节不一定保留在向量中。' },
    pdf: { type:'PDF', query:'“租房合同里关于宠物的条款”', file:'lease-signed.pdf', place:'第 7 页 · 条款所在页面', description:'返回的价值不只是一本合同，而是让你直接检查相关页面。', mechanism:'按页提取文本或渲染图像 → 保存页码', limit:'页码需要索引保存；扫描件不是一定先 OCR 成文字。查看器还必须支持按页打开。' },
    audio: { type:'音频', query:'“讨论睡眠和记忆的那一段”', file:'discussion.m4a', place:'01:40–02:10 · 命中的音频窗口', description:'长录音按窗口索引，找到讨论该话题的片段；不是先生成一份回答。', mechanism:'音频窗口编码 → 保存开始与结束秒数', limit:'此处时间是教学示例。窗口定位不是逐字时间戳，也不表示已经产生完整转录。' },
    code: { type:'代码', query:'“code: retry with backoff”', file:'src/request.ts', place:'第 42–68 行 · 候选代码范围', description:'按功能描述找可能实现退避重试的代码，再打开编辑器确认。', mechanism:'开启代码搜索 → 独立索引 → 功能描述或名称匹配', limit:'代码需要单独启用；找到语义相似的代码不代表它行为正确，或适合直接复用。' }
  };
  const cases = {
    meaning: {
      label:'内容描述', query:'海边奔跑的小狗', lookup:false,
      takeaway:'在这组教学数据里，照片文件没有查询词，却有最高语义分；关键词一路只找到了文字提及这件事的笔记。',
      rows:[
        {id:'photo',name:'IMG_0831.jpg',place:'图片 · 海边的小狗',z:3.8,coverage:0},
        {id:'video',name:'trip.mp4',place:'视频 · 海边动物画面',z:2.8,coverage:0},
        {id:'note',name:'ideas.md',place:'文档 · 文字提及“海边奔跑的小狗”',z:0.6,coverage:1},
        {id:'invoice',name:'invoice.pdf',place:'PDF · 无关发票',z:0.2,coverage:0}
      ]
    },
    exact: {
      label:'精确编号', query:'INV-2026-018', lookup:true,
      takeaway:'两张发票在主题上很像。教学数据把错误编号设成了更高语义分；编号的关键词命中让正确文件在混合排序里领先。',
      rows:[
        {id:'wrong',name:'invoice-017.pdf',place:'PDF · 编号 INV-2026-017',z:3.6,coverage:0},
        {id:'right',name:'invoice-018.pdf',place:'PDF · 编号 INV-2026-018',z:2.4,coverage:1},
        {id:'manual',name:'billing-guide.md',place:'文档 · 付款说明',z:1.1,coverage:0},
        {id:'photo',name:'IMG_0831.jpg',place:'图片 · 海边的小狗',z:0.1,coverage:0}
      ]
    },
    absent: {
      label:'没有答案', query:'火星基地建设计划', lookup:false,
      takeaway:'所有教学候选都未通过语义阈值，且没有足够关键词命中。允许返回空结果，比强行选出一个“最像”的文件更有用。',
      rows:[
        {id:'photo',name:'IMG_0831.jpg',place:'图片 · 海边的小狗',z:0.3,coverage:0},
        {id:'invoice',name:'invoice-018.pdf',place:'PDF · 发票',z:0.2,coverage:0},
        {id:'note',name:'ideas.md',place:'文档 · 日常笔记',z:0.8,coverage:0}
      ]
    }
  };
  // Inputs are authored examples. z calibration, tokenization, BM25, type hints,
  // file aggregation and real embeddings are not reproduced in this teaching UI.
  function rank(example, mode) {
    return example.rows.filter(row => mode === 'semantic' ? row.z >= 2 :
      mode === 'keywords' ? row.coverage >= 0.5 : row.z >= 2 || row.coverage >= 0.5)
      .map(row => ({...row, score: mode === 'semantic' ? row.z :
        mode === 'keywords' ? row.coverage :
        (example.lookup ? 0.5 : 1)*Math.max(row.z,0) + (example.lookup ? 4 : 2)*row.coverage**1.5}))
      .sort((a,b)=>b.score-a.score || a.id.localeCompare(b.id));
  }
  function exampleBody(key) {
    const e=examples[key];
    return `<div class="du-query"><small>你记得的内容</small><strong>${e.query}</strong><p>${e.description}</p></div>
      <div class="du-result"><span class="sample-tag">可能的结果形式 · 教学示例</span><h3>${e.file}</h3><b>${e.place}</b><p>${e.mechanism}</p></div>
      <p class="du-case-limit">${e.limit}</p>`;
  }
  function effects() {
    return `<section class="reading-section du-effects"><p class="section-kicker">SEE THE RESULT / 效果案例</p><h2>从“记得内容”，走到“找到位置”</h2>
      <p class="section-lead">切换文件类型，看输入和结果之间的关系。下面是作者整理的案例推演，不是 DigUp 的真实搜索界面或本机实测。</p>
      <div class="du-case-tabs" role="group" aria-label="选择 DigUp 效果案例">${Object.entries(examples).map(([id,e])=>`<button type="button" data-du-example="${id}" aria-pressed="${id==='photo'}">${e.type}</button>`).join('')}</div>
      <div class="du-case-body" id="du-example-body" aria-live="polite">${exampleBody('photo')}</div>
      <div class="du-verdict"><b>它交付的是候选文件与位置</b><p>真正的价值是减少“回忆文件名 → 挨个打开 → 翻页或拖动进度条”的时间。是否找准，要回到原文件检查；这与 Kokoro 生成一段新声音的职责不同。</p></div>
      <a class="source-link" href="https://github.com/ARahim3/DigUp/blob/${commit}/README.md" target="_blank" rel="noopener noreferrer">查看作者演示及功能说明 ↗</a>
      <a class="text-link" href="#/tool/digup/principles">继续看：文件怎样变成可检索的索引 →</a></section>`;
  }
  const chunks = {
    pdf: { title:'PDF：每页保留自己的位置', text:'按页选择文字或页面图像进行编码。扫描页可以渲染为图像；文字较少或异常时，也可能走图像路径。长 PDF 分阶段索引，尚未完成的部分不应被当作“已经搜索过”。', labels:['P01','P02','P03','P04'], note:'页面编号为示意。返回第几页，依赖保存的页码元数据。', file:'Sources/DigUpKit/Indexer.swift' },
    document: {title:'文档：分块，并保留少量重叠',text:'研究版本的文档切分默认约 1,800 字符、重叠约 200 字符，并尽量沿空白边界切分。块太长容易混合多个主题，块太短则丢失上下文；这组数字不是所有文件都适用的最佳值。',labels:['第 1 块','第 2 块','第 3 块'],note:'这是字符数，不是固定 token 数；边界调整会使实际长度变化。',file:'Sources/DigUpKit/Extractors.swift'},
    audio: {title:'音频：30 秒窗口，每次前进 25 秒',text:'当前默认窗口长 30 秒，步长 25 秒，相邻窗口重叠 5 秒。重叠减轻话题恰好跨边界时的信息损失，但命中粒度仍是窗口。音频向量不等于逐字转录。',labels:['00:00–00:30','00:25–00:55','00:50–01:20'],note:'这里显示前三个完整窗口；文件末尾可能不足 30 秒。',file:'Sources/DigUpKit/Model.swift'},
    video: {title:'视频：画面和声轨分别检索',text:'配置默认约每 3 秒抽取画面，并去除近重复帧；声轨按音频窗口处理。画面里的事物和声音里的话题因此都可能被检索，但短暂闪过的画面仍可能漏掉。',labels:['画面帧','画面帧','画面帧','声轨窗口'],note:'这是该应用的采样策略，不等于对视频逐帧、逐字完整理解。',file:'Sources/DigUpKit/Model.swift'}
  };
  function chunkBody(key) {
    const c=chunks[key];
    const visual=key==='audio' ? `<div class="du-window-chart" role="img" aria-label="0到30秒、25到55秒、50到80秒三个重叠窗口">
      ${c.labels.map((s,i)=>`<div class="du-window-row"><span style="margin-left:${i*25/80*100}%;width:${30/80*100}%">${s}</span></div>`).join('')}<div class="du-time-axis"><span>0 秒</span><span>40 秒</span><span>80 秒</span></div></div>` :
      `<div class="du-segments">${c.labels.map((s,i)=>`<span><small>SEGMENT ${i+1}</small><b>${s}</b></span>`).join('')}</div>`;
    return `<h3>${c.title}</h3><p>${c.text}</p>${visual}<p class="disclosure">${c.note}</p>${source(c.file,'对应切分配置或实现')}`;
  }
  function alignmentMap(aligned) {
    const points=aligned
      ? [[70,75,'狗的图片'],[165,120,'狗的描述'],[95,185,'相关录音'],[305,220,'汽车图片']]
      : [[70,75,'狗的图片'],[280,80,'狗的描述'],[290,210,'相关录音'],[75,220,'汽车图片']];
    return `<svg viewBox="0 0 400 280" role="img" aria-label="${aligned?'对齐目标：与狗相关的图片、文字和录音相对接近，汽车图片较远':'未对齐示意：不同模态的表示还没有形成可用的对应关系'}">
      <path d="M25 25V255H375" fill="none" stroke="#c5cebd" stroke-width="1.5"/>
      ${aligned?'<ellipse cx="130" cy="130" rx="110" ry="100" fill="#e7ede3" stroke="#9caf9d" stroke-dasharray="5 5"/>':''}
      ${points.map(([x,y,label],i)=>`<g><${i===1?'rect': 'circle'} ${i===1?`x="${x-6}" y="${y-6}" width="12" height="12"`:`cx="${x}" cy="${y}" r="6"`} fill="${i===3?'#ac573b':'#255746'}"/><text x="${x}" y="${y-16}" text-anchor="middle">${label}</text></g>`).join('')}
      <text x="200" y="274" text-anchor="middle" class="du-map-note">任意二维示意 · 无实际坐标含义</text>
      </svg>`;
  }
  function alignment() {
    return `<section class="du-alignment" aria-labelledby="du-alignment-title">
      <p class="section-kicker">SHARED SPACE / 语义空间怎样形成</p>
      <h2 id="du-alignment-title">图片和“小狗”，为什么能比较？</h2>
      <p class="section-lead">关键不是先把一切翻译成文字，而是训练模型，让相关内容产生可比较的表示。相同维数只提供相同的格式，跨模态训练才建立对应关系。</p>
      <figure class="du-figure">
        <figcaption><b>图 1 · 不同入口，共同的表示空间</b><span>下图概括输入到输出的关系，不是模型的完整网络结构。</span></figcaption>
        <div class="du-encode-rows">
          <div><b>文　字<small>“一只小狗”</small></b><span aria-hidden="true">→</span><p>文字 token<small>结合上下文编码</small></p><span aria-hidden="true">→</span><strong>文字向量</strong></div>
          <div><b>图　片<small>小狗的照片</small></b><span aria-hidden="true">→</span><p>像素／图像块<small>视觉编码与后续处理</small></p><span aria-hidden="true">→</span><strong>图像向量</strong></div>
          <div><b>音　频<small>与小狗有关的录音</small></b><span aria-hidden="true">→</span><p>声音随时间的特征<small>音频编码与后续处理</small></p><span aria-hidden="true">→</span><strong>音频向量</strong></div>
        </div>
        <div class="du-space-result"><b>共享的 768 维空间</b><span>在训练约定与任务条件下比较相关性，而不是比较原始像素和文字字形。</span></div>
      </figure>
      <p>“语义空间”可以理解成一套学出来的坐标规则。相关内容的向量倾向于更接近，但不必完全相同。也没有规定“第 23 维就是狗”；信息分布在许多维度及其组合中。</p>
      <a class="source-link" href="https://huggingface.co/google/embeddinggemma-2" target="_blank" rel="noopener noreferrer">EmbeddingGemma 2：共享表示与模态编码器 ↗</a>

      <h3>模型从哪里学到“狗的图片 ↔ 狗的描述”？</h3>
      <p>训练资料提供配对关系，例如狗的照片配“草地上奔跑的小狗”，汽车照片配“路边的汽车”。经典 CLIP 对比学习用这些配对教模型提高正确匹配的相似度、降低不匹配的相似度。下面用这个思路解释“对齐”。</p>
      <figure class="du-figure">
        <figcaption><b>图 2 · 配对数据提供线索，训练调整编码规则</b><span>概念演示；按钮只切换人工绘制的布局，不执行训练，也不是实际向量降维图。</span></figcaption>
        <div class="du-training-layout">
          <div>
            <div class="du-pair"><b>狗的图片 ↔ “奔跑的小狗”</b><span>已知配对：提高匹配相似度</span></div>
            <div class="du-pair du-pair-other"><b>狗的图片 ↔ “路边的汽车”</b><span>不匹配示例：降低匹配相似度</span></div>
            <ol class="du-training-steps"><li>分别编码样本</li><li>比较向量，计算匹配误差</li><li>反向传播，调整模型参数</li><li>用大量不同样本重复训练</li></ol>
          </div>
          <div>
            <div class="du-case-tabs" role="group" aria-label="切换跨模态对齐示意"><button type="button" data-du-align="before" aria-pressed="true">未对齐示意</button><button type="button" data-du-align="after" aria-pressed="false">对齐目标示意</button></div>
            <div id="du-alignment-map">${alignmentMap(false)}</div>
          </div>
        </div>
        <p id="du-alignment-status" class="lesson-takeaway" aria-live="polite">各自输出一串数字，还不够：未经跨模态对齐，不能因为长度相同就直接比较含义。</p>
      </figure>
      <p>声音也可通过配对样本建立联系，但要区分两件事：<b>人说“狗在叫”</b>是说话内容，<b>真实的狗叫声</b>是声音事件。两者都可能与这句描述相关，却不是相同的声音，也不保证得到相同向量。图中的“相关录音”只是关系示意。</p>
      <p class="du-demo-label"><b>训练机制与证据边界：</b>CLIP 是图文对比学习的经典例子，音频是这里扩展说明的配对概念。EmbeddingGemma 2 官方确认使用配对的文字、图片、视频与音频数据对齐表示，但模型卡没有给出完整训练配方；不能据此断言其全部损失函数与 CLIP 一样。</p>
      <a class="source-link" href="https://openai.com/index/clip/" target="_blank" rel="noopener noreferrer">CLIP：图文配对与对比学习 ↗</a>
      <a class="source-link" href="https://huggingface.co/google/embeddinggemma-2#model-data" target="_blank" rel="noopener noreferrer">EmbeddingGemma 2：跨模态训练数据 ↗</a>

      <h3>先生成文字描述，和直接向量检索有什么区别？</h3>
      <figure class="du-figure">
        <figcaption><b>图 3 · 两条可行路线，中间产物不同</b><span>比较的是检索路线；两者也可以组合使用。</span></figcaption>
        <div class="du-route-grid">
          <article class="du-route-caption"><small>路线 A · 先描述，再搜索</small><h4>先得到人能读懂的一句话</h4>
            <ol class="du-route-chain"><li>小狗图片</li><li>描述生成模型</li><li><b>“草地上奔跑的小狗”</b><small>显式的文字描述</small></li><li>建立文字检索索引</li></ol>
            <p class="du-query-path">查询文字 → 搜索这些描述 → 返回原图</p>
            <p>描述可做关键词索引，也可再编码成文字向量。只依赖描述时，没写出来的细节难以被找到，生成错误也会影响检索。</p>
          </article>
          <article class="du-route-vector"><small>路线 B · 直接跨模态检索</small><h4>直接得到可比较的向量</h4>
            <ol class="du-route-chain"><li>小狗图片</li><li>多模态嵌入模型</li><li><b>图像向量 [ … ]</b><small>没有必需的文字描述步骤</small></li><li>保存向量与原图路径</li></ol>
            <p class="du-query-path">查询文字 → 文字向量 → 与图像向量比较</p>
            <p>直接比较相关性，不必先输出一句话。向量仍会丢失细节、产生误匹配，也不能完整还原图片。</p>
          </article>
        </div>
      </figure>
      <p class="lesson-takeaway"><b>训练时用文字教它建立对应关系，不等于使用时每张图片都要先生成描述。</b>训练调整模型权重；在 DigUp 中给文件建立索引，主要是使用已有权重做推理，并保存结果。</p>
      <p>DigUp 的图像与音频嵌入路径属于路线 B；可提取文本和部分平台的 OCR 则补充关键词检索。OCR 读出图片里已有的文字，图像描述概括画面内容，两者也不是一回事。它们与向量检索可以并存。</p>
      ${source('Sources/LlamaRuntime/LlamaEmbedder.swift','DigUp 图像与音频编码路径')}
      ${source('Sources/DigUpKit/Searcher.swift','语义与关键词检索')}
    </section>`;
  }
  function principles() {
    return `<section class="reading-section du-principles"><p class="section-kicker">CONNECT THE IDEAS / 从 Kokoro 接着理解</p><h2>同样是向量，这次用来比较内容</h2>
      <div class="du-comparison"><div><small>KOKORO</small><h3>文字 + 声音条件 → 新波形</h3><p>风格向量帮助生成模型决定怎样说。</p></div><div><small>DIGUP</small><h3>文件 + 查询 → 相关文件与位置</h3><p>语义向量帮助检索系统判断内容是否相关。</p></div></div>
      <p>EmbeddingGemma 2 用文字、图像和音频等输入产生可比较的 768 维表示。模型权重决定如何编码，索引保存你各个文件的编码结果；建立索引是推理，不是用私人文件重新训练模型。</p>
      <p class="disclosure">“落在同一空间”是说向量可以按训练约定比较，不是把图片变成一段中文，也不是给每个维度固定贴上“狗”“海边”等标签。</p>
      <a class="source-link" href="https://huggingface.co/google/embeddinggemma-2" target="_blank" rel="noopener noreferrer">模型官方说明 ↗</a>
      ${alignment()}
      <h3>把昂贵的读文件放在搜索之前</h3>
      <div class="du-lanes"><div><b>索引阶段</b><ol><li>选定文件夹</li><li>解析并分片</li><li>模型编码</li><li>向量 + 文字 + 位置入库</li></ol><small>首次处理较重；后续同步新增、变化与删除。</small></div>
      <div><b>查询阶段</b><ol><li>输入描述</li><li>编码查询</li><li>向量与关键词两路检索</li><li>融合并返回位置</li></ol><small>复用已有索引，不必每次重新编码所有原文件。</small></div></div>
      ${source('Sources/DigUpKit/Indexer.swift','索引流程')} ${source('Sources/DigUpKit/Searcher.swift','查询流程')}
      <h3>为什么一本书、一段录音，要拆开存？</h3><p>检索的对象往往是局部内容。拆分后，每个片段拥有自己的向量和位置；代价是更多模型推理、索引空间和比较次数。</p>
      <div class="du-case-tabs" role="group" aria-label="选择分片类型">${[['pdf','PDF'],['document','文档'],['audio','音频'],['video','视频']].map(([id,label])=>`<button type="button" data-du-chunk="${id}" aria-pressed="${id==='audio'}">${label}</button>`).join('')}</div>
      <div class="du-chunk-body" id="du-chunk-body" aria-live="polite">${chunkBody('audio')}</div>
      <h3>索引里不只有一串向量</h3><div class="du-storage"><div><b>files · 文件</b><p>路径、类型、大小、修改时间、索引状态</p></div><div><b>segments · 片段</b><p>所属文件、片段类型、页码／时间、摘录、向量</p></div><div><b>fts · 关键词</b><p>文件名、路径和可提取的文字，用于精确词检索</p></div></div>
      <p>此版本用 SQLite 和 FTS5 存储；向量以 float16 保存，查询时分块转成 float32 做比较。搜索源码逐条计算已存向量的相似度，没有要求额外部署大型向量数据库。</p>
      ${source('Sources/DigUpKit/IndexStore.swift','数据库结构')} ${source('Sources/DigUpKit/Vectors.swift','向量的存储形式')}
      </section>`;
  }
  function fusion() {
    return `<section class="reading-section du-fusion"><p class="section-kicker">TRY THE LOGIC / 混合检索推演</p><h2>看懂意思，也要看清编号</h2>
      <p>语义相似不保证编号相同，出现关键词也不保证场景吻合。切换查询和检索路径，观察两种信息如何影响排序。</p>
      <p class="du-demo-label"><b>教学计算，不是模型实测。</b>文件、语义 z 分和词覆盖率均为人工设定；下面只演示源码中的候选门槛及部分融合规则。没有读取本机文件，也没有运行嵌入模型。</p>
      <div class="du-case-tabs" role="group" aria-label="选择混合检索教学查询">${Object.entries(cases).map(([id,c])=>`<button type="button" data-du-query="${id}" aria-pressed="${id==='meaning'}">${c.label}</button>`).join('')}</div>
      <div class="du-search-query"><small>查询</small><strong id="du-query-text">${cases.meaning.query}</strong></div>
      <div class="du-mode-tabs" role="group" aria-label="选择教学检索路径">${[['semantic','只看语义'],['keywords','只看关键词'],['hybrid','混合排序']].map(([id,label])=>`<button type="button" data-du-mode="${id}" aria-pressed="${id==='hybrid'}">${label}</button>`).join('')}</div>
      <div id="du-ranked-results" class="du-ranked-results" aria-live="polite"></div>
      <p id="du-rank-takeaway" class="lesson-takeaway"></p>
      <details class="lesson-detail"><summary>展开演示计算规则与真实实现的区别</summary>
      <p>本演示把校准后的语义 z 分与词覆盖率直接作为人工输入。语义 z ≥ 2 或词覆盖率 ≥ 50% 时进入混合候选；普通查询按 z + 2 × 覆盖率的 1.5 次方，编号查询按 0.5 × z + 4 × 覆盖率的 1.5 次方计算。</p>
      <p>“只看关键词”的演示按覆盖率排序，真实 FTS5 还使用 BM25 等处理。真实实现还包括模态校准、查询词处理、编号识别、文件类型提示、文件聚合及片段定位；本演示不复现这些环节，也不复现中文分词。编号查询标记在这里是人工设定的。</p>
      <p>这些数字都不是正确概率，跨检索路径的分数也不能直接比较；演示只能说明排序机制，不能证明 DigUp 的检索质量。</p></details>
      ${source('Sources/DigUpKit/Searcher.swift','核对候选门槛与融合代码')}
      <h3>真实查询还做了哪些处理？</h3>
      <ol class="du-real-ranking"><li><b>余弦比较</b><span>归一化向量用点积比较方向，得到原始相似度。</span></li><li><b>模态校准</b><span>调整文字、图像和音频的分数分布差异，不把原始分直接当成统一尺度。</span></li><li><b>关键词与候选门槛</b><span>查找可提取文字，结合词覆盖率；允许没有足够相关候选。</span></li><li><b>融合、按文件归并、定位</b><span>选择每个文件的最佳片段，返回与它对应的位置和摘录。</span></li></ol>
      </section>`;
  }
  function mount() {
    const root=document.getElementById('detail-content');
    if (!root) return;
    root.querySelectorAll('[data-du-align]').forEach(button=>button.addEventListener('click',()=>{
      const aligned=button.dataset.duAlign==='after';
      root.querySelectorAll('[data-du-align]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));
      root.querySelector('#du-alignment-map').innerHTML=alignmentMap(aligned);
      root.querySelector('#du-alignment-status').textContent=aligned
        ? '对齐希望让相关内容可比较。图中远近只是教学布局；真实高维向量常比较方向，匹配不是绝对正确，也不等于向量完全相同。'
        : '各自输出一串数字，还不够：未经跨模态对齐，不能因为长度相同就直接比较含义。';
    }));
    root.querySelectorAll('[data-du-example]').forEach(button=>button.addEventListener('click',()=>{
      root.querySelectorAll('[data-du-example]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));
      root.querySelector('#du-example-body').innerHTML=exampleBody(button.dataset.duExample);
    }));
    root.querySelectorAll('[data-du-chunk]').forEach(button=>button.addEventListener('click',()=>{
      root.querySelectorAll('[data-du-chunk]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));
      root.querySelector('#du-chunk-body').innerHTML=chunkBody(button.dataset.duChunk);
    }));
    if (!root.querySelector('#du-ranked-results')) return;
    let query='meaning',mode='hybrid';
    function draw() {
      const example=cases[query],rows=rank(example,mode);
      root.querySelector('#du-query-text').textContent=example.query;
      root.querySelector('#du-rank-takeaway').textContent=example.takeaway;
      root.querySelectorAll('[data-du-query]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.duQuery===query)));
      root.querySelectorAll('[data-du-mode]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.duMode===mode)));
      root.querySelector('#du-ranked-results').innerHTML=rows.length ? rows.map((row,i)=>
        `<article class="du-rank-row"><span class="du-position">${i+1}</span><div><b>${row.name}</b><p>${row.place}</p><small>输入：语义 z = ${row.z.toFixed(1)} · 词覆盖率 ${Math.round(row.coverage*100)}%</small></div><div class="du-rank-score"><strong>${row.score.toFixed(2)}</strong><small>${mode==='keywords'?'覆盖率演示值':'教学排序分'}</small></div></article>`).join('') :
        '<div class="du-no-results"><b>没有通过门槛的候选</b><p>真实使用时，可检查资料是否存在、索引是否完成，以及描述是否合适。</p></div>';
    }
    root.querySelectorAll('[data-du-query]').forEach(el=>el.addEventListener('click',()=>{query=el.dataset.duQuery;draw();}));
    root.querySelectorAll('[data-du-mode]').forEach(el=>el.addEventListener('click',()=>{mode=el.dataset.duMode;draw();}));
    draw();
  }
  window.DigUpLearning={effects,principles,fusion,mount,rank,cases};
})();
