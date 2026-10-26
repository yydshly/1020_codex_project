// v4: water module replacement (applied after patch_v3, before tweaks)
const fs=require('fs'); const path=__dirname+'/v2_template.html'; let s=fs.readFileSync(path,'utf8');
const cut=(a,b,r)=>{ const i=s.indexOf(a), j=s.indexOf(b,i); if(i<0||j<0){console.error('CUT MISSING',a); process.exitCode=1; return;} s=s.slice(0,i)+r+s.slice(j); };
cut('// ---------------------------------------------------------------- water shading', '// ---------------------------------------------------------------- atmosphere', fs.readFileSync(__dirname+'/v4_water.glsl','utf8'));
fs.writeFileSync(path,s); console.log('patched v4');
// v4 sky: cumulus
{
  let s2=fs.readFileSync(path,'utf8');
  const a=s2.indexOf('vec3 skyCol(vec3 rd){'), b=s2.indexOf('vec3 skyIrr(vec3 N){');
  if(a<0||b<0){ console.error('SKY CUT MISSING'); process.exitCode=1; }
  else { s2=s2.slice(0,a)+fs.readFileSync(__dirname+'/v4_sky.glsl','utf8')+s2.slice(b); }
  s2=s2.replace('uniform vec2 uShore; uniform int uDbgM;','uniform vec2 uShore; uniform int uDbgM; uniform float uCloud;');
  s2=s2.replace("gl.uniform1i(u.uDbgM, num('dbgm', 0));","gl.uniform1i(u.uDbgM, num('dbgm', 0)); gl.uniform1f(u.uCloud, num('cloud', 0.0));");
  fs.writeFileSync(path,s2); console.log('patched v4 sky');
}
