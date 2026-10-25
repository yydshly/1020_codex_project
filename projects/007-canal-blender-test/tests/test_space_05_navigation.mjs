import assert from 'node:assert/strict';
import test from 'node:test';
import { createNavigation as createOriginal } from '../web/roam-navigation.js';
import { createNavigation } from '../web/scene-space-05-navigation.js';

const near=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-7,message??`${a} differs from ${b}`);

function sample(route,spacing) {
  const points=[];
  for(let i=0;i<route.length-1;i++){
    const a=route[i],b=route[i+1],count=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/spacing);
    for(let j=0;j<count;j++)points.push({x:a.x+(b.x-a.x)*j/count,z:a.z+(b.z-a.z)*j/count});
  }
  points.push(route.at(-1));return points;
}

function drive(nav,route) {
  let position=nav.reset(route[0]),steps=0;
  for(const goal of route.slice(1)){
    assert.equal(nav.canSweep(position,goal),true,'Full straight route leg must be sweep-safe.');
    const dx=goal.x-position.x,dz=goal.z-position.z,count=Math.ceil(Math.hypot(dx,dz)/.045);
    for(let i=0;i<count;i++){
      const before=position;
      position=nav.move(position,{x:dx/count,z:dz/count});
      assert.ok(nav.isWalkable(position.x,position.z));
      assert.equal(nav.canSweep(before,position),true);
      near(position.y,nav.sampleHeight(position.x,position.z));steps++;
    }
    near(position.x,goal.x);near(position.z,goal.z);
  }
  return {position,steps};
}

test('the original seven zones, obstacles and 522 established route samples remain unchanged',()=>{
  const old=createOriginal(),nav=createNavigation();
  assert.deepEqual(nav.zones.slice(0,old.zones.length),old.zones);
  assert.deepEqual(nav.obstacles,old.obstacles);
  let count=0;
  for(const name of Object.keys(old.routes)){
    assert.deepEqual(nav.routes[name],old.routes[name]);
    for(const point of sample(old.routes[name],.28)){
      assert.equal(nav.isWalkable(point.x,point.z),old.isWalkable(point.x,point.z));
      near(nav.sampleHeight(point.x,point.z),old.sampleHeight(point.x,point.z));count++;
    }
    drive(nav,nav.routes[name]);
  }
  assert.equal(count,522);
});

test('manual entrance spawn and map data expose the new courtyard without changing the old spawn option',()=>{
  const nav=createNavigation();
  assert.deepEqual(nav.spawn,{x:-7.05,y:.85,z:12.65});
  assert.deepEqual(nav.spawns.original,createOriginal().spawn);
  assert.equal(nav.sampleHeight(nav.spawns.courtyardCenter.x,nav.spawns.courtyardCenter.z),.855);
  assert.deepEqual(nav.routes.courtyard_return[0],nav.spawn);
  assert.deepEqual(nav.routes.courtyard_return.at(-1),nav.spawn);
  assert.ok(nav.mapBounds.maxZ>25);
});

test('the new route is densely safe and drives in both directions for every supported body radius',()=>{
  for(const radius of [.18,.24,.30]){
    const nav=createNavigation({radius}),route=nav.routes.courtyard_return;
    for(const point of sample(route,.02)){
      assert.equal(nav.isWalkable(point.x,point.z),true,`${radius}: ${JSON.stringify(point)}`);
      const height=nav.sampleHeight(point.x,point.z);
      assert.ok(height>=.85&&height<=.855);
      if(point.z>=16.05)near(height,.855);
    }
    const forward=drive(nav,route),backward=drive(nav,[...route].reverse());
    assert.ok(forward.steps>500&&backward.steps>500);
    near(forward.position.x,nav.spawn.x);near(backward.position.z,nav.spawn.z);
  }
});

test('the new entrance height follows the actual short paving ramp without changing the old quay',()=>{
  const nav=createNavigation();
  near(nav.sampleHeight(-7.05,15.35),.85);
  near(nav.sampleHeight(-7.05,15.6853),.85);
  near(nav.sampleHeight(-7.05,(15.6853+16.05)/2),.8525);
  near(nav.sampleHeight(-7.05,16.05),.855);
  near(nav.sampleHeight(-7.05,23.35),.855);
});

test('both physical openings retain the capsule clearance across the useful entry width',()=>{
  const nav=createNavigation(),through=nav.zones.find(zone=>zone.id==='courtyard-alley');
  assert.ok(through.maxX-through.minX>=1.70-1e-8);
  for(const z of [16.35,22.35]){
    const alley=nav.zones.find(zone=>zone.id===(z<17?'courtyard-street-connector':'courtyard-alley'));
    // The street apron is 10 cm wider than the conservative through passage.
    // A full ingress sweep is checked across their shared usable width.
    for(let x=through.minX+nav.radius+.01;x<=through.maxX-nav.radius-.01;x+=.025){
      assert.ok(nav.isWalkable(x,z));
      assert.ok(nav.canSweep({x,z:z-.35},{x,z:z+.35}));
    }
    assert.equal(nav.isWalkable(alley.minX+nav.radius-.015,z),false);
    assert.equal(nav.isWalkable(alley.maxX-nav.radius+.015,z),false);
  }
});

test('diagonal shortcuts cannot cut through either house or the rear corner',()=>{
  const nav=createNavigation();
  assert.equal(nav.canSweep({x:-7.05,z:18},{x:-10.9,z:23.4}),false);
  assert.equal(nav.canSweep({x:-10.9,z:23.4},{x:-7.05,z:18}),false);
  for(const sign of [-1,1]){
    let position={x:-7.05,y:.85,z:18.85};
    for(let i=0;i<50;i++)position=nav.move(position,{x:sign*1e5,z:0});
    assert.ok(nav.isWalkable(position.x,position.z));
    assert.ok(position.x>=-7.95+nav.radius-1e-7&&position.x<=-6.25-nav.radius+1e-7);
  }
  for(const [x,z] of [[-11,18.85],[-3,18.85],[4.8,18.85],[-11,16.4],[-3,16.4],[4.8,16.4]]){
    assert.equal(nav.isWalkable(x,z),false,'Closed houses must remain excluded.');
  }
});

test('courtyard walls and corners prevent large-delta escape while allowing return through the entrance',()=>{
  const nav=createNavigation(),court=nav.zones.find(zone=>zone.id==='courtyard-interior');
  for(const delta of [{x:-999,z:0},{x:999,z:0},{x:0,z:999},{x:-999,z:999},{x:999,z:999}]){
    let position={...nav.spawns.courtyardCenter};
    for(let i=0;i<30;i++){
      position=nav.move(position,delta);
      assert.ok(nav.isWalkable(position.x,position.z));
      assert.ok(position.x>=court.minX+nav.radius-1e-7);
      assert.ok(position.x<=court.maxX-nav.radius+1e-7);
      assert.ok(position.z<=court.maxZ-nav.radius+1e-7);
    }
  }
  const out=drive(nav,[nav.spawns.courtyardCenter,{x:-7.05,y:.85,z:nav.spawns.courtyardCenter.z},nav.spawn]);
  near(out.position.z,12.65);
});

test('the extension never makes water or neighbouring back gardens walkable',()=>{
  const nav=createNavigation();
  for(const point of [{x:-7.05,z:6},{x:-7.05,z:27},{x:-14,z:24},{x:-4,z:24},{x:0,z:19}]){
    assert.equal(nav.sampleHeight(point.x,point.z),null);
  }
  let position={...nav.spawn};
  for(let i=0;i<20;i++)position=nav.move(position,{x:0,z:-1000});
  assert.ok(position.z>=10.85+nav.radius-1e-7);
  for(const value of [null,{}, {x:NaN,z:18}])assert.equal(nav.canSweep(value,nav.spawn),false);
});
