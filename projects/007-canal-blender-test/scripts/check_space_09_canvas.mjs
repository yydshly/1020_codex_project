// Read-only Canvas 2D test adapter. Actual production paths are rasterized by
// the installed Windows drawing backend; no package, browser or GPU is used.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const renderer=fileURLToPath(new URL('./check_space_09_canvas.ps1',import.meta.url));
export function createAuditCanvas(initialWidth=1,initialHeight=1){
 let width=initialWidth,height=initialHeight,commands=[],path=[],pixels=null;
 const stats={backend:'Windows System.Drawing antialiased actual production paths',rasterizations:0,drawCalls:0};
 const context={fillStyle:'#000000',strokeStyle:'#000000',lineWidth:1,
  clearRect(){commands=[];pixels=null;},beginPath(){path=[];},
  moveTo(x,y){path.push(['M',x,y]);},lineTo(x,y){path.push(['L',x,y]);},
  quadraticCurveTo(...v){path.push(['Q',...v]);},bezierCurveTo(...v){path.push(['C',...v]);},closePath(){path.push(['Z']);},
  fill(){commands.push({kind:'fill',style:this.fillStyle,path:structuredClone(path)});stats.drawCalls++;pixels=null;},
  stroke(){commands.push({kind:'stroke',style:this.strokeStyle,lineWidth:this.lineWidth,path:structuredClone(path)});stats.drawCalls++;pixels=null;},
  fillRect(x,y,w,h){this.beginPath();this.moveTo(x,y);this.lineTo(x+w,y);this.lineTo(x+w,y+h);this.lineTo(x,y+h);this.closePath();this.fill();},
  createImageData(w,h){return{data:new Uint8ClampedArray(w*h*4),width:w,height:h};},
  getImageData(x,y,w,h){
   if(!pixels){
    const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',renderer],{input:JSON.stringify({width,height,commands}),encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true});
    if(result.status!==0)throw new Error('Canvas rasterization failed: '+result.stderr);
    const bgra=Buffer.from(result.stdout.trim(),'base64');if(bgra.length!==width*height*4)throw new Error('Unexpected raster byte count '+bgra.length);
    pixels=new Uint8ClampedArray(bgra.length);for(let i=0;i<bgra.length;i+=4){pixels[i]=bgra[i+2];pixels[i+1]=bgra[i+1];pixels[i+2]=bgra[i];pixels[i+3]=bgra[i+3];}stats.rasterizations++;
   }
   const data=new Uint8ClampedArray(w*h*4);for(let j=0;j<h;j++)for(let i=0;i<w;i++)if(x+i>=0&&x+i<width&&y+j>=0&&y+j<height)data.set(pixels.subarray(((y+j)*width+x+i)*4,((y+j)*width+x+i)*4+4),(j*w+i)*4);
   return{data,width:w,height:h};
  },
 };
 const canvas={getContext:()=>context,auditStats:stats};context.canvas=canvas;
 for(const key of ['width','height'])Object.defineProperty(canvas,key,{get:()=>key==='width'?width:height,set:value=>{if(key==='width')width=value;else height=value;commands=[];pixels=null;}});
 return canvas;
}
