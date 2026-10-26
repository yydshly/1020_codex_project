// M3 ecological structure: terrain-scale habitat, local competition and
// coherent tree cohorts. This module owns no renderer or GPU resource.
export const ECOLOGY_REVISION='m4-habitat-cohorts-and-sdf-support-1';
export const TREE_FAMILIES=['spreading-canopy','tiered-leader','river-leaner','young-understorey'];
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const fract=v=>v-Math.floor(v);
function hash(x,z){let h=Math.imul(x|0,374761393)^Math.imul(z|0,668265263);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;}
export function habitatNoise(x,z,scale,seed=0){
  x=x/scale+seed;z=z/scale-seed*.73;
  const ix=Math.floor(x),iz=Math.floor(z),u=smooth(0,1,fract(x)),v=smooth(0,1,fract(z));
  return mix(mix(hash(ix,iz),hash(ix+1,iz),u),mix(hash(ix,iz+1),hash(ix+1,iz+1),u),v);
}
export const habitatRiverCenter=z=>46*Math.sin((z+140)*.00168)+28*Math.sin((z-70)*.0031)-430*(1-smooth(-1350,-350,z));
export const habitatRiverHalfWidth=z=>170*(1+.11*Math.sin(z*.0013-.4)+.055*Math.cos(z*.0037));

export function createHabitatSampler(terrain,{cellSize=12}={}){
  const cells=new Map();
  const height=(x,z)=>terrain?.sampleHeight?.(x,z)??0;
  function sample(x,z){
    const ix=Math.floor(x/cellSize),iz=Math.floor(z/cellSize),key=ix+','+iz;
    if(cells.has(key))return cells.get(key);
    const xx=(ix+.5)*cellSize,zz=(iz+.5)*cellSize,e=2.5;
    const y=height(xx,zz),gx=(height(xx+e,zz)-height(xx-e,zz))/(2*e),gz=(height(xx,zz+e)-height(xx,zz-e))/(2*e);
    const raw=terrain?.sampleAttributes?.(xx,zz),vegetation=terrain?.sampleVegetation?.(xx,zz);
    const ao=clamp(raw?.[0]??.82),convexity=raw?.[1]??0,flow=clamp(raw?.[3]??habitatNoise(xx,zz,90,37));
    const bank=Math.abs(xx-habitatRiverCenter(zz))-habitatRiverHalfWidth(zz),slope=Math.hypot(gx,gz);
    const drainage=clamp(.50*flow+.26*(1-smooth(-2.5,1.2,convexity))+.24*Math.exp(-Math.max(0,bank)/130));
    const moisture=clamp(.22+.52*drainage+.17*(1-ao)+.12*(habitatNoise(xx,zz,62,19)-.5)-.22*smooth(.25,.8,slope));
    const cohort=.61*habitatNoise(xx,zz,145,4.3)+.39*habitatNoise(xx,zz,49,37.2);
    // Uneven disturbance ribbons create feathered light wells. These are not
    // fixed circles punched into an otherwise uniform stand.
    const disturbance=smooth(.64,.83,.67*habitatNoise(xx,zz,78,71.1)+.33*habitatNoise(xx,zz,23,113.5));
    const maturity=clamp(smooth(.24,.77,cohort)*(.84+.23*moisture)-.42*disturbance);
    const lowland=1-smooth(36,88,y),exposure=clamp(.13+.39*smooth(.2,.85,slope)+.30*smooth(.8,6,convexity)+.25*(1-ao));
    const site={x:xx,z:zz,y,gx,gz,slope,bank,ao,convexity,flow,moisture,drainage,cohort,disturbance,maturity,lowland,exposure,
      cover:clamp(vegetation?.[0]??.65),forest:clamp(vegetation?.[3]??.55)};
    cells.set(key,site);return site;
  }
  return {sample,size:()=>cells.size,clear:()=>cells.clear()};
}

export function composeForestPopulation(records,terrain){
  const sampler=createHabitatSampler(terrain),trees=records.filter(t=>!t.bush&&t.anchorMode!=='sdf-surface'),index=new Map(),spacing=24;
  for(const t of trees){const key=Math.floor(t.x/spacing)+','+Math.floor(t.z/spacing);if(!index.has(key))index.set(key,[]);index.get(key).push(t);}
  const result=[],removed={trees:0,bushes:0},families=[0,0,0,0],ages=[0,0,0],competition={max:0,sum:0,samples:0};
  let relocated=0,exposedRootCandidates=0,sdfAnchoredTrees=0,sdfAnchoredBushes=0;
  for(const original of records){
    if(original.anchorMode==='sdf-surface'){
      if(!original.sdfAnchor?.position?.every(Number.isFinite)||!original.sdfAnchor?.normal?.every(Number.isFinite))throw new Error('Missing actual SDF root support');
      // Preparation already decided real support, age and architecture. H
      // relocation/re-embedding would detach these exact signed-field roots.
      result.push(original);if(original.bush)sdfAnchoredBushes++;else{
        sdfAnchoredTrees++;families[original.architecture]++;const age=original.maturity??.45;ages[age<.30?0:age<.66?1:2]++;
      }continue;
    }
    const site=sampler.sample(original.x,original.z),r=hash(Math.floor(original.x*13+original.seed*251),Math.floor(original.z*17-original.seed*173));
    // Dense shrub colonies follow drainage pockets and thicket edges, with
    // genuinely quiet humus between them. An almost constant survival rate
    // left a uniformly sprinkled shrub under every part of the canopy.
    const shrubField=.62*habitatNoise(original.x,original.z,18,144.7)+.38*habitatNoise(original.x,original.z,5.2,68.3);
    const shrubColony=smooth(.43,.67,shrubField+.12*(site.moisture-.5));
    const survival=original.bush
      ?clamp(.10+.88*shrubColony-.20*site.disturbance,.05,.98)
      :clamp(.96-.35*site.disturbance-.20*smooth(.62,1.5,site.slope),.54,.99);
    if(r>survival){removed[original.bush?'bushes':'trees']++;continue;}
    // The numerous small shrubs do not need neighbour crowns, root geology
    // or relocation metadata. Keep their composition compact and cheap.
    if(original.bush){
      const age=clamp(site.maturity*(.86+.22*r)),family=site.moisture>.58?2:3;
      const side=original.x>=habitatRiverCenter(original.z)?1:-1;
      result.push({...original,radius:original.radius*mix(.72,1.38,shrubColony)*mix(.92,1.10,age),architecture:family,family,
        maturity:age,lightX:-side,lightZ:(site.cohort-.5)*.4,
        riparian:site.lowland*(1-smooth(14,110,site.bank)),opening:site.disturbance,
        understory:clamp(site.moisture*.7+site.forest*.3)});
      continue;
    }
    const tree=original;let crowding=0,awayX=0,awayZ=0;
    if(!tree.bush){
      const ix=Math.floor(tree.x/spacing),iz=Math.floor(tree.z/spacing);
      for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)for(const other of index.get((ix+dx)+','+(iz+dz))||[]){
        if(other===original)continue;
        const x=tree.x-other.x,z=tree.z-other.z,d2=x*x+z*z,reach=(tree.radius+other.radius)*1.32;
        if(d2<.04||d2>reach*reach)continue;
        const force=(1-Math.sqrt(d2)/reach)*clamp(other.radius/tree.radius,.5,1.8);
        crowding+=force;awayX+=x/Math.sqrt(d2)*force;awayZ+=z/Math.sqrt(d2)*force;
      }
      crowding=clamp(crowding/2.2);competition.max=Math.max(competition.max,crowding);competition.sum+=crowding;competition.samples++;
    }
    const bankSide=tree.x>=habitatRiverCenter(tree.z)?1:-1,
      riverDX=.07728*Math.cos((tree.z+140)*.00168)+.0868*Math.cos((tree.z-70)*.0031);
    const edge=site.lowland*(1-smooth(14,110,site.bank));
    let lightX=awayX*.75-bankSide*edge*.85+.22*(habitatNoise(tree.x,tree.z,63,8.1)-.5),
      lightZ=awayZ*.75+bankSide*riverDX*edge*.85+.22*(habitatNoise(tree.x,tree.z,63,19.5)-.5);
    const lightLength=Math.hypot(lightX,lightZ);
    if(lightLength>.025){lightX/=lightLength;lightZ/=lightLength;}else{const angle=tree.seed*31.7;lightX=Math.cos(angle);lightZ=Math.sin(angle);}
    const age=clamp(site.maturity*(.84+.20*r)-.20*crowding+.16*(tree.radius/7));
    let family;
    if(tree.bush)family=site.moisture>.58?2:3;
    else if(tree.radius<2.3||age<.22&&crowding>.23)family=3;
    else if(edge>.42&&r<.60)family=2;
    else if(tree.species===2&&r<.64)family=1;
    else if(crowding>.50&&r<.70)family=1;
    else family=r<.38?0:r<.71?1:3;
    // Age belongs to a cohort, but individual histories still alter stature.
    // A family changes the skeleton/topology below, not just this scale.
    const spread=tree.bush?mix(.84,1.20,age):family===3?mix(.68,.92,age):mix(.91,1.26,age);
    const radius=tree.radius*spread;let finalX=tree.x,finalY=tree.y,finalZ=tree.z;
    if(!tree.bush&&site.lowland>.7&&site.slope<.25&&site.bank>9&&radius>2.5){
      const move=.16*radius*(.35+.65*r),xx=tree.x+lightX*move,zz=tree.z+lightZ*move;
      const oldH=terrain?.sampleHeight?.(tree.x,tree.z),newH=terrain?.sampleHeight?.(xx,zz);
      if(Number.isFinite(oldH+newH)&&Math.abs(newH-oldH)<.45&&Math.abs(xx-habitatRiverCenter(zz))-habitatRiverHalfWidth(zz)>4){
        finalX=xx;finalZ=zz;finalY=tree.y+newH-oldH;relocated++;
      }
    }
    const rootExposure=clamp(.10+.40*site.exposure+.28*edge+.16*(1-site.moisture)+.16*age-.25*(family===3));
    const crownReach=radius*[1.48,.84,1.32,.72][family],crownOffset=radius*[.14,.10,.58,.12][family];
    const plant={...tree,x:finalX,y:finalY,z:finalZ,radius,architecture:family,architectureName:TREE_FAMILIES[family],family,crownFamily:TREE_FAMILIES[family],maturity:age,
      riparian:edge,opening:site.disturbance,understory:tree.bush?clamp(site.moisture*.7+site.forest*.3):0,
      competition:crowding,lightX,lightZ,rootExposure,site,
      canopyX:finalX+lightX*crownOffset,canopyZ:finalZ+lightZ*crownOffset,canopyRadius:crownReach};
    if(!tree.bush){families[family]++;ages[age<.30?0:age<.66?1:2]++;if(rootExposure>.34)exposedRootCandidates++;}
    result.push(plant);
  }
  return {records:result,removed,clearings:[],stats:{revision:ECOLOGY_REVISION,familyNames:TREE_FAMILIES.slice(),families,ageClasses:ages,
    relocatedLowlandTrees:relocated,habitatCells:sampler.size(),exposedRootCandidates,sdfAnchoredTrees,sdfAnchoredBushes,
    competition:{max:competition.max,mean:competition.samples?competition.sum/competition.samples:0},
    distribution:'Terrain/flow-driven cohorts, feathered light wells, dense shrub colonies with quiet humus, crown competition and directional river edges'}};
}
