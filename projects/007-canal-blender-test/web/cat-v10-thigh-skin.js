// Anatomical palette correction: tissue above the hind knee belongs to the
// femur/hip region, even when it is behind the knee along the hock direction.
// Keep each leg's total influence, rigid paw and torso influences unchanged.
export function prepareThighSkin(THREE, object) {
  let mesh;object.traverse(n=>{if(!mesh&&n.isSkinnedMesh)mesh=n;});
  if(!mesh)throw new Error('Thigh correction requires the cat mesh');
  const geometry=mesh.geometry.clone(),p=geometry.attributes.position,si=geometry.attributes.skinIndex,sw=geometry.attributes.skinWeight;
  const names=mesh.skeleton.bones.map(b=>b.name),protectedBone=names.map(name=>/^(head|neck|tail)/.test(name));
  const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
  const chains=['hind_left','hind_right'].map(key=>{
    const upper=names.indexOf(key+'_upper'),lower=names.indexOf(key+'_lower');
    const bind=new THREE.Matrix4().copy(mesh.skeleton.boneInverses[lower]).invert();
    // bindMatrixInverse is updated by AttachedBindMode as the live mesh moves;
    // invert the original bindMatrix instead to stay in authored rest space.
    const knee=new THREE.Vector3().setFromMatrixPosition(bind).applyMatrix4(mesh.bindMatrix.clone().invert());
    return {key,upper,lower,knee};
  });
  let changedVertices=0,skippedPalette=0,maxTransferredWeight=0;
  for(let i=0;i<p.count;i++){
    const y=p.getY(i),z=p.getZ(i);if(y<=.065)continue;
    const weights=new Map();for(let s=0;s<4;s++){const w=sw.getComponent(i,s);if(w>0)weights.set(si.getComponent(i,s),(weights.get(si.getComponent(i,s))||0)+w);}
    if([...weights.keys()].some(b=>protectedBone[b]))continue;
    let changed=false;
    for(const chain of chains){
      const lowerWeight=weights.get(chain.lower)||0;if(lowerWeight<=1e-7)continue;
      const above=smooth(chain.knee.y-.010,chain.knee.y+.030,y);
      const posterior=1-smooth(chain.knee.z-.025,chain.knee.z+.015,z);
      const transfer=lowerWeight*above*posterior;
      if(transfer<=1e-7)continue;
      if(!weights.has(chain.upper)&&weights.size===4){skippedPalette++;continue;}
      weights.set(chain.lower,lowerWeight-transfer);weights.set(chain.upper,(weights.get(chain.upper)||0)+transfer);
      maxTransferredWeight=Math.max(maxTransferredWeight,transfer);changed=true;
    }
    if(!changed)continue;
    const values=[...weights].filter(([,w])=>w>1e-9).sort((a,b)=>b[1]-a[1]);
    for(let s=0;s<4;s++){si.setComponent(i,s,values[s]?.[0]??0);sw.setComponent(i,s,values[s]?.[1]??0);}
    changedVertices++;
  }
  si.needsUpdate=sw.needsUpdate=true;mesh.geometry=geometry;
  let disposed=false;return {geometry,stats:{method:'Above-knee posterior hind-thigh reassignment',changedVertices,skippedPalette,maxTransferredWeight,knees:chains.map(c=>({key:c.key,point:c.knee.toArray()}))},dispose(){if(!disposed){disposed=true;geometry.dispose();}}};
}
