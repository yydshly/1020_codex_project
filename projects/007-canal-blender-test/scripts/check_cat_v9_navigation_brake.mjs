// Exercise the real existing navigation geometry and new approach speed limit.
import { writeFile } from 'node:fs/promises';
import { createNavigation } from '../web/roam-navigation.js';
import { limitApproachSpeed } from '../web/cat-v9-navigation-brake.js';

const navigation = createNavigation(), runs = [];
for (const [timing, deltas] of [['60fps',[1/60]],['30fps',[1/30]],['variable',[.016,.018,.015,.035,.024,.017,.011]]]) {
  for (const [scenario, heading] of [['along_street',Math.PI/2],['toward_planter',Math.PI-1.16]]) {
    let position={x:-5.8,y:.85,z:.55},velocity={x:0,z:0},time=0,frame=0;
    const run={timing,scenario,maxSpeed:0,maxDeceleration:0,allWalkable:true,allFinite:true,brakingFrames:0,samples:[]};
    while (time<6) {
      const dt=deltas[frame%deltas.length],speed=Math.hypot(velocity.x,velocity.z);
      const desired={x:Math.sin(heading)*.9,z:Math.cos(heading)*.9};
      const probe=limitApproachSpeed(navigation,position,desired,speed);
      const changeX=desired.x-velocity.x,changeZ=desired.z-velocity.z,difference=Math.hypot(changeX,changeZ);
      const braking=Math.hypot(desired.x,desired.z)<speed;
      const step=Math.min(difference,(braking?1.8:1)*dt);
      if(difference>1e-8){velocity.x+=changeX/difference*step;velocity.z+=changeZ/difference*step;}
      const next=navigation.move(position,{x:velocity.x*dt,z:velocity.z*dt});
      const actualSpeed=Math.hypot(next.x-position.x,next.z-position.z)/dt;
      run.maxSpeed=Math.max(run.maxSpeed,actualSpeed);
      run.maxDeceleration=Math.max(run.maxDeceleration,(speed-actualSpeed)/dt);
      run.allWalkable&&=navigation.isWalkable(next.x,next.z);
      run.allFinite&&=[next.x,next.y,next.z,actualSpeed].every(Number.isFinite);
      run.brakingFrames+=Number(probe.blocked&&probe.limit<.9);
      if(frame%10===0)run.samples.push({time,speed:actualSpeed,position:next,probe});
      velocity={x:(next.x-position.x)/dt,z:(next.z-position.z)/dt};position=next;time+=dt;frame++;
    }
    run.final={position,speed:Math.hypot(velocity.x,velocity.z)};
    run.checks={walkable:run.allWalkable,finite:run.allFinite,reachesRunSpeed:run.maxSpeed>.89,
      collisionDoesNotAbruptlyStopVelocity:run.maxDeceleration<=1.801,
      routeBehavior:scenario==='along_street'?run.final.speed>.89&&run.brakingFrames===0:run.final.speed<.001&&run.brakingFrames>0};
    run.passed=Object.values(run.checks).every(Boolean);runs.push(run);
  }
}
const report={checkedAt:new Date().toISOString(),passed:runs.every(r=>r.passed),runs,
  scope:'Actual preserved navigation boundaries, circles and collision resolution. Same acceleration rule as street controller. Does not evaluate cat rig motion or visual quality.'};
await writeFile(new URL('../assets/cat-v9-navigation-brake-check.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,runs:runs.map(({samples,...r})=>r)},null,2));
process.exitCode=report.passed?0:1;
