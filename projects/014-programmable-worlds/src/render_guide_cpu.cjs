'use strict';

// CPU-only guide rasterisation. No browser, Electron, GPU, desktop input,
// network install, cache clearing, or acceptance-state mutation is involved.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {createRequire}=require('node:module');
const {spawnSync}=require('node:child_process');

const projectRoot=path.resolve(__dirname,'..');
const workspaceRoot=path.resolve(projectRoot,'../..');
const allowedOutput=path.join(workspaceRoot,'.cache','014-guide-qa');
const dependencyPackage=path.join(workspaceRoot,'.cache','understanding-map-renderer','package.json');
const localRequire=createRequire(dependencyPackage);
const {Resvg}=localRequire('@resvg/resvg-js');
const resvgVersion=localRequire('@resvg/resvg-js/package.json').version;
const args=process.argv.slice(2);
const value=(flag,fallback)=>{const i=args.indexOf(flag);return i<0?fallback:args[i+1];};
const input=path.resolve(projectRoot,value('--input','assets/programmable-worlds-guide.svg'));
const output=path.resolve(workspaceRoot,value('--output-dir','.cache/014-guide-qa'));
const tag=value('--tag','guide-independent-20261025');
const relativeOutput=path.relative(allowedOutput,output);
if(relativeOutput.startsWith('..')||path.isAbsolute(relativeOutput))throw new Error('Output must stay under F: workspace .cache/014-guide-qa');
if(!/^[A-Za-z0-9_-]+$/.test(tag))throw new Error('Unsafe output tag');
if(!input.startsWith(projectRoot+path.sep)||!fs.existsSync(input))throw new Error('Input must be an existing SVG in this project');
const fonts=['C:/Windows/Fonts/msyh.ttc','C:/Windows/Fonts/msyhbd.ttc','C:/Windows/Fonts/segoeui.ttf','C:/Windows/Fonts/segoeuib.ttf'].filter(file=>fs.existsSync(file));
if(!fonts.some(file=>file.endsWith('/msyh.ttc')))throw new Error('Microsoft YaHei is needed for Chinese layout verification');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const svg=fs.readFileSync(input);
const sourceSha256=sha(svg);
const expected=value('--expected-sha',null);
if(expected&&expected!==sourceSha256)throw new Error('SVG changed before rasterisation');

if(!args.includes('--render')){
 console.log(JSON.stringify({status:'ready',scope:'CPU tool availability only; no rendering or acceptance performed',renderer:'@resvg/resvg-js',version:resvgVersion,dependencyPackage,input,sourceSha256,output,fonts,renderCommand:'node projects/014-programmable-worlds/src/render_guide_cpu.cjs --render --tag '+tag+' --expected-sha NEW_FINAL_SVG_SHA256'}));
 process.exit(0);
}

const evidencePath=path.join(projectRoot,'notes','guide-final-evidence.json');
if(!fs.existsSync(evidencePath)||JSON.parse(fs.readFileSync(evidencePath,'utf8')).status!=='accepted')throw new Error('Wait for the actual final accepted evidence manifest before rendering the new guide');
const text=svg.toString('utf8');
if(!text.includes('旧船坞的下一班船')||!text.includes('shipyard-station/index.html'))throw new Error('Input is an old shared-world guide, not the newly generated independent-worlds guide');
const webCopy=fs.readFileSync(path.join(projectRoot,'web','assets','programmable-worlds-guide.svg'));
if(sha(webCopy)!==sourceSha256)throw new Error('The two published SVG copies differ');

fs.mkdirSync(output,{recursive:true});
const png=path.join(output,tag+'-full.png');
if(fs.existsSync(png))throw new Error('Use a new tag; previous QA artifacts are preserved');
const image=new Resvg(svg,{fitTo:{mode:'width',value:1800},font:{fontFiles:fonts,loadSystemFonts:false,defaultFontFamily:'Microsoft YaHei'}}).render();
if(image.width!==1800||image.height!==4830)throw new Error('Unexpected guide dimensions');
fs.writeFileSync(png,image.asPng());
const regions=[
 {name:'source',box:[0,0,1800,1040]},
 {name:'directions',box:[0,1040,1800,1900]},
 {name:'works',box:[0,1880,1800,2940]},
 {name:'window-detail',box:[64,1920,900,2936]},
 {name:'station-detail',box:[908,1920,1736,2936]},
 {name:'workflow',box:[0,2930,1800,3840]},
 {name:'evidence',box:[0,3830,1800,4830]}
];
for(const region of regions)region.path=path.join(output,tag+'-'+region.name+'.png');
const cropScript='import json,sys\nfrom PIL import Image\ni=Image.open(sys.argv[1]);regions=json.loads(sys.argv[2])\nfor r in regions:i.crop(tuple(r["box"])).save(r["path"])\nprint(json.dumps({"crops":len(regions),"fullSize":list(i.size)}))';
const cropped=spawnSync('python',['-c',cropScript,png,JSON.stringify(regions)],{shell:false,windowsHide:true,encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
if(cropped.status!==0)throw new Error('CPU crop failed: '+cropped.stderr);
const metadata={status:'rendered-awaiting-visual-inspection',scope:'CPU SVG layout artifacts only; this does not establish runtime or artwork acceptance',renderer:'@resvg/resvg-js',rendererVersion:resvgVersion,input,sourceSha256,evidenceManifestSha256:sha(fs.readFileSync(evidencePath)),width:image.width,height:image.height,fullPNG:png,regions,fonts};
const metadataPath=path.join(output,tag+'-render.json');fs.writeFileSync(metadataPath,JSON.stringify(metadata,null,2)+'\n');
console.log(JSON.stringify({status:metadata.status,fullPNG:png,metadata:metadataPath,crops:regions.map(r=>r.path),sourceSha256}));
