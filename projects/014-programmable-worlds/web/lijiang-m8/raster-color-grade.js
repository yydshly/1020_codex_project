// A restrained shared morning shadow lift, before world air and ACES.
// The source-generated HDR field itself remains unchanged and auditable.
export function applyMorningGrade(material){
  if(material.userData.liMorningGrade)return;
  const compile=material.onBeforeCompile,key=material.customProgramCacheKey.call(material);
  material.onBeforeCompile=function(shader,renderer){
    compile.call(this,shader,renderer);
    shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>',`
      float liMorningLuma=dot(gl_FragColor.rgb,vec3(.2126,.7152,.0722));
      gl_FragColor.rgb+=vec3(.009,.013,.014)*exp(-liMorningLuma*18.);
      #include <tonemapping_fragment>`);
  };
  material.customProgramCacheKey=()=>key+'-li-soft-morning-shadow-1';
  material.userData.liMorningGrade='li-soft-morning-shadow-1';material.needsUpdate=true;
}
