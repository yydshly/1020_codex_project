'use strict';
// CPU-only layout render and review panels; no browser or scene generation.
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),workspace=path.resolve(root,'../..');
const localRequire=createRequire(path.join(workspace,'.cache','understanding-map-renderer','package.json'));
const {Resvg}=localRequire('@resvg/resvg-js');
const input=path.join(root,'assets','programmable-worlds-map-20261026.svg');
const output=path.join(root,'assets','programmable-worlds-map-20261026.png');
const review=path.join(root,'artifacts','project-map-20261026');fs.mkdirSync(review,{recursive:true});
const fonts=['C:/Windows/Fonts/msyh.ttc','C:/Windows/Fonts/msyhbd.ttc','C:/Windows/Fonts/segoeui.ttf'];
const svg=fs.readFileSync(input,'utf8');
const options={font:{fontFiles:fonts,loadSystemFonts:false,defaultFontFamily:'Microsoft YaHei'}};
const full=new Resvg(svg,options).render();if(full.width!==1800||full.height!==7280)throw Error('Map size mismatch');
fs.writeFileSync(output,full.asPng());
const panels=[['source',0,1170],['exploration',1140,980],['future',2110,1320],['extensions',3425,580],['routes',4000,850],['controls',4840,780],['next-time',5580,740],['value',6300,980]];
for(const[name,y,h]of panels){const region=svg.replace('width="1800" height="7280" viewBox="0 0 1800 7280"',`width="1800" height="${h}" viewBox="0 ${y} 1800 ${h}"`);fs.writeFileSync(path.join(review,name+'.png'),new Resvg(region,options).render().asPng());}
console.log(JSON.stringify({status:'rendered-awaiting-review',output,width:full.width,height:full.height,bytes:fs.statSync(output).size,review,panels:panels.map(x=>x[0])}));
