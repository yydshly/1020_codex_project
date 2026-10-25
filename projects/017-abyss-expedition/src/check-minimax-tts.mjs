// SPDX-License-Identifier: GPL-3.0-only
// Security/contract tests use explicit fake credentials and mocked responses.
// They never call the provider and do not write or replace generated audio.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {
  MiniMaxTtsError,MINIMAX_DEFAULTS,parsePrivateEnv,miniMaxConfig,publicMiniMaxConfig,
  audioFileFor,cachedClipMatches,requestFingerprint,sha256,buildMiniMaxRequest,
  containsMp3Frame,decodeMiniMaxResponse,synthesizeMiniMax,selectNarrationKeys,safeMiniMaxError,
} from './minimax-tts.mjs';
import {parseArguments,narrationCatalog,loadPrivateEnvironment} from './generate-narration.mjs';
import {getDirectorShots} from '../web/data/director-shots.mjs';

const secret='FAKE_TEST_ONLY_DO_NOT_USE';
const parsed=parsePrivateEnv('\uFEFFMINIMAX_API_KEY="FAKE_TEST_ONLY_DO_NOT_USE"\nMINIMAX_VOICE_ID=male-qn-qingse # comment\nIGNORED_SECRET=should-not-enter-config\nexport MINIMAX_MODEL=\'speech-2.8-hd\'\n');
assert.equal(parsed.MINIMAX_API_KEY,secret);assert.equal(parsed.MINIMAX_VOICE_ID,'male-qn-qingse');assert.equal(Object.hasOwn(parsed,'IGNORED_SECRET'),false);
const config=miniMaxConfig(parsed),publicConfig=publicMiniMaxConfig(config);
assert.equal(config.endpoint,'https://api.minimaxi.com/v1/t2a_v2');assert.deepEqual(publicConfig,MINIMAX_DEFAULTS);
assert.equal(JSON.stringify(publicConfig).includes(secret),false);assert.equal(Object.hasOwn(publicConfig,'endpoint'),false);
for(const base of ['http://api.minimaxi.com','https://evil.example','https://api.minimaxi.com.evil.example','https://name:password@api.minimaxi.com','https://api.minimaxi.com?key=oops','https://api.minimaxi.com/#hash','https://api.minimaxi.com:444','https://api.minimaxi.com/other'])assert.throws(()=>miniMaxConfig({MINIMAX_API_KEY:secret,MINIMAX_BASE_URL:base}),MiniMaxTtsError);
assert.throws(()=>miniMaxConfig({}),MiniMaxTtsError);assert.throws(()=>miniMaxConfig({MINIMAX_API_KEY:'line\nbreak'}),MiniMaxTtsError);
assert.throws(()=>miniMaxConfig({MINIMAX_API_KEY:secret,MINIMAX_MODEL:secret}),MiniMaxTtsError);

const text='这是一段公开的测试旁白。',file=audioFileFor('vents-test',config,text);
assert.match(file,/^assets\/narration\/vents-test-[a-f0-9]{12}\.mp3$/);
assert.notEqual(requestFingerprint(config,text),requestFingerprint(config,text+'变更'));
assert.equal(requestFingerprint(config,text),requestFingerprint({...config,apiKey:'another-fake'},text),'Cache identity does not publish or depend on credentials');
for(const id of ['../a','a/b','UPPER','a?key=x','a.mp3'])assert.throws(()=>audioFileFor(id,config,text),MiniMaxTtsError);
for(const directory of ['/audio','../audio','audio/../x','C:/audio','audio\\x'])assert.throws(()=>audioFileFor('valid',config,text,directory),MiniMaxTtsError);
const body=buildMiniMaxRequest(config,text);assert.equal(body.stream,false);assert.equal(body.output_format,'hex');assert.equal(body.model,'speech-2.8-hd');assert.equal(body.voice_setting.speed,.95);assert.equal(body.audio_setting.format,'mp3');
assert.equal(JSON.stringify(body).includes(secret),false);assert.throws(()=>buildMiniMaxRequest(config,''),MiniMaxTtsError);

// A minimal MPEG frame fixture validates the response contract, not real speech.
const bytes=Buffer.alloc(2048);bytes.set([0xff,0xfb,0x90,0]);
assert.equal(containsMp3Frame(bytes),true);assert.equal(containsMp3Frame(Buffer.from('ID3')),false);assert.equal(containsMp3Frame('mp3'),false);
const response={base_resp:{status_code:0,status_msg:'success'},data:{status:2,audio:bytes.toString('hex')},extra_info:{audio_format:'mp3',audio_length:2100}};
assert.deepEqual(decodeMiniMaxResponse(response),{bytes,duration:2.1});
const cache={...publicConfig,clips:{'vents-test':{file,text,bytes:bytes.length,sha256:sha256(bytes),duration:2.1}}};
assert.equal(cachedClipMatches(cache,'vents-test',text,config,bytes),true);
assert.equal(cachedClipMatches(cache,'vents-test',text+'x',config,bytes),false);
assert.equal(cachedClipMatches(cache,'vents-test',text,config,Buffer.concat([bytes,Buffer.from([0])])),false);
assert.equal(cachedClipMatches({...cache,clips:{'vents-test':{...cache.clips['vents-test'],duration:undefined}}},'vents-test',text,config,bytes),false);
for(const payload of [
  {...response,data:{status:1,audio:response.data.audio}},
  {...response,data:{status:2,audio:'not-hex'}},
  {...response,extra_info:{audio_length:0}},
  {...response,extra_info:{audio_format:'wav',audio_length:2100}},
])assert.throws(()=>decodeMiniMaxResponse(payload),MiniMaxTtsError);
let failure;
try{decodeMiniMaxResponse({base_resp:{status_code:1001,status_msg:secret},trace_id:secret});}catch(error){failure=error;}
assert.equal(safeMiniMaxError(failure).includes(secret),false);assert.equal(safeMiniMaxError(new Error(secret)).includes(secret),false);
let calls=0,captured;
const actual=await synthesizeMiniMax(text,config,{fetchImpl:async(url,options)=>{calls++;captured={url,options};return {ok:true,json:async()=>response};}});
assert.equal(calls,1);assert.equal(actual.duration,2.1);assert.equal(captured.options.redirect,'error');assert.equal(captured.options.headers.Authorization,`Bearer ${secret}`);
calls=0;
await assert.rejects(()=>synthesizeMiniMax(text,config,{fetchImpl:async()=>{calls++;throw new Error(secret);}}),error=>error.code==='REQUEST_FAILED'&&!safeMiniMaxError(error).includes(secret));
assert.equal(calls,1,'Provider failures are not automatically retried');
await assert.rejects(()=>synthesizeMiniMax(text,config,{fetchImpl:async()=>({ok:false,status:429,text:async()=>secret})}),error=>error.code==='HTTP_ERROR'&&!safeMiniMaxError(error).includes(secret));

const catalog=narrationCatalog();assert.equal(Object.keys(catalog).length,['vents','canyon'].reduce((sum,id)=>sum+getDirectorShots(id).length,0));
assert.deepEqual(selectNarrationKeys(catalog,['vents-establish','vents-establish'],1),['vents-establish']);assert.throws(()=>selectNarrationKeys(catalog,['unknown']),MiniMaxTtsError);
assert.equal(parseArguments(['--key','vents-establish,canyon-establish','--limit','2']).keys.length,2);
assert.equal(parseArguments(['--dry-run']).dryRun,true);assert.equal(parseArguments([]).intervalMs,6500);
for(const argv of [['--api-key',secret],['--interval-ms','0'],['--interval-ms','6499'],['--interval-ms','6500.5'],['--env-file']])assert.throws(()=>parseArguments(argv),MiniMaxTtsError);
await assert.rejects(()=>loadPrivateEnvironment(fileURLToPath(new URL('../web/data/director-shots.mjs',import.meta.url)),{}),error=>error.code==='ENV_PATH');

console.log(JSON.stringify({passed:true,networkCalls:0,checks:['official HTTPS endpoint allowlist','external private env path','public metadata redaction','request shape','real duration units','MP3 frame validation','text/config/hash cache','no automatic retry','bounded CLI selection']},null,2));
