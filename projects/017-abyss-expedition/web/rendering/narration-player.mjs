// SPDX-License-Identifier: GPL-3.0-only
// A media adapter: the audio clock drives the film while speech is playing.
// The supplied media element can also be replaced with a fake in Node tests.
export function createNarrationPlayer({audio,onStatus=()=>{},onBlocked=()=>{},resolveSource=file=>file}){
  let current=null,source='',enabled=true,status='',generation=0,sourceGeneration=0,loading=false,pending=false,failed=false,destroyed=false;
  const removers=[];
  const listen=(type,handler)=>{audio.addEventListener(type,handler);removers.push(()=>audio.removeEventListener(type,handler));};
  const report=(kind,text)=>{const key=`${kind}:${text}`;if(key!==status){status=key;onStatus({kind,text,enabled});}};
  const clip=()=>current?.shot.audio;
  const atTail=()=>Boolean(clip()&&(audio.ended||current.shotElapsed>=Math.min(clip().duration,Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:clip().duration)-.025));
  function setPosition(){
    if(!clip())return;
    const value=Math.min(clip().duration,Math.max(0,current.shotElapsed));
    try{if(Math.abs(audio.currentTime-value)>.06)audio.currentTime=value;}catch{/* Metadata has not arrived; loadedmetadata applies this again. */}
  }
  function play(){
    if(destroyed||loading||!enabled||!current?.active||!current.playing||!clip()||atTail()||pending||!audio.paused||failed)return;
    const token=generation;pending=true;
    Promise.resolve(audio.play()).then(()=>{
      if(token!==generation){if(!enabled||!current?.active||!current.playing)audio.pause();return;}pending=false;
      if(!enabled||!current?.active||!current.playing)audio.pause();
      else report('playing','MiniMax 语音讲解');
    }).catch(()=>{
      if(token!==generation)return;pending=false;failed=true;
      if(!enabled||!current?.active||!current.playing){failed=false;return;}
      report('blocked','讲解未开始，请点击「重试语音」');onBlocked();
    });
  }
  function sync(state,{rate=1,discontinuity=false}={}){
    if(destroyed)return;
    const wasPlaying=current?.active&&current.playing;current=state;
    if(wasPlaying&&(!state.active||!state.playing)){generation++;pending=false;audio.pause();}
    if(audio.playbackRate!==rate)audio.playbackRate=rate;
    const next=state.shot.audio?.file||'';
    if(next!==source){
      generation++;pending=false;failed=false;audio.pause();source=next;const loadToken=++sourceGeneration;
      if(next){
        loading=true;audio.removeAttribute('src');audio.load();report('loading','正在载入 MiniMax 讲解…');
        const commit=url=>{if(destroyed||loadToken!==sourceGeneration)return;loading=false;audio.src=url;audio.load();setPosition();play();};
        const reject=()=>{if(destroyed||loadToken!==sourceGeneration)return;loading=false;failed=true;if(!enabled){report('off','语音已关闭 · 字幕放映');return;}report('error','语音加载失败，请重试或关闭语音继续');onBlocked();};
        try{const resolved=resolveSource(next);if(typeof resolved==='string')commit(resolved);else Promise.resolve(resolved).then(commit,reject);}catch{reject();}
      }
    }else if(discontinuity){generation++;pending=false;failed=false;audio.pause();setPosition();}
    if(!state.active||!state.playing||!enabled||atTail())audio.pause();else play();
    if(!enabled)report('off','语音已关闭 · 字幕放映');
    else if(!next)report('missing','此章暂无语音 · 字幕放映');
    else if(!state.playing&&!failed)report('paused',state.completed?'讲解已结束':'MiniMax 讲解已暂停');
    else if(atTail()&&!failed)report('tail','本章讲解完成');
  }
  function advance(state,wallDelta){
    if(!enabled||!state.shot.audio)return wallDelta;
    if(failed||loading)return 0;
    const duration=state.shot.audio.duration;
    // Hold the camera during buffering. At the end, retain a short visual beat.
    const mediaDuration=Number.isFinite(audio.duration)&&audio.duration>0?Math.min(duration,audio.duration):duration;
    if(state.shotElapsed>=mediaDuration-.025)return wallDelta;
    // A slow WebGL frame must not leave the film seconds behind the voice.
    // The UI may seek the film clock to this media position without seeking
    // the audio itself. Decoder padding is excluded from the final beat.
    return Math.max(0,Math.min(mediaDuration,audio.currentTime)-state.shotElapsed);
  }
  function setEnabled(value){enabled=Boolean(value);failed=false;generation++;pending=false;audio.pause();if(enabled){if(!loading&&!audio.getAttribute?.('src'))source='';setPosition();}if(current)sync(current);return enabled;}
  function retry(){failed=false;generation++;pending=false;audio.pause();if(!audio.getAttribute?.('src')){source='';if(current)sync(current);return;}if(audio.error)audio.load();setPosition();play();}
  listen('loadedmetadata',()=>{if(destroyed)return;setPosition();play();});
  listen('playing',()=>{if(enabled&&current?.playing)report('playing','MiniMax 语音讲解');});
  listen('waiting',()=>{if(enabled&&current?.playing)report('loading','语音缓冲中，镜头同步等待…');});
  listen('error',()=>{if(!source||destroyed)return;failed=true;if(!enabled){report('off','语音已关闭 · 字幕放映');return;}report('error','语音加载失败，请重试或关闭语音继续');onBlocked();});
  return {sync,advance,setEnabled,retry,get enabled(){return enabled;},destroy(){destroyed=true;generation++;sourceGeneration++;pending=false;audio.pause();audio.removeAttribute('src');audio.load();removers.forEach(remove=>remove());}};
}

/** Fully buffered object URLs support accurate MP3 seeks even on a static
 * development server that does not implement HTTP Range. No credentials. */
export function createNarrationAssetCache({fetchImpl=globalThis.fetch,createUrl=blob=>URL.createObjectURL(blob),revokeUrl=url=>URL.revokeObjectURL(url)}={}){
  const entries=new Map(),urls=new Set(),controller=new AbortController();let disposed=false;
  async function resolve(file){
    if(disposed)throw Error('Narration cache disposed');
    if(!entries.has(file)){
      const pending=fetchImpl(file,{signal:controller.signal}).then(response=>{if(!response.ok)throw Error('Narration unavailable');return response.blob();}).then(blob=>{if(disposed)throw Error('Narration cache disposed');const url=createUrl(blob);urls.add(url);return url;}).catch(error=>{entries.delete(file);throw error;});
      entries.set(file,pending);
    }
    return entries.get(file);
  }
  return {resolve,destroy(){disposed=true;controller.abort();for(const url of urls)revokeUrl(url);urls.clear();entries.clear();}};
}
