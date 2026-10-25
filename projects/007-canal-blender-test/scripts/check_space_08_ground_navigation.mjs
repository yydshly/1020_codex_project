import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..');
const {createNavigation}=await import(pathToFileURL(path.join(root,'web/scene-space-08-navigation.js')));
const {createNavigation:createPrevious}=await import(pathToFileURL(path.join(root,'web/scene-space-06-navigation.js')));
const buildings=JSON.parse(fs.readFileSync(path.join(root,'artifacts/scene-space-08/buildings-build-audit.json')));
const reports=[];
for(const radius of [.18,.24,.30]){
  const nav=createNavigation({radius}),old=createPrevious({radius}),errors=[],inheritedErrors=[],doors=[];let checks=0;
  for(const [name,points]of Object.entries(nav.routes)){
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(length/.06);
      let previous=a;
      for(let j=0;j<=steps;j++){
        const t=j/steps,p={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};checks++;
        if(!nav.isWalkable(p.x,p.z)||!nav.canSweep(previous,p)){
          const inherited=old.routes[name]&&(!old.isWalkable(p.x,p.z)||!old.canSweep(previous,p));
          (inherited?inheritedErrors:errors).push({name,segment:i,position:p});
        }
        previous=p;
      }
    }
  }
  for(const house of buildings.houses)for(const door of house.doors){
    if(door.side==='rear')continue;
    const distance=.195+radius+.045,p={x:door.position_xy[0]+door.outward_xy[0]*distance,
      z:-(door.position_xy[1]+door.outward_xy[1]*distance)};
    doors.push({id:door.id,secondary:door.secondary,position:p,walkable:nav.isWalkable(p.x,p.z)});
  }
  reports.push({radius,routeSamples:checks,errors:errors.slice(0,20),errorCount:errors.length,
    inheritedErrors,doors,
    doorFailures:doors.filter(d=>!d.walkable)});
}
const report={passed:reports.every(r=>r.errorCount===0&&r.doorFailures.length===0),reports};
fs.writeFileSync(path.join(root,'artifacts/scene-space-08/ground-navigation-validation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(reports.map(r=>({radius:r.radius,samples:r.routeSamples,routeErrors:r.errorCount,
  inheritedSourceRouteErrors:r.inheritedErrors.length,examples:r.errors.slice(0,2),doorFailures:r.doorFailures}))));
assert(report.passed,'Navigation route or real doorway access is not ready.');
