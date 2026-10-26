// Interactive presentation can overlap CPU submission and GPU execution.
// Completed-frame counters advance only after the corresponding GL fence.
// Captures/export still drain this bounded queue before their strict render.
export function createCompletedFrameQueue(gl,{maxPending=2,onComplete=()=>{}}={}){
  const pending=[];let submitted=0,completed=0,disposed=false;
  function poll(){
    while(pending.length){
      if(gl.isContextLost())throw new Error('Live raster context lost');
      const item=pending[0],status=gl.clientWaitSync(item.sync,0,0);
      if(status===gl.WAIT_FAILED)throw new Error('Live raster GPU fence failed');
      if(status!==gl.ALREADY_SIGNALED&&status!==gl.CONDITION_SATISFIED){
        if(performance.now()-item.started>60000)throw new Error('Live raster GPU frame exceeded60seconds');
        break;
      }
      pending.shift();gl.deleteSync(item.sync);completed++;
      onComplete({milliseconds:performance.now()-item.started,submitted,completed});
    }
    return pending.length;
  }
  return {
    poll,
    canSubmit(){poll();return !disposed&&pending.length<maxPending;},
    submit(started=performance.now()){
      if(disposed||pending.length>=maxPending)throw new Error('Live raster queue capacity exceeded');
      const sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
      if(!sync)throw new Error('Live raster GPU fence unavailable');
      pending.push({sync,started});submitted++;gl.flush();
    },
    async drain(){while(poll())await new Promise(resolve=>setTimeout(resolve,2));},
    getState(){return{pending:pending.length,maxPending,submittedFrames:submitted,completedFrames:completed,disposed,measurement:'Counters retire actual GL fences, not command submissions'};},
    dispose(){if(pending.length)throw new Error('Drain live raster frames before disposal');disposed=true;}
  };
}
