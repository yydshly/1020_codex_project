// SPDX-License-Identifier: GPL-3.0-only
// Deterministic camera blocking. No DOM, clock, mission ID or Three.js state.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const scale=(a,s)=>a.map(v=>v*s);
const ease=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};

export function planExpeditionShot({framing='approach',progress=0,subject=[0,0,0],vehicle=[22,21,26],surface=[-80,430,30],aspect=1.5,isVent=false,entityKind=''}) {
  const p=clamp(Number.isFinite(progress)?progress:0,0,1),fit=Math.max(1,.84/Math.max(.35,aspect));
  const focus=add(subject,[7,isVent?28:11,9]);
  let position,target,fov=44;
  if(framing==='establishing'){
    // Begin with the tethered vessel, then follow the water column down to the
    // work site. The display compresses depth, rather than claiming true scale.
    const shipPosition=add(surface,scale([175,68,-155],fit)),shipTarget=add(surface,[0,14,-9]);
    const chasePosition=add(vehicle,scale([86,39,-76],fit)),chaseTarget=add(vehicle,[0,3,0]);
    const launch=ease((p-.25)/.14),arrival=ease((p-.83)/.17);
    position=mix(shipPosition,chasePosition,launch);target=mix(shipTarget,chaseTarget,launch);
    position=mix(position,add(focus,scale([-132,77,62],fit)),arrival);target=mix(target,focus,arrival);fov=47;
  }else if(framing==='departure'){
    // Follow the actual returning ROV before revealing the ship. Looking back
    // at the seabed while only the lens ascends made recovery appear complete
    // even though the vehicle had never left the bottom.
    const reveal=ease((p-.72)/.28),chase=add(vehicle,scale([86,45,-76],fit)),upper=add(surface,scale([180,72,-160],fit));
    position=mix(chase,upper,reveal);target=mix(add(vehicle,[0,5,0]),add(surface,[15,14,-24]),reveal);fov=47;
  }else if(framing==='orbit'){
    const a=-1.52+p*.56,r=(isVent?109:94)*fit;
    position=add(focus,[Math.sin(a)*r,(isVent?54:47)*fit,Math.cos(a)*r]);target=focus;fov=43;
  }else if(framing==='detail'){
    target=add(subject,[0,isVent?39:7,0]);
    position=add(target,scale([-(isVent?65:55),isVent?24:29,18+p*15],fit));fov=isVent?37:39;
  }else if(framing==='compare'){
    const t=ease(p);
    if(entityKind==='sampling'){
      const apparatus=add(subject,[0,5.5,0]);
      // The apparatus is the subject from the first frame. The former wide
      // vehicle/station view sat behind the previous station's coral, hiding
      // the sampler until the close-up. Keep the opening lens near the tool.
      target=mix(mix(apparatus,vehicle,.12),apparatus,t);
      position=add(target,scale(mix([-95,52,15],[-66,36,10],t),fit));fov=48-10*t;
    }else{
      target=mix(add(subject,[0,12,0]),mix(subject,vehicle,.43),t);
      position=add(target,scale([-142+t*15,85,115-t*26],fit));fov=46;
    }
  }else{
    // A three-quarter approach keeps the instrument face and the observed
    // object separate instead of showing the rear of the vehicle.
    const t=ease(p);target=focus;
    position=add(focus,scale(mix([-188,100,62],[-116,61,18],t),fit));fov=44;
  }
  return {position,target,fov};
}
