// CPU reference for the V10 volume experiment. Not enabled in the delivered cat.
// It evaluates the same bone transforms with dual-quaternion skinning, while
// retaining the authored LBS result on the paws, upper body and face.
export function createVolumeEvaluator(THREE, mesh) {
  const geometry = mesh.geometry;
  const si = geometry.attributes.skinIndex, sw = geometry.attributes.skinWeight;
  const position = geometry.attributes.position;
  const names = mesh.skeleton.bones.map(b => b.name);
  const real = names.map(() => new THREE.Quaternion());
  const dual = names.map(() => new THREE.Quaternion());
  const matrix = new THREE.Matrix4(), translation = new THREE.Vector3();
  const tq = new THREE.Quaternion(), rq = new THREE.Quaternion(), dq = new THREE.Quaternion();
  const anchor = new THREE.Quaternion(), conjugate = new THREE.Quaternion();
  const transform = new THREE.Quaternion(), point = new THREE.Vector3(), lbs = new THREE.Vector3();
  const smooth = (a,b,x) => {const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
  const masks = new Float32Array(position.count);
  for(let i=0;i<position.count;i++) {
    let protectedWeight=0;
    for(let s=0;s<4;s++)if(/^(head|neck|tail)/.test(names[si.getComponent(i,s)]))protectedWeight+=sw.getComponent(i,s);
    const y=position.getY(i);
    masks[i]=protectedWeight>1e-6?0:smooth(.065,.095,y)*(1-smooth(.235,.28,y));
  }
  function update() {
    mesh.skeleton.update();
    for(let b=0;b<names.length;b++) {
      matrix.fromArray(mesh.skeleton.boneMatrices,b*16);
      real[b].setFromRotationMatrix(matrix).normalize();
      translation.setFromMatrixPosition(matrix);
      tq.set(translation.x,translation.y,translation.z,0);
      dual[b].copy(tq).multiply(real[b]);
      dual[b].set(dual[b].x*.5,dual[b].y*.5,dual[b].z*.5,dual[b].w*.5);
    }
  }
  function transformVertex(index,target,strength=1) {
    const mask=masks[index]*strength;
    target.fromBufferAttribute(position,index);
    if(mask<=0)return mesh.applyBoneTransform(index,target);
    lbs.copy(target);mesh.applyBoneTransform(index,lbs);
    point.copy(target).applyMatrix4(mesh.bindMatrix);
    rq.set(0,0,0,0);dq.set(0,0,0,0);
    anchor.copy(real[si.getX(index)]);
    for(let s=0;s<4;s++) {
      const b=si.getComponent(index,s),weight=sw.getComponent(index,s)*(anchor.dot(real[b])<0?-1:1);
      const r=real[b],d=dual[b];
      rq.set(rq.x+r.x*weight,rq.y+r.y*weight,rq.z+r.z*weight,rq.w+r.w*weight);
      dq.set(dq.x+d.x*weight,dq.y+d.y*weight,dq.z+d.z*weight,dq.w+d.w*weight);
    }
    const inverse=1/Math.max(1e-10,rq.length());
    rq.set(rq.x*inverse,rq.y*inverse,rq.z*inverse,rq.w*inverse);
    dq.set(dq.x*inverse,dq.y*inverse,dq.z*inverse,dq.w*inverse);
    const error=rq.dot(dq);
    dq.set(dq.x-rq.x*error,dq.y-rq.y*error,dq.z-rq.z*error,dq.w-rq.w*error);
    conjugate.copy(rq).conjugate();transform.copy(dq).multiply(conjugate);
    target.copy(point).applyQuaternion(rq).add(translation.set(transform.x*2,transform.y*2,transform.z*2)).applyMatrix4(mesh.bindMatrixInverse);
    return target.lerp(lbs,1-mask);
  }
  update();
  return {update,transformVertex,masks,method:'regional dual quaternion reference',real,dual};
}
