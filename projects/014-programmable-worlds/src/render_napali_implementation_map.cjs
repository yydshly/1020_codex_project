'use strict';
// CPU-only export of a code-authored diagram; never starts a GPU scene.
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),workspace=path.resolve(root,'../..');
const {Resvg}=createRequire(path.join(workspace,'.cache','understanding-map-renderer','package.json'))('@resvg/resvg-js');
const file=path.join(root,'assets','napali-implementation-map-20261027.svg');
const svg=fs.readFileSync(file,'utf8');
const options={font:{fontFiles:['C:/Windows/Fonts/msyh.ttc','C:/Windows/Fonts/msyhbd.ttc','C:/Windows/Fonts/segoeui.ttf'],loadSystemFonts:false,defaultFontFamily:'Microsoft YaHei'}};
const result=new Resvg(svg,options).render();
if(result.width!==2160||result.height!==6460)throw Error('Unexpected poster dimensions');
const output=path.join(root,'assets','napali-implementation-map-20261027.png');
fs.writeFileSync(output,result.asPng());
const review=path.join(root,'artifacts','napali-implementation-map-20261027');fs.mkdirSync(review,{recursive:true});
for(const[name,y,h]of[['source',0,1270],['pipeline-algorithms',1250,2010],['parameters',3250,1170],['tools-reuse',4425,2035]]){
  const region=svg.replace('width="2160" height="6460" viewBox="0 0 2160 6460"',`width="2160" height="${h}" viewBox="0 ${y} 2160 ${h}"`);
  fs.writeFileSync(path.join(review,name+'.png'),new Resvg(region,options).render().asPng());
}
console.log(JSON.stringify({output,width:result.width,height:result.height,bytes:fs.statSync(output).size,review}));
