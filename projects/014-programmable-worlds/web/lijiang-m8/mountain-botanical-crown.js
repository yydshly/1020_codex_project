// Real branches and individual folded leaf blades for near mountain crowns.
// This is generated geometry, not a leaf-cluster plane or a loaded model.
const hash=n=>{let h=Math.imul(Math.floor(n*1000003)^0x5f3759df,1597334677);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;};
const TREE_FORMS=[
  [[-.46,.69,-.20,.59,.63],[.44,.83,.12,.61,.67],[-.10,1.13,.35,.55,.63],[-.21,1.12,-.37,.53,.60],[.23,1.45,-.10,.47,.54],[.06,.56,-.02,.54,.60],[-.51,1.13,.08,.47,.57],[.44,1.20,-.24,.46,.58]],
  [[-.21,.56,-.12,.48,.66],[.21,.82,.16,.46,.67],[-.20,1.08,.15,.43,.65],[.17,1.34,-.14,.40,.65],[-.09,1.60,-.03,.36,.59],[.05,1.82,.03,.30,.50],[.30,1.03,-.04,.39,.61]],
  [[-.60,.91,-.18,.54,.58],[-.27,1.15,.20,.56,.62],[.17,.97,.29,.56,.60],[.52,.63,.07,.51,.57],[.11,.53,-.30,.54,.60],[-.30,.64,-.16,.55,.61],[-.52,1.37,.06,.44,.53],[.25,1.28,-.13,.45,.54]],
  [[-.27,.59,-.13,.46,.61],[.28,.82,.17,.44,.61],[-.14,1.12,.18,.40,.58],[.18,1.39,-.11,.35,.53],[-.27,.99,-.11,.36,.55],[.02,.55,.18,.42,.58]]
];

const BUSH_FORMS=[[-.34,.22,-.22,.50,.42],[.31,.28,.17,.52,.44],[-.11,.48,.31,.55,.42],[.14,.58,-.25,.52,.44],[-.38,.53,.11,.50,.38],[.37,.47,-.14,.50,.42],[.02,.20,.02,.52,.38],[.02,.78,.01,.48,.42]];
const CURTAIN_FORMS=[[-.18,.12,.23,.34,.30],[.15,.24,.26,.40,.34],[-.27,.42,.28,.42,.36],[.20,.53,.32,.43,.37],[-.18,.73,.30,.40,.34],[.14,.89,.29,.37,.32],[-.08,1.08,.24,.32,.30],[.02,.42,.36,.42,.35]];
export const MOUNTAIN_CROWN_PROTOTYPES=20;
// Original botanical families 4-11 stay shrubs/creepers. Extra adult
// families multiply independent shoots, not leaf dimensions or opaque surfaces.
const crownProfile=family=>family<12?{habit:Math.floor(family/4),variant:family%4,density:1}:{habit:0,variant:family%4,density:family<16?4:9};
export function mountainCrownForms(family){
  const {habit,variant}=crownProfile(family);
  if(habit===0)return TREE_FORMS[variant];
  return (habit===1?BUSH_FORMS:CURTAIN_FORMS).map(([x,y,z,w,h],i)=>{
    if(habit===1){const angle=variant*.71,c=Math.cos(angle),s=Math.sin(angle);return [(x*c-z*s)*(1+(variant-1.5)*.045),y*(.92+variant*.045),x*s+z*c,w,h];}
    return [x*(variant%2?-1:1)*(1+(variant-1.5)*.04),y*(.94+variant*.04),z,w,h];
  });
}
export function createBotanicalCrownGeometry(T,family,{lod='near'}={}){
  const near=lod==='near',middle=lod==='middle',distant=lod==='distant';
  const positions=[],normals=[],colors=[],wood=[],bladeRoots=[],indices=[];
  let leafCount=0,tubeSegments=0,minLeafLength=Infinity,maxLeafLength=0;
  const up=new T.Vector3(0,1,0),{habit,variant,density}=crownProfile(family),forms=mountainCrownForms(family),stemLean=variant===2?-.13:.035;
  function triangle(a,b,c,color,isWood=false,bladeRoot=null){
    const offset=positions.length/3,n=new T.Vector3().crossVectors(b.clone().sub(a),c.clone().sub(a)).normalize();
    for(const p of [a,b,c]){positions.push(p.x,p.y,p.z);normals.push(n.x,n.y,n.z);colors.push(...color);wood.push(isWood?1:0);const r=bladeRoot||p;bladeRoots.push(r.x,r.y,r.z);}
    indices.push(offset,offset+1,offset+2);
  }
  function tube(a,b,r0,r1,sides=4){
    if(!near)sides=3;
    const dir=b.clone().sub(a).normalize(),side=new T.Vector3().crossVectors(dir,up);
    if(side.lengthSq()<.001)side.set(1,0,0);side.normalize();
    const cross=new T.Vector3().crossVectors(dir,side).normalize(),color=[1.12,.42,.65];
    for(let i=0;i<sides;i++){
      const t=i/sides*Math.PI*2,q=(i+1)/sides*Math.PI*2;
      const n0=side.clone().multiplyScalar(Math.cos(t)).addScaledVector(cross,Math.sin(t));
      const n1=side.clone().multiplyScalar(Math.cos(q)).addScaledVector(cross,Math.sin(q));
      const p0=a.clone().addScaledVector(n0,r0),p1=a.clone().addScaledVector(n1,r0),p2=b.clone().addScaledVector(n1,r1),p3=b.clone().addScaledVector(n0,r1);
      triangle(p0,p1,p2,color,true);triangle(p0,p2,p3,color,true);
    }
    tubeSegments++;
  }
  function leafBlade(base,direction,roll,seed){
    const axis=direction.clone().normalize(),side=new T.Vector3().crossVectors(axis,up);
    if(side.lengthSq()<.001)side.set(1,0,0);side.normalize().applyAxisAngle(axis,roll*(habit===0?1.35:1));
    const normal=new T.Vector3().crossVectors(side,axis).normalize();
    const length=near?.027+.022*hash(seed+13.1):middle?.06+.045*hash(seed+13.1):.10+.075*hash(seed+13.1),width=length*(habit===0?(near?.64+.16*hash(seed+17.3):middle?.68+.12*hash(seed+17.3):.60+.12*hash(seed+17.3)):(near?.32+.15*hash(seed+17.3):.43+.12*hash(seed+17.3)));
    const tip=base.clone().addScaledVector(axis,length).addScaledVector(normal,length*(hash(seed+2.1)-.28)*.23);
    const mid=base.clone().addScaledVector(axis,length*.49).addScaledVector(normal,length*.11);
    const left=base.clone().addScaledVector(axis,length*.40).addScaledVector(side,width*.5).addScaledVector(normal,-length*.035);
    const right=base.clone().addScaledVector(axis,length*.51).addScaledVector(side,-width*.5).addScaledVector(normal,-length*.04);
    const tone=.82+.36*hash(seed+19.7),color=[tone*(.91+.07*hash(seed+2)),tone,tone*(.72+.16*hash(seed+8))];
    if(distant){
      // One pointed sub-pixel leaf, never a whole-crown surface. Its open
      // triangle keeps the same leaf area without a second fold at 250 m.
      const heelLeft=base.clone().addScaledVector(side,width*.5),heelRight=base.clone().addScaledVector(side,-width*.5);
      triangle(heelLeft,tip,heelRight,color,false,base);
    }else{triangle(base,left,tip,color,false,base);triangle(base,tip,right,color,false,base);}
    leafCount++;minLeafLength=Math.min(minLeafLength,length);maxLeafLength=Math.max(maxLeafLength,length);
  }
  function leaf(base,direction,roll,seed){
    // A real compound shoot supplies leaf area and volume without scaling a
    // cluster-sized flat surface. Its small leaflets remain individually folded.
    const axis=direction.clone().normalize(),side=new T.Vector3().crossVectors(axis,up);
    if(side.lengthSq()<.001)side.set(1,0,0);side.normalize().applyAxisAngle(axis,roll*.6);
    const normal=new T.Vector3().crossVectors(side,axis).normalize(),length=near?.085+.035*hash(seed+61):middle?.11+.05*hash(seed+61):.14+.06*hash(seed+61);
    const tip=base.clone().addScaledVector(axis,length);
    if(near)tube(base,tip,.00045,.00006,3);
    const pairs=near?4:distant?3:2;
    for(let pair=0;pair<pairs;pair++){
      const t=.13+pair*(.75/Math.max(1,pairs-1)),bud=base.clone().lerp(tip,t);
      for(const sign of [-1,1]){
        const leafSeed=seed+pair*13.71+sign*.63;
        const leafDirection=axis.clone().multiplyScalar(.35+.20*hash(leafSeed+9)).addScaledVector(side,sign*.82).addScaledVector(normal,(hash(leafSeed+11)-.5)*.60).normalize();
        leafBlade(bud,leafDirection,roll+(hash(leafSeed+19)-.5)*1.2,leafSeed);
      }
    }
    if(!distant)leafBlade(tip,axis,roll,seed+79.4);
  }
  const stemPoint=y=>new T.Vector3(stemLean*y/1.6+.018*Math.sin(y*4.2+variant),y,.025*Math.sin(y*3.1+variant));
  let previous=new T.Vector3(0,0,0);const stemPath=[previous.clone()];
  if(habit===0)for(const y of [.24,.53,.84,1.16,variant===1?1.68:1.43]){
    const next=stemPoint(y);tube(previous,next,.011*(1-previous.y/2),.011*(1-y/2),5);previous=next;stemPath.push(next.clone());
  }
  const stemAttachment=y=>{for(let i=1;i<stemPath.length;i++)if(y<=stemPath[i].y)return stemPath[i-1].clone().lerp(stemPath[i],(y-stemPath[i-1].y)/(stemPath[i].y-stemPath[i-1].y));return stemPath.at(-1).clone();};
  for(let group=0;group<forms.length;group++){
    const [x,y,z,w,h]=forms[group],center=new T.Vector3(x,y,z),seed=family*157+group*31.7,phase=group*2.39996+variant*.731;
    // Shrubs branch at their common base; a hanging creeper trails from its
    // crack root. Neither inherits an adult tree's exposed single trunk.
    const origin=habit===0?stemAttachment(Math.max(.22,y*.48)):new T.Vector3(0,0,0),elbow=origin.clone().lerp(center,habit===0?.58:.40);
    elbow.y-=habit===0?.025+hash(seed+3)*.055:0;elbow.z+=(hash(seed+5)-.5)*(habit===2?.018:.04);
    if(distant)tube(origin,center,habit===0?.0035:.0018,.0007,3);
    else{tube(origin,elbow,habit===0?.0065:.0032,habit===0?.0036:.0018);tube(elbow,center,habit===0?.0036:.0018,.0009);}
    // Several shoots occupy distinct depths and elevations. Each leaf has
    // its own twisted, pointed surface; no coplanar sheet represents a tuft.
    for(let shoot=0;shoot<7*density;shoot++){
      const angle=phase+shoot*2.39996,radius=(habit===0?.30+.32*hash(seed+shoot+23):.22+.15*hash(seed+shoot+23))*w;
      const end=center.clone().add(new T.Vector3(Math.cos(angle)*radius,(hash(seed+shoot+27)-(habit===0?.45:.15))*h*(habit===0?.9:.49),Math.sin(angle)*radius*.9));
      const start=habit===0?center.clone().lerp(elbow,.18+.42*hash(seed+shoot+30)):origin.clone().lerp(center,.20+.32*hash(seed+shoot+30)),bend=start.clone().lerp(end,.56);
      bend.y+=.025+.045*hash(seed+shoot+33);
      if(near){tube(start,bend,.0017,.0011,3);tube(bend,end,.0011,.00045,3);}
      else if(middle)tube(start,end,.0011,.00035,3);
      const tangent=end.clone().sub(start).normalize(),radial=new T.Vector3(Math.cos(angle),.15,Math.sin(angle));
      for(let axil=0;axil<(near?(habit===0?8:7):distant?(habit===0?1:0):(habit===0?2:1));axil++){
        const t=near?(habit===0?.14:.07)+axil*(habit===0?.105:.13):middle&&habit===0?.30+axil*.42:.55,along=t<.56?start.clone().lerp(bend,t/.56):bend.clone().lerp(end,(t-.56)/.44);
        for(const sign of distant||near&&habit===0&&axil===7?[1]:[-1,1]){
          const leafSeed=seed+shoot*17.3+axil*2.7+sign*.34;
          const side=new T.Vector3().crossVectors(tangent,up).normalize().multiplyScalar(sign);
          if(side.lengthSq()<.01)side.set(sign,0,0);
          const direction=tangent.clone().multiplyScalar(.36).addScaledVector(side,.62).addScaledVector(radial,.18).addScaledVector(up,(hash(leafSeed+4)-.35)*.52).normalize();
          leaf(along,direction,(hash(leafSeed+9)-.5)*1.75,leafSeed);
        }
      }
      leaf(end,tangent.clone().addScaledVector(up,.25),phase+shoot,seed+shoot*13.9);
    }
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.setAttribute('liCanopyWood',new T.Float32BufferAttribute(wood,1));geometry.setIndex(indices);
  geometry.setAttribute('liBladeRoot',new T.Float32BufferAttribute(bladeRoots,3));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  let top=0;for(let i=1;i<positions.length/3;i++)if(positions[i*3+1]>positions[top*3+1])top=i;
  geometry.userData={kind:'rooted-tapered-tube-shoots-and-individual-folded-leaves',family,lod,density,leafClouds:0,leafPlanes:0,topPoint:positions.slice(top*3,top*3+3),habit:['ledge-tree','basal-multistem-shrub','trailing-cliff-creeper'][habit],leafCount,tubeSegments,triangles:indices.length/3,
    leafLengthRange:[minLeafLength,maxLeafLength],leafFaces:distant?1:2,root:[0,0,0],externalAssets:0};
  return geometry;
}
