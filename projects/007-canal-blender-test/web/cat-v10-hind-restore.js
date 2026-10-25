const bytes=array=>new Uint8Array(array.buffer,array.byteOffset,array.byteLength);
const hash=async data=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(n=>n.toString(16).padStart(2,'0')).join('');

// Restore only the original V3 upper/lower distribution, retaining the V10
// total leg influence, torso weights and the re-calibrated rigid paw.
export async function restoreHindSkin(THREE,object) {
  let mesh;object.traverse(n=>{if(!mesh&&n.isSkinnedMesh)mesh=n;});
  if(!mesh)throw new Error('Hind restoration requires the cat body');
  const [mr,br]=await Promise.all([
    fetch(new URL('./models/cat-v10-hind-ratios.json',import.meta.url)),
    fetch(new URL('./models/cat-v10-hind-ratios.bin',import.meta.url))
  ]);
  if(!mr.ok||!br.ok)throw new Error('Original hind ratios could not be loaded');
  const [metadata,buffer]=await Promise.all([mr.json(),br.arrayBuffer()]);
  const original=mesh.geometry,p=original.attributes.position;
  const fingerprints=await Promise.all([hash(bytes(p.array)),hash(new Uint8Array(buffer))]);
  const view=new DataView(buffer);
  if(p.count!==metadata.vertices||buffer.byteLength!==16+p.count*4||view.getUint32(0,true)!==0x30485243||view.getUint32(4,true)!==1||view.getUint32(8,true)!==p.count||fingerprints[0]!==metadata.positionSHA256||fingerprints[1]!==metadata.binarySHA256)throw new Error('Original hind ratio asset does not match the cat');
  const ratios=new Float32Array(buffer,16,p.count),geometry=original.clone(),si=geometry.attributes.skinIndex,sw=geometry.attributes.skinWeight;
  const names=mesh.skeleton.bones.map(b=>b.name),protectedBone=names.map(n=>/^(head|neck|tail)/.test(n));
  const ids={left:[names.indexOf('hind_left_upper'),names.indexOf('hind_left_lower')],right:[names.indexOf('hind_right_upper'),names.indexOf('hind_right_lower')]};
  if([...ids.left,...ids.right].some(id=>id<0))throw new Error('Hind bones are missing');
  let changedVertices=0,skippedPalette=0,maxTransfer=0;
  for(let i=0;i<p.count;i++){
    const code=ratios[i];if(code===0||p.getY(i)<=.065)continue;
    const palette=new Map();for(let s=0;s<4;s++){const b=si.getComponent(i,s),w=sw.getComponent(i,s);if(w>0)palette.set(b,(palette.get(b)||0)+w);}
    if([...palette.keys()].some(b=>protectedBone[b]))continue;
    const [upper,lower]=code>0?ids.left:ids.right,ratio=Math.max(0,Math.min(1,Math.abs(code)-1));
    const total=(palette.get(upper)||0)+(palette.get(lower)||0);if(total<=1e-7)continue;
    const wanted=total*ratio,transfer=wanted-(palette.get(upper)||0);if(Math.abs(transfer)<1e-7)continue;
    const next=new Map(palette);next.set(upper,wanted);next.set(lower,total-wanted);
    const values=[...next].filter(([,w])=>w>1e-9).sort((a,b)=>b[1]-a[1]);
    if(values.length>4){skippedPalette++;continue;}
    for(let s=0;s<4;s++){si.setComponent(i,s,values[s]?.[0]??0);sw.setComponent(i,s,values[s]?.[1]??0);}
    maxTransfer=Math.max(maxTransfer,Math.abs(transfer));changedVertices++;
  }
  si.needsUpdate=sw.needsUpdate=true;mesh.geometry=geometry;
  let disposed=false;return {geometry,stats:{method:'Original V3 hind upper/lower ratio with current leg total',sourceAssetSHA256:metadata.sourceAssetSHA256,changedVertices,skippedPalette,maxTransfer},dispose(){if(!disposed){disposed=true;geometry.dispose();}}};
}
