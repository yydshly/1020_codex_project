// Actual surface-supported root/vine paths and small individual basal
// moss leaves. Data is sampled from the SDF mesh by raster-mountain-ecology.
// Geometry is mounted only near the camera; no external textures or assets.
const REVISION='m5-supported-irregular-moss-and-fern-contact-4';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function createMountainContact({THREE:T,records=[],camera,range=230}={}){
  const group=new T.Group();group.name='Mountain roots and fissure contact';
  const cameraUniform={value:new T.Vector3()},tiles=new Map(),mounted=new Set();
  const material=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
  material.name='Root bark and small folded basal moss leaves';
  material.onBeforeCompile=shader=>{
    shader.uniforms.uContactCamera=cameraUniform;
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      attribute vec3 contactRoot;attribute float contactKey;uniform vec3 uContactCamera;varying float vContactDistance;varying float vContactKey;`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        vContactDistance=min(distance(contactRoot,uContactCamera),distance(contactRoot,vec3(uContactCamera.x,-uContactCamera.y,uContactCamera.z)));vContactKey=contactKey;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying float vContactDistance;varying float vContactKey;`)
      .replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
        if(vContactKey<smoothstep(${(range-50).toFixed(1)},${range.toFixed(1)},vContactDistance))discard;`);
  };
  material.customProgramCacheKey=()=>REVISION+'-'+range;
  const stats={revision:REVISION,records:records.length,paths:0,patches:0,mossSamples:0,externalAssets:0,tiles:0,mountedTiles:0,
    visibleTiles:0,triangles:0,submittedTriangles:0,builds:0,disposed:false,range,
    method:'Short embedded roots, irregular tufts of folded moss leaves and small connected fern fronds; all tuft bases sampled on visible SDF triangles, no opaque soil badges; conservative main/mirror-Y visibility union'};
  for(const r of records){
    const key=Math.floor(r.root[0]/48)+','+Math.floor(r.root[1]/48)+','+Math.floor(r.root[2]/48);
    let tile=tiles.get(key);if(!tile){tile={records:[],center:new T.Vector3((Math.floor(r.root[0]/48)+.5)*48,(Math.floor(r.root[1]/48)+.5)*48,(Math.floor(r.root[2]/48)+.5)*48),mesh:null,lastUse:0};tiles.set(key,tile);}
    tile.records.push(r);stats.paths+=r.paths.length;if(r.patch.length)stats.patches++;stats.mossSamples+=(r.moss?.length||0)/7;
  }
  stats.tiles=tiles.size;
  function build(tile){
    const positions=[],normals=[],colors=[],roots=[],keys=[],indices=[];
    const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),normal=new T.Vector3();
    function vertex(point,n,color,r){const i=positions.length/3;positions.push(...point);normals.push(...n);colors.push(...color);roots.push(...r.root);keys.push(r.seed);return i;}
    function triangle(pa,pb,pc,color,r,na=null,nb=null,nc=null){
      a.fromArray(pa);b.fromArray(pb);c.fromArray(pc);normal.crossVectors(b.sub(a),c.sub(a)).normalize();
      const n=normal.toArray(),start=positions.length/3;
      vertex(pa,na||n,color,r);vertex(pb,nb||n,color,r);vertex(pc,nc||n,color,r);indices.push(start,start+1,start+2);
    }
    function blade(origin,direction,surfaceNormal,length,width,color,r){
      const axis=direction.clone().normalize(),lateral=new T.Vector3().crossVectors(axis,surfaceNormal).normalize().multiplyScalar(width);
      if(lateral.lengthSq()<1e-8)return;
      const tip=origin.clone().addScaledVector(axis,length),middle=origin.clone().lerp(tip,.48).addScaledVector(surfaceNormal,length*.12);
      const left=origin.clone().lerp(tip,.43).add(lateral),right=origin.clone().lerp(tip,.43).sub(lateral);
      triangle(origin.toArray(),left.toArray(),middle.toArray(),color,r);triangle(origin.toArray(),middle.toArray(),right.toArray(),color,r);
      triangle(left.toArray(),tip.toArray(),middle.toArray(),color,r);triangle(middle.toArray(),tip.toArray(),right.toArray(),color,r);
    }
    function sprig(base,n,strength,key,r,fern=false){
      // Every blade shares an exact sampled surface base; fern leaflets are
      // attached to a short stem rooted at that same base, never free cards.
      const horizontal=Math.hypot(n.x,n.z),lateral=horizontal>.001?new T.Vector3(-n.z/horizontal,0,n.x/horizontal):new T.Vector3(1,0,0);
      const downhill=new T.Vector3(n.x*n.y,-1+n.y*n.y,n.z*n.y);if(downhill.lengthSq()<.00001)downhill.set(0,0,1);downhill.normalize();
      const origin=base.clone().addScaledVector(n,.002),count=3+Math.floor(strength*4),tone=.78+.38*((key*7.17)%1);
      const color=[(.058+.025*strength)*tone,(.100+.043*strength)*tone,.024*tone];
      for(let k=0;k<count;k++){
        const angle=key*6.283+k*2.39996,jitter=(Math.sin(key*91+k*37)*43758.5453)%1;
        const direction=lateral.clone().multiplyScalar(Math.cos(angle)).addScaledVector(downhill,Math.sin(angle)).addScaledVector(n,.42+.20*Math.abs(jitter)).normalize();
        const length=(.065+.10*strength)*(.74+.40*Math.abs(jitter));
        blade(origin,direction,n,length,length*(.14+.04*Math.abs(jitter)),color,r);
      }
      if(!fern)return;
      const angle=key*9.71,axis=lateral.clone().multiplyScalar(Math.cos(angle)*.42).addScaledVector(downhill,-.30).addScaledVector(n,.65).normalize();
      const across=new T.Vector3().crossVectors(axis,n).normalize(),length=.18+.20*strength;
      // A connected four-sided rachis keeps paired fern leaflets from
      // appearing to hover above the stone.
      const end=origin.clone().addScaledVector(axis,length),cross=new T.Vector3().crossVectors(axis,across).normalize();
      const stemColor=[color[0]*.72,color[1]*.76,color[2]*.72],rings=[];
      for(let j=0;j<2;j++){
        const ring=[],p=j?end:origin,radius=j?.0018:.0038;
        for(let k=0;k<4;k++){const angle=k*Math.PI*.5,normal=across.clone().multiplyScalar(Math.cos(angle)).addScaledVector(cross,Math.sin(angle));ring.push(vertex(p.clone().addScaledVector(normal,radius).toArray(),normal.toArray(),stemColor,r));}rings.push(ring);
      }
      for(let k=0;k<4;k++){const next=(k+1)%4;indices.push(rings[0][k],rings[1][next],rings[1][k],rings[0][k],rings[0][next],rings[1][next]);}
      for(let j=1;j<=3;j++)for(const sign of [-1,1]){
        const point=origin.clone().addScaledVector(axis,length*(.18+j*.19)),direction=across.clone().multiplyScalar(sign).addScaledVector(axis,.43).addScaledVector(n,.18).normalize();
        const size=length*(.26-.035*j);blade(point,direction,n,size,size*.19,color,r);
      }
      blade(end,axis,n,length*.17,length*.035,color,r);
    }
    const up=new T.Vector3(),tangent=new T.Vector3(),side=new T.Vector3(),across=new T.Vector3(),center=new T.Vector3();
    for(const r of tile.records){
      const tone=.82+.32*r.seed,wood=[.090*tone,.082*tone,.054*tone];
      for(const path of r.paths){
        const rings=[],count=path.length/7;
        for(let j=0;j<count;j++){
          const q=j*7,prev=Math.max(0,j-1)*7,next=Math.min(count-1,j+1)*7;
          up.set(path[q+3],path[q+4],path[q+5]);tangent.set(path[next]-path[prev],path[next+1]-path[prev+1],path[next+2]-path[prev+2]).normalize();
          side.crossVectors(tangent,up).normalize();if(side.lengthSq()<.01)side.set(1,0,0);across.crossVectors(tangent,side).normalize();
          const radius=path[q+6];center.set(path[q],path[q+1],path[q+2]).addScaledVector(up,-radius*.80+.003);
          const ring=[];
          for(let k=0;k<6;k++){const angle=k/6*Math.PI*2,n=side.clone().multiplyScalar(Math.cos(angle)).addScaledVector(across,Math.sin(angle));
            ring.push(vertex(center.clone().addScaledVector(n,radius).toArray(),n.toArray(),wood,r));}
          rings.push(ring);
          if(j){const previous=rings[j-1];for(let k=0;k<6;k++){const n=(k+1)%6;indices.push(previous[k],ring[n],ring[k],previous[k],previous[n],ring[n]);}}
          // Irregularly thin out along each actual supported fissure. The
          // root has a leafy transition, the outer root remains sparse.
          if(j>0&&(j<count*.65||j%2===0))sprig(new T.Vector3(path[q],path[q+1],path[q+2]),up,Math.max(.16,.72-j/count*.60),(r.seed+j*.381)%1,r,false);
        }
      }
      for(let q=0;q<(r.moss?.length||0);q+=7){
        const sample=q/7,key=(r.seed+sample*.618033989)%1,strength=r.moss[q+6];
        sprig(new T.Vector3(r.moss[q],r.moss[q+1],r.moss[q+2]),new T.Vector3(r.moss[q+3],r.moss[q+4],r.moss[q+5]),strength,key,r,sample===0||sample%4===1&&strength>.38);
      }
    }
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
    geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.setAttribute('contactRoot',new T.Float32BufferAttribute(roots,3));geometry.setAttribute('contactKey',new T.Float32BufferAttribute(keys,1));
    geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const mesh=new T.Mesh(geometry,material);mesh.name='Supported rock-contact tile';mesh.castShadow=false;mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;mesh.updateMatrix();mesh.userData.triangles=indices.length/3;
    group.add(mesh);tile.mesh=mesh;mounted.add(tile);stats.builds++;stats.triangles+=mesh.userData.triangles;
  }
  function release(tile){if(!tile.mesh)return;stats.triangles-=tile.mesh.userData.triangles;tile.mesh.geometry.dispose();tile.mesh.removeFromParent();tile.mesh=null;mounted.delete(tile);}
  const view=new T.Vector3(),mirrorCenter=new T.Vector3(),sphere=new T.Sphere(),frustum=new T.Frustum(),projection=new T.Matrix4();
  function update(nextCamera=camera,{force=false}={}){
    if(stats.disposed||!nextCamera)return {...stats};nextCamera.updateMatrixWorld();nextCamera.getWorldPosition(view);cameraUniform.value.copy(view);
    projection.multiplyMatrices(nextCamera.projectionMatrix,nextCamera.matrixWorldInverse);frustum.setFromProjectionMatrix(projection);
    const now=performance.now(),pending=[];stats.visibleTiles=0;stats.submittedTriangles=0;
    for(const tile of tiles.values()){
      mirrorCenter.copy(tile.center);mirrorCenter.y=-mirrorCenter.y;
      const near=Math.max(0,Math.min(tile.center.distanceTo(view),mirrorCenter.distanceTo(view))-48),
        wanted=near<range&&(frustum.intersectsSphere(sphere.set(tile.center,48))||frustum.intersectsSphere(sphere.set(mirrorCenter,48)));
      if(wanted){tile.lastUse=now;if(!tile.mesh)pending.push({tile,near});else{tile.mesh.visible=true;stats.visibleTiles++;stats.submittedTriangles+=tile.mesh.userData.triangles;}}
      else if(tile.mesh){tile.mesh.visible=false;if(now-tile.lastUse>4000)release(tile);}
    }
    pending.sort((a,b)=>a.near-b.near);const count=force?pending.length:Math.min(3,pending.length);
    for(let i=0;i<count;i++){build(pending[i].tile);stats.visibleTiles++;stats.submittedTriangles+=pending[i].tile.mesh.userData.triangles;}
    stats.pending=pending.length-count;stats.mountedTiles=mounted.size;return {...stats};
  }
  return {group,materials:[material],update,prewarm:nextCamera=>update(nextCamera,{force:true}),getStats:()=>({...stats}),
    dispose(){if(stats.disposed)return;stats.disposed=true;for(const tile of [...mounted])release(tile);material.dispose();tiles.clear();group.removeFromParent();group.clear();stats.visibleTiles=0;stats.submittedTriangles=0;}};
}
