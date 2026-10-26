"""Li River morning atmosphere, integrated along both primary/reflected rays.

The air belongs to this river rather than the source island's coast/valley z
zones. Thin moving Gaussian banks are integrated analytically, so they do not
add a second terrain march or use screen-space overlays.
"""
from __future__ import annotations

from lijiang_native_river import _functions

REVISION = 'lijiang-morning-air-1'

FOG = r'''
float liErf(float x){
  float a=abs(x),q=1./(1.+.3275911*a);
  float y=1.-(((((1.061405429*q-1.453152027)*q)+1.421413741)*q-.284496736)*q+.254829592)*q*exp(-a*a);
  return sign(x)*y;
}
float liMistBank(vec3 ro,vec3 rd,float distance,vec3 centre,vec3 axes){
  vec3 o=(ro-centre)/axes,d=rd/axes;
  float a=max(dot(d,d),1e-10),b=dot(o,d),c=dot(o,o);
  float root=sqrt(a*.5),shift=b/a;
  float peak=exp(-.5*max(0.,c-b*b/a));
  return peak*1.253314137/sqrt(a)*max(0.,liErf(root*(distance+shift))-liErf(root*shift));
}
vec3 fogApply(vec3 col, vec3 ro, vec3 rd, float t){
  // Height fog has one continuous world-space field. The old island-specific
  // 800/950m z gates made unrelated sides of the river carry different air.
  float h=1./430.,k=rd.y*h;
  float airPath=exp(-ro.y*h)*(abs(k)>1e-7?(1.-exp(-t*k))/k:t);
  float tau=max(0.,uFog*airPath);
  float forward=pow(max(dot(rd,uSun),0.),8.);
  vec3 horizon=skyDome(normalize(vec3(rd.x,.025,rd.z)));
  vec3 airColour=mix(vec3(.34,.41,.45),horizon*.79,.52);
  airColour+=vec3(.07,.052,.032)*forward;
  col=mix(col,airColour,1.-exp(-tau));

  // Five unequal shallow banks drift about 10m during the full flight. Their
  // 3D optical depths naturally stop at the first visible mountain or bank.
  float scaleH=clamp(uMist.x/70.,.15,5.);
  vec3 drift=vec3(uTime*.20,0.,uTime*.085);
  float path=0.;
  path+=.70*liMistBank(ro,rd,t,vec3(-90.,18.,970.)+drift,vec3(480.,8.*scaleH,170.));
  path+=liMistBank(ro,rd,t,vec3(90.,31.,200.)+drift,vec3(510.,12.*scaleH,210.));
  path+=.82*liMistBank(ro,rd,t,vec3(-170.,24.,-470.)+drift,vec3(440.,10.*scaleH,190.));
  path+=.75*liMistBank(ro,rd,t,vec3(-330.,43.,-1200.)+drift,vec3(570.,16.*scaleH,240.));
  path+=.58*liMistBank(ro,rd,t,vec3(180.,34.,-1820.)+drift,vec3(600.,14.*scaleH,220.));
  float mistTau=max(0.,uFog*uMist.y*path*.72);
  float extinction=1.-exp(-mistTau);
  vec3 mistColour=mix(vec3(.28,.34,.35),horizon*.77,.28)+vec3(.10,.080,.052)*forward;
  // The existing controls remain meaningful: density, height and colour all
  // describe this world field, rather than a postprocess veil.
  mistColour*=uMistC/vec3(.11,.13,.15);
  gHz=1.-exp(-tau-mistTau);
  return mix(col,mistColour,extinction);
}
'''.strip()


def patch(source: str) -> tuple[str, dict]:
    functions = _functions(source, 'fogApply')
    if len(functions) != 1:
        raise ValueError('Expected one native fogApply body')
    a, b, _ = functions[0]
    source = source[:a] + FOG + source[b:]
    # Keep the shared sky/cloud renderer and soften its clear-blue dome for a
    # humid morning. Reflections call this same world-space sky.
    sky = _functions(source, 'skyDome')
    if len(sky) != 1:
        raise ValueError('Expected one shared sky dome')
    a, b, body = sky[0]
    body = body.replace('vec3(.25,.40,.75),vec3(.06,.155,.49)',
                        'vec3(.31,.43,.59),vec3(.115,.22,.39)')
    body = body.replace('vec3(.64,.73,.87)', 'vec3(.70,.73,.75)')
    body = body.replace('vec3(.76,.81,.88)', 'vec3(.80,.79,.75)')
    source = source[:a] + body + source[b:]
    before = "mistH: num('mistH', 350)"
    if source.count(before) != 1:
        raise ValueError('Native mist height default boundary changed')
    source = source.replace(before, "mistH: num('mistH', 70)", 1)
    return source, {'applied': True, 'revision': REVISION,
                    'banks': 5, 'method': 'analytic 3D Gaussian optical-depth integrals',
                    'sharedAcrossReflections': True, 'externalAssets': 0}
