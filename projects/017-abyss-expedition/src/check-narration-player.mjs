// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {createNarrationPlayer,createNarrationAssetCache} from '../web/rendering/narration-player.mjs';
class Media {
  currentTime=0;paused=true;ended=false;playbackRate=1;events=new Map();src='';error=null;
  addEventListener(name,fn){this.events.set(name,fn);}removeEventListener(name){this.events.delete(name);}
  pause(){this.paused=true;}load(){this.currentTime=0;this.ended=false;}removeAttribute(){this.src='';}getAttribute(){return this.src;}
  play(){this.paused=false;return this.reject?Promise.reject(Error('blocked')):Promise.resolve();}
}
const audio=new Media(),statuses=[];let blocked=0;
const player=createNarrationPlayer({audio,onStatus:value=>statuses.push(value),onBlocked:()=>blocked++});
const first={active:true,playing:true,completed:false,shotElapsed:0,shot:{audio:{file:'assets/narration/first.mp3',duration:10}}};
player.sync(first);await Promise.resolve();assert.equal(audio.paused,false);
assert.equal(player.advance(first,.1),0,'Buffering must hold the film');
audio.currentTime=.2;assert.equal(player.advance(first,.1),.2,'The film follows the actual media position');
audio.currentTime=4;assert.equal(player.advance(first,.1),4,'A slow WebGL frame must catch up to the voice rather than cap the media clock');
player.sync({...first,playing:false,shotElapsed:.2});assert.equal(audio.paused,true);
audio.currentTime=.2;player.sync({...first,playing:false,shotElapsed:7},{discontinuity:true});assert.equal(audio.currentTime,7);assert.equal(audio.paused,true);
player.sync({...first,shotElapsed:7},{rate:2});assert.equal(audio.playbackRate,2);await Promise.resolve();
const second={...first,shot:{audio:{file:'assets/narration/second.mp3',duration:12}}};
player.sync(second);await Promise.resolve();assert.equal(audio.src,second.shot.audio.file);assert.equal(audio.currentTime,0,'Chapter changes must discard the previous media position');
player.setEnabled(false);assert.equal(audio.paused,true);assert.equal(player.advance(second,.1),.1,'Explicit silent mode may use wall time');
player.setEnabled(true);await Promise.resolve();assert.equal(audio.paused,false);
player.sync({...second,playing:false});audio.reject=true;player.sync(second);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(blocked,1);assert.equal(player.advance(second,.1),0);assert.equal(statuses.at(-1).kind,'blocked');
audio.reject=false;player.retry();await Promise.resolve();assert.equal(audio.paused,false);
player.sync({...second,playing:false,shotElapsed:11.9},{discontinuity:true});audio.currentTime=12;audio.ended=true;assert.equal(player.advance({...second,shotElapsed:12},.1),.1,'After speech, the final visual beat can advance');
audio.paused=true;player.sync({...second,shotElapsed:11.9});assert.equal(audio.paused,true,'An ended audio element must not restart during the tail');audio.ended=false;audio.duration=11.93;assert.equal(player.advance({...second,shotElapsed:11.92},.1),.1,'MP3 decoder padding differences must not deadlock the film');
player.sync({...second,active:false,playing:false});assert.equal(audio.paused,true);player.destroy();assert.equal(audio.events.size,0);
let requestCount=0;const revoked=[];
const cache=createNarrationAssetCache({fetchImpl:async()=>{requestCount++;return {ok:true,blob:async()=>({bytes:42})};},createUrl:()=>`blob:${requestCount}`,revokeUrl:url=>revoked.push(url)});
assert.deepEqual(await Promise.all([cache.resolve('a.mp3'),cache.resolve('a.mp3')]),['blob:1','blob:1']);assert.equal(requestCount,1);cache.destroy();assert.deepEqual(revoked,['blob:1']);await assert.rejects(cache.resolve('a.mp3'));
const delayed=new Media(),resolvers=new Map();
const asyncPlayer=createNarrationPlayer({audio:delayed,resolveSource:file=>new Promise(resolve=>resolvers.set(file,resolve))});
asyncPlayer.sync(first);asyncPlayer.sync({...first,playing:false,shotElapsed:4},{discontinuity:true});resolvers.get(first.shot.audio.file)('blob:first');await Promise.resolve();assert.equal(delayed.currentTime,4,'A seek while loading must survive the async source commit');assert.equal(delayed.paused,true);
asyncPlayer.sync(second);asyncPlayer.sync(first);resolvers.get(second.shot.audio.file)('blob:stale');await Promise.resolve();assert.notEqual(delayed.src,'blob:stale','A stale chapter download must not replace the current chapter');asyncPlayer.destroy();
const pendingMedia=new Media();let abortPlay,unexpectedBlock=0;pendingMedia.play=()=>{pendingMedia.paused=false;return new Promise((_,reject)=>{abortPlay=reject;});};
const pendingPlayer=createNarrationPlayer({audio:pendingMedia,onBlocked:()=>unexpectedBlock++});pendingPlayer.sync(first);pendingPlayer.sync({...first,playing:false});abortPlay(Error('AbortError after pause'));await new Promise(resolve=>setTimeout(resolve,0));assert.equal(unexpectedBlock,0,'An intentional pause must not be reported as an autoplay failure');pendingPlayer.destroy();
const resumedMedia=new Media(),rejects=[];let resumeBlocked=0;resumedMedia.play=()=>{resumedMedia.paused=false;return new Promise((_,reject)=>rejects.push(reject));};const resumedPlayer=createNarrationPlayer({audio:resumedMedia,onBlocked:()=>resumeBlocked++});resumedPlayer.sync(first);resumedPlayer.sync({...first,playing:false});resumedPlayer.sync(first);assert.equal(rejects.length,2,'Resume must issue a fresh play request');rejects[0](Error('Delayed AbortError'));await new Promise(resolve=>setTimeout(resolve,0));assert.equal(resumeBlocked,0,'An old aborted play must not block the resumed film');resumedPlayer.destroy();
const silentMedia=new Media();let rejectDownload,silentBlocks=0,downloadCount=0;const silentPlayer=createNarrationPlayer({audio:silentMedia,onBlocked:()=>silentBlocks++,resolveSource:()=>{downloadCount++;return new Promise((_,reject)=>{rejectDownload=reject;});}});silentPlayer.sync(first);silentPlayer.setEnabled(false);rejectDownload(Error('Network failed after choosing silent mode'));await new Promise(resolve=>setTimeout(resolve,0));assert.equal(silentBlocks,0,'A failed download cannot pause an explicitly silent film');silentPlayer.setEnabled(true);assert.equal(downloadCount,2,'Re-enabling after a silent download failure retries loading');silentPlayer.destroy();
console.log('PASS narration player: audio clock, buffering, pause, seek, chapter, rate, silent mode, blocked play, retry, teardown');
