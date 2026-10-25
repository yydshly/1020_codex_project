// SPDX-License-Identifier: GPL-3.0-only
'use strict';
(() => {
  let scale=1;
  const image=document.getElementById('guide-image');
  function update(next){scale=Math.min(3,Math.max(0.5,next));image.style.width=`${scale*100}%`;image.style.height='auto';document.getElementById('zoom-level').textContent=`${Math.round(scale*100)}%` .replace('100%','适应宽度');}
  document.getElementById('zoom-in').addEventListener('click',()=>update(scale+0.25));
  document.getElementById('zoom-out').addEventListener('click',()=>update(scale-0.25));
  document.getElementById('zoom-fit').addEventListener('click',()=>update(1));
})();
