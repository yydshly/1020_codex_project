// Export this scene's generated fields to the experimental mesh renderer.
// Arrays are produced in memory at runtime, never loaded from asset files.
export async function collectNativeFields() {
  const started=performance.now(),timings={};
  const sampleProgram = prog(GLSL_COMMON + `uniform sampler2D uMap;uniform vec2 uSize;out vec4 o;void main(){o=textureLod(uMap,gl_FragCoord.xy/uSize,0.);}`);
  async function read(texture, size, scalar = false) {
    const target = tex(size, size, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST), framebuffer = fbo(target);
    gl.useProgram(sampleProgram.p); bindTex(0, texture); gl.uniform1i(sampleProgram.u.uMap, 0); gl.uniform2f(sampleProgram.u.uSize, size, size);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer); gl.viewport(0, 0, size, size); gl.drawArrays(gl.TRIANGLES, 0, 3); await gpuWait();
    const data = new Float32Array(size * size * 4); gl.readPixels(0, 0, size, size, gl.RGBA, gl.FLOAT, data);
    const error = gl.getError(); gl.deleteFramebuffer(framebuffer); gl.deleteTexture(target);
    if (error) throw new Error('Generated-field readback GL error ' + error);
    if (!scalar) return { data, width: size, height: size, channels: 4 };
    const values = new Float32Array(size * size); for (let i = 0; i < values.length; i++) values[i] = data[i * 4];
    return { data: values, width: size, height: size, channels: 1 };
  }
  async function plants(spec) {
    const size = Math.round(RECT[2] / spec.G), framebuffer = fbo(spec.t), rows = 32;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    const result = [];
    for (let row = 0; row < size; row += rows) {
      const count = Math.min(rows, size - row), data = new Float32Array(size * count * 4);
      gl.readPixels(0, row, size, count, gl.RGBA, gl.FLOAT, data);
      for (let j = 0; j < count; j++) for (let i = 0; i < size; i++) {
        const at = (j * size + i) * 4, code = data[at + 3]; if (code <= 0) continue;
        const species = code >= 100 ? Math.floor(code / 100) : 0, radius = code - species * 100;
        if (radius <= 0) continue;
        const jx = ((data[at] * .5 % 1) + 1) % 1 * 2, jz = ((data[at + 1] * .5 % 1) + 1) % 1 * 2;
        result.push({ x: RECT[0] + (i + jx) * spec.G, y: data[at + 2], z: RECT[1] + (row + j + jz) * spec.G, radius, species, seed: i * 7919 + (row + j) * 104729 });
      }
      await runtimeYield();
    }
    const error = gl.getError(); gl.deleteFramebuffer(framebuffer); if (error) throw new Error('Generated plant readback GL error ' + error);
    return result;
  }
  let phase=performance.now();const height=await read(world.hTex,2048,true);timings.height=performance.now()-phase;
  phase=performance.now();const vegetation=await read(world.vTex,1024);timings.vegetation=performance.now()-phase;
  phase=performance.now();const attributes=await read(world.aTex,1024);timings.attributes=performance.now()-phase;
  phase=performance.now();const trees=await plants(world.trees);timings.trees=performance.now()-phase;
  phase=performance.now();const bushes=await plants(world.bush);timings.bushes=performance.now()-phase;
  gl.useProgram(null);
  gl.deleteProgram(sampleProgram.p);
  window.lijiangM3FieldReadbackTimings={...timings,total:performance.now()-started};
  return { height, vegetation, attributes, trees, bushes, resolution: 2048, rect: RECT.slice(), readbackTimingsMilliseconds:{...window.lijiangM3FieldReadbackTimings},provenance: { ...window.lijiangNativeProvenance, fieldExport: 'runtime-generated-float-arrays-1', externalAssets: 0 } };
}
