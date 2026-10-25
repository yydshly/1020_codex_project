// SPDX-License-Identifier: GPL-3.0-only
// Pure screen-space subtraction shared by cue placement and camera framing.
const finite=Number.isFinite;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const rectangle=(x,y,w,h)=>({x,y,w,h});
const area=r=>r.w*r.h;
function subtract(source,mask){
  const left=Math.max(source.x,mask.x),top=Math.max(source.y,mask.y),right=Math.min(source.x+source.w,mask.x+mask.w),bottom=Math.min(source.y+source.h,mask.y+mask.h);
  if(right<=left||bottom<=top)return [source];
  const out=[];
  // Full-height side strips plus only the intersection-width top and bottom
  // strips are disjoint, including when later masks cross an earlier split.
  if(left>source.x)out.push(rectangle(source.x,source.y,left-source.x,source.h));
  if(right<source.x+source.w)out.push(rectangle(right,source.y,source.x+source.w-right,source.h));
  if(top>source.y)out.push(rectangle(left,source.y,right-left,top-source.y));
  if(bottom<source.y+source.h)out.push(rectangle(left,bottom,right-left,source.y+source.h-bottom));
  return out;
}

/**
 * Rectangles are pixels relative to the rendered scene, not the document.
 * occupied is padded by eight pixels before clipping. Returned regions are
 * normalized to the same scene. A fallback focus is never reported as clear.
 */
export function computeCueLayout({width,height,occupied=[],margin=12,minWidth=96,minHeight=70}={}){
  if(![width,height,minWidth,minHeight].every(n=>finite(n)&&n>0)||!finite(margin)||margin<0||!Array.isArray(occupied))throw new TypeError('Cue layout requires finite positive dimensions and rectangle data');
  const base=rectangle(margin,54,width-margin*2,height-margin-54),masks=[];
  for(const item of occupied){
    if(!item||!['x','y','w','h'].every(k=>finite(item[k]))||item.w<0||item.h<0)throw new TypeError('Occupied cue rectangles must have finite, nonnegative dimensions');
    if(item.w&&item.h)masks.push(rectangle(item.x-8,item.y-8,item.w+16,item.h+16));
  }
  let pieces=base.w>0&&base.h>0?[base]:[];
  for(const mask of masks)pieces=pieces.flatMap(piece=>subtract(piece,mask));
  const diagonal=Math.hypot(width,height),cx=width*.5,cy=height*.5;
  const score=r=>{
    const dx=Math.max(r.x-cx,0,cx-r.x-r.w),dy=Math.max(r.y-cy,0,cy-r.y-r.h),centrality=1-clamp(Math.hypot(dx,dy)/(diagonal*.5),0,1),ratio=Math.min(r.w,r.h)/Math.max(r.w,r.h);
    return area(r)*(.65+.35*centrality)*(.75+.25*Math.min(1,ratio/.45));
  };
  const selected=pieces.filter(r=>r.w>=minWidth&&r.h>=minHeight).sort((a,b)=>score(b)-score(a)||area(b)-area(a)||a.y-b.y||a.x-b.x).slice(0,6);
  const valid=selected.length>0,rects=selected.map(r=>Object.freeze({...r}));
  const regions=rects.map(r=>Object.freeze({left:r.x/width,top:r.y/height,right:(r.x+r.w)/width,bottom:(r.y+r.h)/height}));
  // Extremely thin residual sidebars are still valid label regions, but should
  // not become the primary camera composition if a broader patch is available.
  const broad=rects.filter(r=>r.w>=Math.max(minWidth,Math.min(180,width*.28))&&r.h>=Math.max(minHeight,Math.min(110,height*.15)));
  const primary=broad[0]||rects[0],fallback=rectangle(width*.2,height*.2,width*.6,height*.6);
  return Object.freeze({valid,regions:Object.freeze(regions),rects:Object.freeze(rects),focus:Object.freeze({...(primary||fallback),valid})});
}
