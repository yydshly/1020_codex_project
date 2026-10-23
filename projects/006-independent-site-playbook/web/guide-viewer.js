(() => {
  'use strict';
  const viewer=document.querySelector('#viewer');
  const image=document.querySelector('#guide-image');
  const slider=document.querySelector('#zoom');
  const value=document.querySelector('#zoom-value');
  let scale=1;
  let fitted=true;
  const sections=window.GUIDE_SECTIONS||[];
  const select=document.querySelector('#section');
  for(const section of sections){const option=document.createElement('option');option.value=section.y;option.textContent=section.label;select.append(option);}
  function resizeFrame(){document.documentElement.style.setProperty('--toolbar-height',`${document.querySelector('#toolbar').getBoundingClientRect().height}px`);}
  function zoom(next,keepPosition=true){next=Math.min(1.5,Math.max(.1,next));const old=scale;const top=viewer.scrollTop;const left=viewer.scrollLeft;scale=next;image.style.width=`${1800*scale}px`;slider.value=String(Math.round(scale*100));value.textContent=`${Math.round(scale*100)}%`;if(keepPosition){viewer.scrollTop=top/old*scale;viewer.scrollLeft=left/old*scale;}}
  function fit(){resizeFrame();const padding=parseFloat(getComputedStyle(viewer).paddingLeft)*2;zoom((viewer.clientWidth-padding-3)/1800);fitted=true;}
  document.querySelector('#zoom-in').addEventListener('click',()=>{zoom(scale+.1);fitted=false;});
  document.querySelector('#zoom-out').addEventListener('click',()=>{zoom(scale-.1);fitted=false;});
  document.querySelector('#actual').addEventListener('click',()=>{zoom(1);fitted=false;});
  document.querySelector('#fit').addEventListener('click',fit);
  slider.addEventListener('input',()=>{zoom(Number(slider.value)/100);fitted=false;});
  select.addEventListener('change',()=>{viewer.scrollTop=Number(select.value)*scale;});
  viewer.addEventListener('keydown',event=>{if(event.key==='+'||event.key==='='){event.preventDefault();zoom(scale+.1);fitted=false;}else if(event.key==='-'){event.preventDefault();zoom(scale-.1);fitted=false;}else if(event.key==='0'){event.preventDefault();fit();}});
  addEventListener('resize',()=>{resizeFrame();if(fitted)fit();});
  image.addEventListener('load',()=>{if(fitted)fit();});
  fit();
})();
