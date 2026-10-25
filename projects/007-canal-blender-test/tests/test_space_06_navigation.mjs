import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {createNavigation as previous} from '../web/scene-space-05-navigation.js';
import {createNavigation} from '../web/scene-space-06-navigation.js';
const layout=JSON.parse(fs.readFileSync(new URL('../assets/space-06-layout.json',import.meta.url)));
const plan=JSON.parse(fs.readFileSync(new URL('../artifacts/scene-space-06/road-navigation-plan.json',import.meta.url)));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function samples(route,spacing=.1){
 const out=[];
 for(let i=0;i<route.length-1;i++){
  const a=route[i],b=route[i+1],n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/spacing);
  for(let j=0;j<n;j++)out.push({x:a.x+(b.x-a.x)*j/n,z:a.z+(b.z-a.z)*j/n});
 }
 out.push(route.at(-1));return out;
}
function drive(nav,route){
 let position=nav.reset(route[0]);
 for(const end of route.slice(1)){
  assert.ok(nav.canSweep(position,end),`Blocked full leg ${JSON.stringify(position)} -> ${JSON.stringify(end)}`);
  const dx=end.x-position.x,dz=end.z-position.z,n=Math.ceil(Math.hypot(dx,dz)/.12);
  for(let j=0;j<n;j++)position=nav.move(position,{x:dx/n,z:dz/n});
  close(position.x,end.x);close(position.z,end.z);close(position.y,nav.sampleHeight(end.x,end.z));
 }
}
test('original SPACE05 zones, obstacles, routes, spawns and their heights are preserved',()=>{
 const old=previous(),nav=createNavigation();
 assert.deepEqual(nav.zones.slice(0,old.zones.length),old.zones);
 assert.deepEqual(nav.obstacles.slice(0,old.obstacles.length),old.obstacles);
 assert.deepEqual(nav.spawn,old.spawn);
 for(const [id,p] of Object.entries(old.spawns))assert.deepEqual(nav.spawns[id],p);
 for(const [id,route] of Object.entries(old.routes)){
  assert.deepEqual(nav.routes[id],route);
  for(const p of samples(route,.1)){assert.equal(nav.isWalkable(p.x,p.z),true);close(nav.sampleHeight(p.x,p.z),old.sampleHeight(p.x,p.z));}
 }
});
for(const radius of [.18,.24,.30])test(`new routes sweep and move both directions; old routes retain their original clearance at radius ${radius}`,()=>{
 const nav=createNavigation({radius});
 for(const [id,route] of Object.entries(nav.routes)){
  if(radius!==.24 && ['both_banks_loop','rear_lane_loop'].includes(id)){
   const old=previous({radius});for(const p of samples(route,.08))assert.equal(nav.isWalkable(p.x,p.z),old.isWalkable(p.x,p.z));continue;
  }
  for(const p of samples(route,.08))assert.ok(nav.isWalkable(p.x,p.z),`${id} blocked ${JSON.stringify(p)}`);
  drive(nav,route);drive(nav,[...route].reverse());
 }
});
test('road zones match the independent physical road plan',()=>{
 const nav=createNavigation();
 for(const r of [...plan.road_rectangles,...plan.curved_quays.flatMap(c=>c.navigation_rectangles)]){
  const z=nav.zones.find(z=>z.id===r.id),[x0,y0,x1,y1]=r.bounds;
  assert.deepEqual([z.minX,-z.maxZ,z.maxX,-z.minZ],[x0,y0,x1,y1]);
 }
 for(const curve of plan.curved_quays){
  for(const [x,y] of curve.centerline.filter(([x])=>x>-34.6&&x<34.6)){
   const h=curve.height,t=Math.max(0,Math.min(1,(x-h.old_edge_x)*h.direction/h.ramp_length));
   close(nav.sampleHeight(x,-y),h.start_z+(h.end_z-h.start_z)*t);
  }
 }
});
test('retained gate columns and tree trunks stay solid; gate central lanes now connect',()=>{
 const nav=createNavigation();
 for(const post of plan.retained_gate_posts){
  assert.equal(nav.isWalkable(post.x,-post.blender_y),false);
  assert.equal(nav.canSweep({x:post.x-.6,z:-post.blender_y},{x:post.x+.6,z:-post.blender_y}),false);
 }
 for(const x of [-21,13])for(const y of [-.55,-12.65])assert.ok(nav.canSweep({x:x-.6,z:-y},{x:x+.6,z:-y}));
 for(const tree of plan.trees)assert.equal(nav.isWalkable(tree.x,-tree.blender_y),false);
});
test('new houses, gardens and water remain outside walkable road union',()=>{
 const nav=createNavigation();
 for(const h of layout.building_footprints){
  for(const dx of [-.4,0,.4])for(const dy of [-.4,0,.4])assert.equal(nav.isWalkable(h.center[0]+dx*h.width,-h.center[1]-dy*h.depth),false,h.id);
 }
 for(const g of layout.green_spaces_xy){const b=g.bounds;assert.equal(nav.isWalkable((b[0]+b[2])/2,-(b[1]+b[3])/2),false,g.id);}
 for(const x of [-33,-25,-10,0,20,33])assert.equal(nav.isWalkable(x,6),false);
 assert.equal(nav.canSweep({x:-33,z:-8},{x:33,z:-8}),true);
 assert.equal(nav.canSweep({x:-33,z:-8},{x:-33,z:-25.2}),true);
 assert.equal(nav.canSweep({x:-33,z:-8},{x:0,z:-25.2}),false);
});
test('large movement deltas cannot escape finite roads and invalid inputs are safe',()=>{
 const nav=createNavigation();
 for(const delta of [{x:1e6,z:0},{x:-1e6,z:0},{x:1e6,z:1e6},{x:0,z:-1e6}]){
  let p={...nav.spawns.neighbourhoodStart};
  for(let i=0;i<30;i++){p=nav.move(p,delta);assert.ok(nav.isWalkable(p.x,p.z));}
 }
 for(const p of [null,{}, {x:NaN,z:0}])assert.equal(nav.canSweep(p,nav.spawn),false);
 assert.equal(nav.reset(nav.spawns.neighbourhoodStart).z,.55);
});
