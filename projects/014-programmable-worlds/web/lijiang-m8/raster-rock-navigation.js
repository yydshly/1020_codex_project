// Free observation uses the actual visible rock surface inside SDF domains.
// The coarse height field remains authoritative only for unclipped lowlands.
export function createRockNavigation({THREE:T,pilots=[],terrain,clearance=.75}={}){
  const started=performance.now(),blockSize=128*3,ray=new T.Ray(),direction=new T.Vector3(),segmentBox=new T.Box3(),blockBox=new T.Box3();
  const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),hit=new T.Vector3(),entry=new T.Vector3();
  // Marching-cubes triangles retain spatial order. Conservative bounds over
  // consecutive blocks avoid scanning a whole rock on every driving frame.
  // The exact original triangles still decide every collision.
  const items=pilots.map(p=>{
    const mesh=p.mesh;mesh.updateWorldMatrix(true,false);const geometry=mesh.geometry,positions=geometry.attributes.position,index=geometry.index;
    if(!geometry.boundingBox)geometry.computeBoundingBox();
    const count=index?index.count:positions.count,blocks=new Float64Array(Math.ceil(count/blockSize)*6),localBox=new T.Box3();
    for(let start=0,k=0;start<count;start+=blockSize,k+=6){
      localBox.makeEmpty();
      for(let j=start;j<Math.min(count,start+blockSize);j++){a.fromBufferAttribute(positions,index?index.getX(j):j);localBox.expandByPoint(a);}
      localBox.applyMatrix4(mesh.matrixWorld).expandByScalar(1e-6);
      blocks.set([...localBox.min.toArray(),...localBox.max.toArray()],k);
    }
    return {mesh,positions,index,count,blocks,clip:p.clipSpec,box:geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld)};
  });
  const stats={revision:'m5-actual-rock-navigation-triangle-blocks-2',moves:0,blocked:0,triangleRayQueries:0,blockTests:0,trianglesTested:0,
    blockCount:items.reduce((sum,item)=>sum+item.blocks.length/6,0),indexBytes:items.reduce((sum,item)=>sum+item.blocks.byteLength,0),buildMilliseconds:performance.now()-started,disposed:false};
  function domainAt(x,z){
    // Earlier rock domains own overlapping pixels in the renderer as well.
    for(let i=0;i<items.length;i++){const c=items[i].clip;if(c?.centre&&c?.ellipse&&((x-c.centre[0])/c.ellipse[0])**2+((z-c.centre[1])/c.ellipse[1])**2<=1)return i;}
    return -1;
  }
  function resolve(previous,desired){
    const result=desired.clone();if(stats.disposed||result.distanceToSquared(previous)<1e-12)return result;
    stats.moves++;result.x=T.MathUtils.clamp(result.x,-2250,2250);result.z=T.MathUtils.clamp(result.z,-2250,2250);result.y=Math.max(6,result.y);
    if(domainAt(result.x,result.z)<0&&result.y<(terrain.sampleHeight(result.x,result.z)||0)+6){stats.blocked++;return previous.clone();}
    direction.subVectors(result,previous);const length=direction.length();if(length<1e-8)return result;direction.divideScalar(length);
    ray.set(previous,direction);
    segmentBox.makeEmpty().expandByPoint(previous).expandByPoint(result).expandByScalar(clearance);
    let available=length;
    for(let i=0;i<items.length;i++){
      const item=items[i];if(!item.box.intersectsBox(segmentBox))continue;
      stats.triangleRayQueries++;
      for(let k=0;k<item.blocks.length;k+=6){
        stats.blockTests++;blockBox.min.fromArray(item.blocks,k);blockBox.max.fromArray(item.blocks,k+3);
        if(!blockBox.intersectsBox(segmentBox)||!ray.intersectBox(blockBox,entry))continue;
        const from=k/6*blockSize,end=Math.min(item.count,from+blockSize);
        for(let j=from;j<end;j+=3){
          stats.trianglesTested++;
          a.fromBufferAttribute(item.positions,item.index?item.index.getX(j):j).applyMatrix4(item.mesh.matrixWorld);
          b.fromBufferAttribute(item.positions,item.index?item.index.getX(j+1):j+1).applyMatrix4(item.mesh.matrixWorld);
          c.fromBufferAttribute(item.positions,item.index?item.index.getX(j+2):j+2).applyMatrix4(item.mesh.matrixWorld);
          const side=item.mesh.material.side;
          const found=side===T.BackSide?ray.intersectTriangle(c,b,a,true,hit):ray.intersectTriangle(a,b,c,side!==T.DoubleSide,hit);
          if(!found)continue;
          const distance=previous.distanceTo(hit);if(distance>available+clearance||domainAt(hit.x,hit.z)!==i)continue;
          available=Math.min(available,Math.max(0,distance-clearance));
        }
      }
    }
    if(available<length){stats.blocked++;return previous.clone().addScaledVector(direction,available);}
    return result;
  }
  return {resolve,domainAt,getStats:()=>({...stats}),dispose(){stats.disposed=true;items.length=0;}};
}
