// Experimental rest-position field. UV islands query the same spatial kernel;
// their indexed connectivity never controls the corrected weight palette.
export function prepareContinuousSkin(THREE, object, options = {}) {
  let mesh; object.traverse(n => { if (!mesh && n.isSkinnedMesh) mesh = n; });
  if (!mesh) throw new Error('Continuous skin requires the cat mesh');
  const geometry=mesh.geometry.clone(), p=geometry.attributes.position;
  const sourceWeights=geometry.attributes.skinWeight.array.slice(), sourceJoints=geometry.attributes.skinIndex.array.slice();
  const weights=geometry.attributes.skinWeight, joints=geometry.attributes.skinIndex;
  const names=mesh.skeleton.bones.map(b=>b.name), n=names.length;
  const sigma=options.sigma??.008, radius=sigma*3, radiusSq=radius*radius;
  const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
  const grid=new Map(), cellOf=(x,y,z)=>[Math.floor(x/radius),Math.floor(y/radius),Math.floor(z/radius)];
  const xyz=Array.from({length:p.count},(_,i)=>[p.getX(i),p.getY(i),p.getZ(i)]);
  for(let i=0;i<p.count;i++){
    const key=cellOf(...xyz[i]).join(',');if(!grid.has(key))grid.set(key,[]);grid.get(key).push(i);
  }
  const protectedJoint=names.map(name=>/^(head|neck|tail)/.test(name));
  const spine=names.indexOf('spine'),chest=names.indexOf('chest');
  const fields={};for(const prefix of ['fore_left','fore_right','hind_left','hind_right'])fields[prefix]=['upper','lower','paw'].map(part=>names.indexOf(prefix+'_'+part));
  let changed=0,protectedVertices=0,maxWeightSumError=0,maxDroppedWeight=0;
  const started=performance.now();
  for(let i=0;i<p.count;i++){
    const [x,y,z]=xyz[i];
    const envelope=smooth(.065,.105,y)*(1-smooth(.225,.255,y))*smooth(.002,.008,Math.abs(x)) * smooth(.005,.025,Math.abs(z-.02));
    let protectedWeight=0;for(let s=0;s<4;s++)if(protectedJoint[sourceJoints[4*i+s]])protectedWeight+=sourceWeights[4*i+s];
    if(envelope<=0||protectedWeight>1e-6){protectedVertices++;continue;}
    const front=z>.02, key=(front?'fore_':'hind_')+(x<0?'left':'right');
    const leg=fields[key], torso=front?chest:spine;
    const averaged=new Float64Array(4), cell=cellOf(x,y,z); let total=0;
    for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)for(let c=-1;c<=1;c++){
      const ids=grid.get([cell[0]+a,cell[1]+b,cell[2]+c].join(','));if(!ids)continue;
      for(const j of ids){
        const q=xyz[j],d2=(x-q[0])**2+(y-q[1])**2+(z-q[2])**2;if(d2>=radiusSq)continue;
        // A compact smooth cutoff has no jump when a sample enters support.
        const taper=1-d2/radiusSq,k=Math.exp(-d2/(2*sigma*sigma))*taper*taper;
        total+=k;
        for(let s=0;s<4;s++){
          const bone=sourceJoints[4*j+s],slot=leg.indexOf(bone),w=sourceWeights[4*j+s];
          averaged[slot<0?3:slot]+=k*w;
        }
      }
    }
    if(total<=0)continue;
    const palette=new Map();
    for(let s=0;s<4;s++){
      const bone=sourceJoints[4*i+s],value=sourceWeights[4*i+s]*(1-envelope);
      if(value>0)palette.set(bone,(palette.get(bone)||0)+value);
    }
    for(let s=0;s<4;s++){const bone=s<3?leg[s]:torso;palette.set(bone,(palette.get(bone)||0)+envelope*averaged[s]/total);}
    const ordered=[...palette].filter(([,w])=>w>1e-9).sort((a,b)=>b[1]-a[1]);
    const kept=ordered.slice(0,4),sum=kept.reduce((s,[,w])=>s+w,0);
    maxDroppedWeight=Math.max(maxDroppedWeight,ordered.slice(4).reduce((s,[,w])=>s+w,0));
    for(let s=0;s<4;s++){joints.setComponent(i,s,kept[s]?.[0]??torso);weights.setComponent(i,s,(kept[s]?.[1]??0)/sum);}
    changed++;
  }
  for(let i=0;i<p.count;i++){let sum=0;for(let s=0;s<4;s++)sum+=weights.getComponent(i,s);maxWeightSumError=Math.max(maxWeightSumError,Math.abs(1-sum));}
  joints.needsUpdate=weights.needsUpdate=true;mesh.geometry=geometry;
  const stats={method:'Continuous rest-position compact Gaussian field',sigma,radius,changedVertices:changed,protectedVertices,maxWeightSumError,maxDroppedWeight,preparationMs:performance.now()-started,vertices:p.count,triangles:geometry.index.count/3};
  let disposed=false;return {stats,geometry,dispose(){if(!disposed){disposed=true;geometry.dispose();}}};
}
