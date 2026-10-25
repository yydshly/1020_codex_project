// SPDX-License-Identifier: GPL-3.0-only
// Extract only the geometry needed by this independent three-stop story.
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const project=path.resolve(__dirname,'..');
const upstream=path.resolve(process.argv[2]||path.join(project,'../015-jiangshan-atlas/web/upstream'));
const pin='53059f1c7fed305807b19365857a5f135daf3ac6';
const sourceManifestPath=path.join(upstream,'SOURCE.json');
if(fs.existsSync(sourceManifestPath)) {
  if(JSON.parse(fs.readFileSync(sourceManifestPath,'utf8')).commit!==pin) throw new Error('Upstream version mismatch');
} else {
  const commit=require('node:child_process').execFileSync('git',['-C',upstream,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  if(commit!==pin) throw new Error('Expected the pinned upstream checkout');
}
const sandbox={window:{}};
vm.createContext(sandbox);
const inputs=['js/map_data.js','js/lore_data.js','js/china_geo_data.js','js/atlas_snapshots.js'];
for(const input of inputs) vm.runInContext(fs.readFileSync(path.join(upstream,input),'utf8'),sandbox,{filename:input});
const data=sandbox.window;
const dynasty=data.DYNASTY_DATA.find(item=>item.key==='beisong');
const phaseFor=year=>dynasty.phases.find(phase=>year<phase.until)||dynasty.phases.at(-1);
const keys=[...new Set([1080,1094,1097].map(year=>phaseFor(year).snap))];
const geometry=shape=>({type:shape.type,coordinates:shape.coordinates});
const boundsFor=shape=> {
  const points=shape.type==='Polygon'?shape.coordinates.flat():shape.coordinates.flat(2);
  return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
};
const snapshots={};
for(const key of keys) {
  const source=data.ATLAS_SNAPSHOTS[key];
  snapshots[key]={caption:source.caption,features:(source.polities||[]).filter(feature=>{
    const b=boundsFor(feature.shape);
    return b[0]<127&&b[2]>100&&b[1]<38&&b[3]>12;
  }).map(feature=>({title:feature.title,role:feature.role,anchor:feature.anchor,geometry:geometry(feature.shape)}))};
}
const rivers=data.HYDRO_DATA.rivers.filter(river=>['Yangtze','Yellow','Pearl','Han','Gan','Xiang','Xijiang','Jialing','Min','Dong','Bei'].includes(river.name));
const siteRules=[
  {id:'huangzhou',year:1080,match:/^黄州$/},
  {id:'huizhou',year:1094,match:/^惠州$/},
  {id:'danzhou',year:1097,match:/昌化军|儋州/},
];
const places=siteRules.map(rule=>{
  const settlement=data.ATLAS_LORE_DATA.HISTORICAL_JOURNEYS.find(item=>item.key==='sushi').stops.find(item=>item.year===rule.year);
  if(!settlement) throw new Error(`Missing source journey stop: ${rule.id}`);
  return {id:rule.id,year:rule.year,snapshot:phaseFor(rule.year).snap,coord:rule.id==='danzhou'?[109.35,19.74]:settlement.coord,
    upstreamReference:{year:settlement.year,name:settlement.ancientZh,coord:settlement.coord},
    coordinateNote:rule.id==='danzhou'?'Adjusted to the Zhonghe historic-seat area using cited location references; approximate, not an individual residence.':'City-area reference from the pinned upstream journey.'};
});
const result={
  source:{repository:'https://github.com/DeanChensj/jiangshan-map',commit:pin,selectedLayers:['polities','rivers'],note:'Historical shapes are schematic. No prefecture or regional administrative boundary layers are extracted.'},
  projection:{width:1000,height:700,bounds:{west:66,east:142,south:14,north:55}},
  snapshots,rivers,places,
};
const assets=path.join(project,'web/assets');
fs.mkdirSync(assets,{recursive:true});
fs.writeFileSync(path.join(assets,'map-data.json'),JSON.stringify(result)+'\n');
fs.copyFileSync(path.join(upstream,'assets/terrain_relief.webp'),path.join(assets,'terrain.webp'));
fs.copyFileSync(path.join(upstream,'LICENSE'),path.join(project,'LICENSE'));
fs.copyFileSync(path.join(upstream,'LICENSE'),path.join(assets,'LICENSE-upstream.txt'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const provenance={repository:result.source.repository,commit:pin,extracted_on:'2026-10-24',inputs:inputs.map(input=>({path:input,sha256:sha(path.join(upstream,input))})),outputs:['map-data.json','terrain.webp'].map(name=>({path:name,sha256:sha(path.join(assets,name))})),layers:result.source.selectedLayers,license:'GPL-3.0 code and upstream source terms; see NOTICE.md',changes:'Data subset only. Independent renderer and story UI; no upstream application or iframe.'};
fs.writeFileSync(path.join(assets,'map-source.json'),JSON.stringify(provenance,null,2)+'\n');
console.log(JSON.stringify({snapshots:keys,features:Object.values(snapshots).reduce((sum,item)=>sum+item.features.length,0),rivers:rivers.length,places:places.map(item=>({id:item.id,year:item.year,coord:item.coord})),bytes:fs.statSync(path.join(assets,'map-data.json')).size},null,2));
