/* Educational synthesis only. No recordings, microphone access or API credentials. */
(() => {
  'use strict';
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cite = (url, label) => `<a class="source-link" href="${url}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`;
  const source = {
    adc: 'https://wiki.analog.com/university/courses/electronics/text/chapter-20',
    sound: 'https://openstax.org/books/physics/pages/14-2-sound-intensity-and-sound-level',
    voice: 'https://phys.unsw.edu.au/jw/voice.html',
    encoder: 'https://arxiv.org/html/1806.04558v4',
    autovc: 'https://arxiv.org/abs/1905.05879',
    card: 'https://huggingface.co/hexgrad/Kokoro-82M',
    model: 'https://github.com/hexgrad/kokoro/blob/dfb907a02bba8152ca444717ca5d78747ccb4bec/kokoro/model.py',
    pipeline: 'https://github.com/hexgrad/kokoro/blob/dfb907a02bba8152ca444717ca5d78747ccb4bec/kokoro/pipeline.py'
  };
  function narration(id) {
    const track = window.RESEARCH.lessonTracks.find(item => item.id === id);
    if (!track) return '';
    return `<div class="lesson-audio"><div><span class="sample-tag">听一段解释 · MINIMAX 合成讲解</span><strong>${esc(track.title)}</strong></div>
      <audio controls preload="none" aria-label="${esc(track.title)}"><source src="./audio/${track.id}.mp3" type="audio/mpeg">浏览器不支持音频播放。</audio>
      <details><summary>展开讲解文字</summary><p>${esc(track.text)}</p></details></div>`;
  }
  function render() {
    return `<div class="sound-lesson">
      <section class="reading-section lesson-intro"><p class="section-kicker">FOUNDATIONS / 声音基础</p><h2>从一条波形，到一个人的声音</h2>
      <p class="section-lead">沿着四个问题理解：声音怎样存储？音色藏在哪里？向量表示什么？编码器怎样学会“认人”？</p>
      <div class="lesson-path"><span>01 波形</span><span>02 音色与向量</span><span>03 编码器</span><span>04 回到 Kokoro</span></div>
      <p class="disclosure">中文讲解由 MiniMax 生成；可调短音由浏览器合成。两者均为教学材料，不是 Kokoro 的效果测试。</p></section>

      <section class="reading-section"><p class="section-kicker">01 / WAVEFORM</p><h2>存下来的是波形，听出来的是特征</h2>
      <p>声音是空气压力随时间的变化。麦克风把它变成电信号，再由采样和量化转换为数字。常见 PCM WAV 保存采样值，以及采样率、声道等信息。</p>
      <ol class="signal-chain" aria-label="录音与播放流程"><li><b>空气振动</b><small>声压随时间变化</small></li><li><b>麦克风</b><small>转换为电信号</small></li><li><b>采样 · 量化</b><small>定时测量，用数字表示</small></li><li><b>波形采样值</b><small>保存、传输或分析</small></li><li><b>播放设备</b><small>转换为电信号，推动扬声器</small></li></ol>
      <div class="lesson-columns"><article><h3>采样率 ≠ 音高</h3><p>24 kHz 表示每秒记录 24,000 个采样值。200 Hz 的基频表示一个周期每秒重复 200 次。这是“测量多快”和“声音振动多快”两个概念。</p></article><article><h3>位深 ≠ 音色</h3><p>16 位有 65,536 种编码，描述幅度记录的精度。文件不会直接存储“温柔度 80%”；相关听感来自波形中的变化规律。</p></article></div>
      ${cite(source.adc, '采样与量化的依据')}
      ${narration('waveform')}

      <div class="wave-lab"><div class="lab-heading"><div><span class="sample-tag">看见变化，也听见变化</span><h3>声音小实验</h3></div><span class="lab-badge">合成周期音 · 非人声</span></div>
      <div class="wave-controls">
        <label for="wave-frequency">基频 <output id="wave-frequency-value">200 Hz</output><input id="wave-frequency" type="range" min="100" max="500" step="10" value="200"><small>改变重复速度，主要影响音高</small></label>
        <label for="wave-amplitude">相对振幅 <output id="wave-amplitude-value">0.60</output><input id="wave-amplitude" type="range" min="0.1" max="1" step="0.05" value="0.6"><small>整体放大波形，主要影响强弱</small></label>
        <label for="wave-harmonics">谐波混合 <output id="wave-harmonics-value">0%</output><input id="wave-harmonics" type="range" min="0" max="1" step="0.05" value="0"><small>加入二、三次谐波，改变声音质感</small></label>
      </div>
      <div class="wave-plot"><svg id="wave-plot" role="img" aria-label="二十毫秒的合成波形"></svg></div>
      <div class="wave-actions"><button class="button" type="button" id="wave-play">试听当前声音 · 2 秒</button><button class="button secondary" type="button" id="wave-reset">恢复初始参数</button><p id="wave-status" role="status">点击后播放，建议先用较低的设备音量。</p></div>
      <p class="disclosure">谐波变化时保持均方根能量一致，但人耳感到的响度仍可能变化。图中纵轴为相对信号值，不是分贝；真实音色还包含起落、噪声和随时间的变化。</p></div>
      <div class="lesson-table-wrap"><table class="lesson-table"><thead><tr><th>听感</th><th>主要声学依据</th><th>不能直接等同</th></tr></thead><tbody>
      <tr><th>音高：低沉或尖高</th><td>周期性与基频</td><td>不是采样率，也不总是最强的频率</td></tr>
      <tr><th>响度：轻或响</th><td>能量、频率与人耳感知</td><td>振幅翻倍不等于听起来响一倍</td></tr>
      <tr><th>音色：声音的质感</th><td>频谱结构、起落包络、气声等</td><td>不同波形不一定代表不同音色</td></tr></tbody></table></div>
      <p class="lesson-takeaway">同一个人换句子、提高音量，波形都会改变。“这个人的音色”指跨这些变化仍相对稳定的一组声音特征，不是一条固定波形。</p>
      ${cite(source.sound, '音高、响度和音色')}
      <details class="lesson-detail"><summary>人声为什么有不同的质感？</summary><p>声带提供声源，声道改变不同频率成分的强弱。咽喉、口腔、鼻腔以及舌唇运动共同影响输出。共振峰既帮助区分元音，也受到声道特征影响。保持相近音高发“啊——呜——”，你就能听到嘴形带来的变化。</p><p>声谱图把短时间片的频谱排在一起，展示时间、频率和能量。变成声谱图只是换一种表示，并没有自动分开“内容”和“音色”。</p>${cite(source.voice, '人声声学：声源与声道')}</details></section>

      <section class="reading-section"><p class="section-kicker">02 / VOICE VECTOR</p><h2>向量是一组条件，不是一段缩短的录音</h2>
      <p>“向量”就是按顺序排列的一组数字。音频采样值按时间排列；声音向量的维度表示模型学到的特征，通常不能逐项命名为“沙哑度”“温柔度”。</p>
      <div class="representation-grid"><article><span class="sample-tag">模型权重</span><h3>怎样生成</h3><p>训练得到的参数，提供从输入条件生成声音的能力。</p></article><article><span class="sample-tag">声音／风格向量</span><h3>用怎样的声音说</h3><code>[0.12, −0.38, 0.71, …]</code><small>数字仅为示意；不是音频，也不是实测向量。</small></article><article><span class="sample-tag">输出波形</span><h3>这一次说出的结果</h3><p>随时间排列的采样值，最终可被保存和播放。</p></article></div>
      ${narration('vector')}
      <h3>Kokoro 的声音文件里有什么？</h3><p>以官方 Kokoro-82M 为例，<code>af_heart.pt</code> 这样的声音文件保存张量，也就是数值数组。声音包包含可供不同输入长度选用的风格向量；推理按音素序列长度选取对应项。它并不等于一个人唯一、恒定的“声音身份证”。</p>
      <div class="vector-split" aria-label="256维风格向量的两组用途"><div><b>前 128 维</b><span>传入波形解码器</span><small>参与最终声音生成</small></div><div><b>后 128 维</b><span>传入韵律预测器</span><small>参与时长、基频等预测</small></div></div>
      <p>因此，这里称“声音与风格向量”比“纯音色向量”更准确。相同维度不代表不同模型之间可以互换向量；生成模型需要学会怎样使用它。</p>
      ${cite(source.model, '向量如何进入模型')} ${cite(source.pipeline, '声音包如何加载与选取')}</section>

      <section class="reading-section"><p class="section-kicker">03 / ENCODER</p><h2>通过“认人”，学会忽略句子的差异</h2>
      <p class="section-lead">下面以典型的说话人编码器为例，解释训练目标。这不是 Kokoro 未公开编码器的实现复现。</p>
      <ol class="signal-chain encoder-chain"><li><b>参考录音</b><small>包含内容、声音和环境信息</small></li><li><b>短时声学特征</b><small>例如对数梅尔声谱图</small></li><li><b>神经网络</b><small>提取并汇总模式</small></li><li><b>说话人向量</b><small>近似概括声音身份</small></li></ol>
      <div class="encoder-lab"><div class="lab-heading"><div><span class="sample-tag">切换一组对比</span><h3>模型应该让谁更接近？</h3></div></div>
      <div class="encoder-options" role="group" aria-label="编码器训练对比"><button type="button" data-pair="speaker" aria-pressed="true">同一个人 · 不同内容</button><button type="button" data-pair="content" aria-pressed="false">不同的人 · 相同内容</button></div>
      <div class="utterance-pair" id="utterance-pair"></div><p class="pair-explanation" id="pair-explanation" aria-live="polite"></p>
      <p class="disclosure">距离关系为训练目标示意，不是某个模型的实际测量或二维投影。</p></div>
      ${narration('encoder')}
      <ol class="training-cycle"><li><b>准备例子</b><span>收集很多人的不同句子，标明说话人。典型说话人验证训练不必提供文字转录。</span></li><li><b>比较向量</b><span>同一个人的录音希望相似，不同人的录音希望能够区分。</span></li><li><b>计算损失</b><span>把“同人不够相似、异人难以区分”变成可优化的数值目标。</span></li><li><b>更新参数</b><span>反向传播不断调整网络，促使它保留跨句子有辨识度的特征。</span></li></ol>
      <p>编码器训练好以后，对新录音提取向量通常是一次推理；并不是每来一段录音，都重新训练整个模型。</p>
      ${cite(source.encoder, '典型说话人编码器：训练与推理')}
      <h3>内容和声音，通过两条通路进入合成模型</h3>
      <div class="dual-path" aria-label="文字与参考声音分别编码，再共同生成波形"><div class="dual-inputs"><div><b>新文字 → 文字／音素编码</b><small>提供“说什么”</small></div><div><b>参考录音 → 说话人编码</b><small>提供“用怎样的声音说”</small></div></div><span class="merge-arrow" aria-hidden="true">→</span><div class="dual-output"><b>合成模型 → 波形</b><small>训练时学会同时使用两类信息</small></div></div>
      <p class="lesson-takeaway">内容与音色共享声学线索，不能按频段一刀切。模型学到的是近似分工；情绪、口音、语速和录音环境都可能混入声音向量。</p>
      <details class="lesson-detail"><summary>如果输入是另一段录音，而不是文字呢？</summary><p>这是语音转换的场景：还需要从原录音提取内容，再结合目标说话人的声音。AutoVC 等方法通过限制内容编码的信息容量，并另行提供说话人条件，促使两条通路分工。信息瓶颈本身并不保证在所有声音上完美分离。</p>${cite(source.autovc, 'AutoVC：内容瓶颈与声音转换')}</details></section>

      <section class="reading-section"><p class="section-kicker">04 / BACK TO KOKORO</p><h2>能使用声音条件，不代表能从录音提取它</h2>
      ${narration('kokoro')}
      <div class="lesson-columns"><article><h3>Kokoro 标准入口已经具备</h3><ul><li>把文字转换为音素。</li><li>加载预设声音包，也可以平均混合已有声音包。</li><li>结合风格预测时长、基频等，再生成波形。</li><li>模型和依赖准备好后，可在本地推理。</li></ul></article><article><h3>用自己的录音克隆，还缺什么？</h3><p>官方模型卡说明未发布配套编码器。标准入口没有“录音 → 我的音色”的完整功能。需要兼容的编码器、额外优化或微调流程，或采用明确支持参考录音的模型。</p><p>混合已有音色不等于复制你的声音；普通声纹模型的向量也不能直接塞给 Kokoro。</p></article></div>
      ${cite(source.card, '官方发布范围')} ${cite(source.pipeline, '标准声音输入接口')}
      <div class="quiz"><h3>用四个问题检查理解</h3>
      <details><summary>波形不同，就一定是音色不同吗？</summary><p>不一定。整体音量变化、说话内容变化也会改变波形。音色涉及频谱、包络等一组特征。</p></details>
      <details><summary>音色向量里的某个数字，就是音高吗？</summary><p>通常不是。维度是模型学习的内部表示，多维共同发挥作用；有明确物理含义的基频预测是另一个概念。</p></details>
      <details><summary>编码器先听懂文字，才能提取声音身份吗？</summary><p>不一定。典型说话人验证训练只用录音和说话人标签，也可以学到跨句子的身份特征。</p></details>
      <details><summary>把我的录音改名为 .pt，就能成为 Kokoro 音色吗？</summary><p>不能。扩展名不改变数据含义，模型需要格式与特征空间都兼容的风格张量。</p></details></div>
      <a class="button" href="#/tool/kokoro/principles">继续看 Kokoro 的实际计算流程 →</a></section>
    </div>`;
  }

  // Constant RMS across harmonic mixtures; peak can exceed one, so plotting and
  // playback reserve headroom. The unit is relative amplitude, never dB SPL.
  function sample(phase, amplitude, harmonics) {
    return amplitude * (Math.sin(phase) + harmonics * (0.55*Math.sin(2*phase) + 0.3*Math.sin(3*phase))) /
      Math.sqrt(1 + harmonics*harmonics*(0.55**2 + 0.3**2));
  }
  let cleanup = () => {};
  function mount() {
    cleanup();
    const root = document.querySelector('.sound-lesson');
    if (!root) return;
    let alive = true, context = null, playing = null, busy = false;
    const state = { frequency: 200, amplitude: 0.6, harmonics: 0 };
    const svg = root.querySelector('#wave-plot');
    const button = root.querySelector('#wave-play');
    const status = root.querySelector('#wave-status');
    const fields = Object.fromEntries(Object.keys(state).map(key => [key, root.querySelector(`#wave-${key}`)]));
    function draw() {
      const width = Math.max(240, svg.parentElement.getBoundingClientRect().width);
      const left = 48, right = width-16, top = 30, bottom = 190;
      svg.setAttribute('viewBox', `0 0 ${width} 236`);
      const x = t => left + t/0.02*(right-left);
      const y = value => (top+bottom)/2 - value/1.6*(bottom-top)/2;
      let path = '';
      for (let i=0; i<=1200; i++) {
        const t = i/1200*0.02;
        path += `${i?'L':'M'}${x(t).toFixed(2)},${y(sample(2*Math.PI*state.frequency*t,state.amplitude,state.harmonics)).toFixed(2)} `;
      }
      svg.innerHTML = `<title>基频 ${state.frequency} Hz、振幅 ${state.amplitude}、谐波混合 ${Math.round(state.harmonics*100)}% 的波形</title>
        <rect x="${left}" y="${top}" width="${right-left}" height="${bottom-top}" fill="none" stroke="var(--line)"/>
        <path d="M${left},${y(0)}H${right}" stroke="var(--line)"/>
        <text x="${left}" y="17">相对信号值</text>
        ${[-1,0,1].map(v=>`<text x="${left-10}" y="${y(v)+4}" text-anchor="end">${v}</text>`).join('')}
        ${[0,10,20].map(v=>`<text x="${x(v/1000)}" y="211" text-anchor="${v===0?'start':v===20?'end':'middle'}">${v}</text>`).join('')}
        <text x="${(left+right)/2}" y="232" text-anchor="middle">时间（毫秒）</text>
        <path d="${path}" fill="none" stroke="var(--green)" stroke-width="2"/>`;
      root.querySelector('#wave-frequency-value').textContent = `${state.frequency} Hz`;
      root.querySelector('#wave-amplitude-value').textContent = state.amplitude.toFixed(2);
      root.querySelector('#wave-harmonics-value').textContent = `${Math.round(state.harmonics*100)}%`;
    }
    function stop() {
      if (playing) { playing.onended = null; playing.stop(); playing.disconnect(); playing = null; }
      button.textContent = '试听当前声音 · 2 秒';
    }
    function silenceNarrations() { root.querySelectorAll('audio').forEach(audio => audio.pause()); }
    for (const key of Object.keys(fields)) fields[key].addEventListener('input', () => {
      stop(); state[key] = Number(fields[key].value); draw();
      status.textContent = '波形已更新，点击试听新参数。';
    });
    root.querySelector('#wave-reset').addEventListener('click', () => {
      stop(); Object.assign(state, { frequency:200, amplitude:0.6, harmonics:0 });
      for (const key of Object.keys(fields)) fields[key].value = state[key];
      draw(); status.textContent = '已恢复初始参数。';
    });
    button.addEventListener('click', async () => {
      if (playing) { stop(); status.textContent = '已停止。'; return; }
      if (busy) return;
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) { status.textContent = '此浏览器不支持合成短音，仍可调节参数观察波形。'; return; }
      busy = true;
      try {
        context ||= new Audio();
        await context.resume();
        if (!alive) return;
        silenceNarrations();
        const rate = context.sampleRate;
        const buffer = context.createBuffer(1, rate*2, rate);
        const values = buffer.getChannelData(0);
        for (let i=0; i<values.length; i++) {
          const fade = Math.max(0, Math.min(1, i/(rate*.025), (values.length-1-i)/(rate*.025)));
          values[i] = 0.12 * fade * sample(2*Math.PI*state.frequency*i/rate, state.amplitude, state.harmonics);
        }
        playing = context.createBufferSource(); playing.buffer = buffer; playing.connect(context.destination);
        playing.onended = () => {
          playing?.disconnect(); playing = null;
          if (alive) { button.textContent = '试听当前声音 · 2 秒'; status.textContent = '试听结束，可以改变一个参数再比较。'; }
        };
        playing.start(); button.textContent = '停止试听';
        status.textContent = `正在播放：${state.frequency} Hz，谐波混合 ${Math.round(state.harmonics*100)}%。`;
      } catch { if (alive) { stop(); status.textContent = '声音未能播放，请检查浏览器的音频权限后重试。'; } }
      finally { busy = false; }
    });
    root.querySelectorAll('audio').forEach(audio => {
      audio.addEventListener('play', () => {
        stop(); status.textContent = '正在播放讲解，短音已停止。';
        root.querySelectorAll('audio').forEach(other => { if (other !== audio) other.pause(); });
      });
      audio.addEventListener('error', () => {
        const details = audio.parentElement.querySelector('details');
        if (details) details.open = true;
      });
    });
    function selectPair(kind) {
      const same = kind === 'speaker';
      root.querySelectorAll('[data-pair]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.pair===kind)));
      root.querySelector('#utterance-pair').innerHTML = `<div class="utterance"><span>A · 你</span><b>“今天下雨了”</b></div><div class="pair-distance ${same?'near':'far'}"><span>${same?'← →':'←　　→'}</span><b>${same?'希望向量接近':'希望向量能区分'}</b></div><div class="utterance"><span>${same?'B · 你':'C · 另一个人'}</span><b>“${same?'我想喝水':'今天下雨了'}”</b></div>`;
      root.querySelector('#pair-explanation').textContent = same ?
        '句子变了，身份没变。只记住某句话的发音，无法稳定识别同一个人。' :
        '句子一样，身份不同。只靠文字内容判断，会把不同的人误认为同一个人。';
    }
    root.querySelectorAll('[data-pair]').forEach(el=>el.addEventListener('click',()=>selectPair(el.dataset.pair)));
    const resize = new ResizeObserver(draw); resize.observe(svg.parentElement);
    draw(); selectPair('speaker');
    cleanup = () => { alive = false; stop(); silenceNarrations(); resize.disconnect(); context?.close().catch(()=>{}); cleanup = () => {}; };
  }
  window.KokoroLearning = { render, mount, dispose: () => cleanup(), sample };
})();
