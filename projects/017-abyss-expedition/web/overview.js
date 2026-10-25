// SPDX-License-Identifier: GPL-3.0-only
const image=document.getElementById('exploration-poster'),viewport=document.getElementById('poster-viewport');
let scale=1,fit=true,drag;
function available(){const css=getComputedStyle(viewport);return viewport.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight);}
function render(){const width=fit?available():Math.round(image.naturalWidth*scale);image.style.width=width+'px';const actual=width/(image.naturalWidth||2600);document.getElementById('poster-zoom').textContent=Math.round(actual*100)+'%';document.getElementById('poster-fit').setAttribute('aria-pressed',String(fit));document.getElementById('poster-100').setAttribute('aria-pressed',String(!fit&&scale===1));viewport.classList.toggle('is-wide',width>available()+1);}
function change(next){const oldWidth=image.getBoundingClientRect().width,cx=(viewport.scrollLeft+viewport.clientWidth/2)/oldWidth,cy=(viewport.scrollTop+viewport.clientHeight/2)/oldWidth;fit=false;scale=Math.max(.12,Math.min(2,next));render();const nextWidth=image.getBoundingClientRect().width;viewport.scrollLeft=cx*nextWidth-viewport.clientWidth/2;viewport.scrollTop=cy*nextWidth-viewport.clientHeight/2;}
document.getElementById('poster-fit').addEventListener('click',()=>{const oldWidth=image.getBoundingClientRect().width,relativeY=(viewport.scrollTop+viewport.clientHeight/2)/oldWidth;fit=true;render();viewport.scrollLeft=0;viewport.scrollTop=relativeY*image.getBoundingClientRect().width-viewport.clientHeight/2;});
document.getElementById('poster-100').addEventListener('click',()=>change(1));
document.getElementById('poster-plus').addEventListener('click',()=>change((fit?available()/image.naturalWidth:scale)*1.25));
document.getElementById('poster-minus').addEventListener('click',()=>change((fit?available()/image.naturalWidth:scale)/1.25));
document.getElementById('poster-top').addEventListener('click',()=>{viewport.scrollTop=0;viewport.scrollLeft=0;});
viewport.addEventListener('pointerdown',event=>{if(event.pointerType!=='mouse'||event.button!==0||!viewport.classList.contains('is-wide'))return;drag={x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};viewport.setPointerCapture(event.pointerId);viewport.classList.add('is-dragging');});
viewport.addEventListener('pointermove',event=>{if(!drag)return;viewport.scrollLeft=drag.left-(event.clientX-drag.x);viewport.scrollTop=drag.top-(event.clientY-drag.y);});
function stop(){drag=undefined;viewport.classList.remove('is-dragging');}
viewport.addEventListener('pointerup',stop);viewport.addEventListener('pointercancel',stop);viewport.addEventListener('lostpointercapture',stop);
new ResizeObserver(()=>{if(image.complete&&image.naturalWidth)render();}).observe(viewport);
image.addEventListener('load',render);image.addEventListener('error',()=>{document.getElementById('poster-zoom').textContent='图片载入失败，请使用下载链接重试';});
if(image.complete&&image.naturalWidth)render();
