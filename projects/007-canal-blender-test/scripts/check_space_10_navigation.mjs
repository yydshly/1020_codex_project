// Independent runtime-navigation audit: actual production module and final manifest.
import fs from 'node:fs';
import {createNavigation} from '../web/scene-space-10-navigation.js';
import {createNavigation as createCore} from '../web/scene-space-06-navigation.js';
import {createNavigation as createPrevious} from '../web/scene-space-08-navigation.js';
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(fs.readFileSync(new URL('web/models/space-10-manifest.json',root),'utf8'));
const ground=manifest.neighbourhood.ground.navigation,houses=manifest.neighbourhood.buildings.houses;
const nav=createNavigation({ground}),previous=createPrevious(),core=createCore(),checks={},evidence={};
const sourceManifest=JSON.parse(fs.readFileSync(new URL('web/models/space-08-manifest.json',root),'utf8'));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function sample(route,spacing=.2){const out=[];for(let i=0;i<route.length-1;i++){
 const a=route[i],b=route[i+1],length=Math.hypot(b.x-a.x,b.z-a.z),count=Math.ceil(length/spacing);
 for(let j=0;j<count;j++)out.push({x:a.x+(b.x-a.x)*j/count,z:a.z+(b.z-a.z)*j/count,direction:[(b.x-a.x)/length,-(b.z-a.z)/length],step:length/count});
}out.push({...route.at(-1),direction:[1,0],step:0});return out;}
function drive(n,route){let p=n.reset(route[0]);const issues=[];
 for(const end of route.slice(1)){if(!n.canSweep(p,end)){issues.push({type:'sweep',from:p,to:end});continue;}
 const dx=end.x-p.x,dz=end.z-p.z,count=Math.ceil(Math.hypot(dx,dz)/.08);
 for(let j=0;j<count;j++)p=n.move(p,{x:dx/count,z:dz/count});
 if(Math.hypot(p.x-end.x,p.z-end.z)>1e-6)issues.push({type:'move',actual:p,end});
 }return issues;}
checks.originalPublicStreetZonesAndObstaclesRetained=same(nav.zones.slice(0,core.zones.length),core.zones)&&same(nav.obstacles.slice(0,core.obstacles.length),core.obstacles);
const oldFailures=[],driveFailures=[],routes={};
for(const [id,route]of Object.entries(nav.routes)){
 const points=sample(route);routes[id]={route:route.map(p=>[p.x,-p.z]),points:points.map(p=>({xy:[p.x,-p.z],height:nav.sampleHeight(p.x,p.z),direction:p.direction,step:p.step}))};
 if(previous.routes[id]){
  if(!same(route,previous.routes[id]))oldFailures.push({id,type:'definition'});
  for(const p of points)if(nav.isWalkable(p.x,p.z)!==previous.isWalkable(p.x,p.z)||nav.sampleHeight(p.x,p.z)!==previous.sampleHeight(p.x,p.z))oldFailures.push({id,p});
 }
 driveFailures.push(...drive(nav,route).map(row=>({id,...row})),...drive(nav,[...route].reverse()).map(row=>({id,reverse:true,...row})));
}
checks.oldRoutesAndHeightsPreserved=oldFailures.length===0;checks.allRoutesDriveBothDirections=driveFailures.length===0;
const radiusFailures=[];
for(const radius of[.18,.30]){const n=createNavigation({radius,ground});for(const [id,route]of Object.entries(n.routes))if(!previous.routes[id])radiusFailures.push(...drive(n,route).map(row=>({radius,id,...row})),...drive(n,[...route].reverse()).map(row=>({radius,id,reverse:true,...row})));}
checks.newCourtRouteWorksAcrossSupportedBodyRadii=radiusFailures.length===0;
const spacing=.25,grid=new Map(),bounds=nav.mapBounds;
const key=(ix,iz)=>`${ix},${iz}`;
for(let ix=Math.ceil(bounds.minX/spacing);ix<=Math.floor(bounds.maxX/spacing);ix++)for(let iz=Math.ceil(bounds.minZ/spacing);iz<=Math.floor(bounds.maxZ/spacing);iz++){
 const x=ix*spacing,z=iz*spacing;if(nav.isWalkable(x,z))grid.set(key(ix,iz),{x,z,ix,iz});
}
const start=nav.spawns.neighbourhoodStart??nav.spawn;
function neighboursOf(p){const found=[];for(let ix=Math.floor(p.x/spacing)-2;ix<=Math.ceil(p.x/spacing)+2;ix++)for(let iz=Math.floor(p.z/spacing)-2;iz<=Math.ceil(p.z/spacing)+2;iz++){
 const n=grid.get(key(ix,iz));if(n&&Math.hypot(n.x-p.x,n.z-p.z)<=.5&&nav.canSweep(p,n))found.push(n);
}return found;}
const queue=neighboursOf(start),visited=new Set(queue.map(p=>key(p.ix,p.iz)));
for(let i=0;i<queue.length;i++){
 const p=queue[i];for(const [dx,dz]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
  const id=key(p.ix+dx,p.iz+dz);if(visited.has(id))continue;const next=grid.get(id);
  if(next&&nav.canSweep(p,next)){visited.add(id);queue.push(next);}
 }
}
const disconnected=[...grid.entries()].filter(([id])=>!visited.has(id)).map(([,p])=>({x:p.x,z:p.z}));
checks.allDeclaredWalkableRegionsConnectToOriginalStreet=visited.size===grid.size&&visited.size>0;
const doors=[];
for(const house of houses)for(const door of house.doors.filter(d=>d.side==='front'||d.secondary)){
 const [x,y]=door.position_xy,[nx,ny]=door.outward_xy,candidates=[];
 for(const distance of[.6,.7,.8])for(const tangent of[0,-.1,.1,-.2,.2]){
  const p={x:x+nx*distance-ny*tangent,z:-(y+ny*distance+nx*tangent)};
  if(nav.isWalkable(p.x,p.z)&&neighboursOf(p).some(p=>visited.has(key(p.ix,p.iz))))candidates.push({...p,distance,tangent});
 }
 doors.push({houseId:house.id,id:door.id,side:door.side,secondary:door.secondary,position:door.position_xy,outward:door.outward_xy,reachable:candidates.length>0,approach:candidates[0]??null});
}
checks.everyPrimaryAndCornerDoorHasReachableExteriorApproach=doors.length>=21&&doors.every(d=>d.reachable);
checks.closedHouseCentersAndEarthGardensRemainInaccessible=houses.every(h=>!nav.isWalkable(h.center[0],-h.center[1]))&&manifest.neighbourhood.layout.courtyards.filter(c=>c.surface==='earth').every(c=>{const b=c.bounds_xy;return!nav.isWalkable((b[0]+b[2])/2,-(b[1]+b[3])/2);});
let refusedMissingGround=false;try{createNavigation();}catch{refusedMissingGround=true;}checks.navigationRefusesMissingCurrentGroundMetadata=refusedMissingGround;
const changedIds=new Set(Object.keys(manifest.neighbourhood.layout.building_changes));
const boxes=[...houses,...sourceManifest.neighbourhood.buildings.houses].filter(h=>changedIds.has(h.id)).map(h=>h.footprint);
const nearChange=p=>boxes.some(b=>p.x>=b[0]-1.15&&p.x<=b[2]+1.15&&-p.z>=b[1]-1.15&&-p.z<=b[3]+1.15);
const physicalGrid=[...grid.values()].filter(p=>p.ix%2===0&&p.iz%2===0&&(!previous.isWalkable(p.x,p.z)||nearChange(p))).map(p=>({xy:[p.x,-p.z],height:nav.sampleHeight(p.x,p.z),previousWalkable:previous.isWalkable(p.x,p.z)}));
const physicalRoutes=Object.fromEntries(Object.entries(routes).filter(([id])=>!previous.routes[id]||id==='courtyard_return'));
const data={routes:physicalRoutes,grid:physicalGrid,doors:doors.map(d=>({...d,approach:d.approach?{xy:[d.approach.x,-d.approach.z],height:nav.sampleHeight(d.approach.x,d.approach.z),distance:d.approach.distance,tangent:d.approach.tangent}:null})),zones:nav.zones,obstacles:nav.obstacles,spawns:nav.spawns,physicalScope:'New court routes, preserved small courtyard and half-metre grid of newly walkable/changed-house perimeter regions; all routes are tested in runtime in both directions.'};
Object.assign(evidence,{oldFailures,driveFailures,radiusFailures,connectivity:{spacing,gridPoints:grid.size,connectedPoints:visited.size,disconnectedPoints:disconnected.length,disconnectedExamples:disconnected.slice(0,50)},doors,physicalSampleCount:physicalGrid.length,routeCounts:Object.fromEntries(Object.entries(routes).map(([id,row])=>[id,row.points.length]))});
const report={checkedUTC:new Date().toISOString(),passed:Object.values(checks).every(Boolean),checks,evidence,data,limitations:['Uses the real navigation and mesh-derived building/ground metadata; independent Blender rays still verify physical geometry.','Quarter-metre connectivity sampling demonstrates access paths, not a continuous mathematical proof. Interior rooms and planted garden parcels remain closed.']};
if(process.argv.includes('--data'))console.log(JSON.stringify(report));
else{const target=new URL(process.argv[2]??'artifacts/scene-space-10/navigation-validation.json',root);fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({passed:report.passed,failed:Object.keys(checks).filter(k=>!checks[k]),connectivity:evidence.connectivity,failedDoors:doors.filter(d=>!d.reachable),report:target.href}));process.exitCode=report.passed?0:1;}
