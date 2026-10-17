// Home rail fill: five soft blobs that drift and lean toward the pointer.
// The CSS gradient underneath stays as the fallback when WebGL is unavailable.
(() => {
  const canvas = document.querySelector('#rail-shader');
  const gl = canvas?.getContext('webgl', {alpha: false, antialias: false, powerPreference: 'low-power'});
  if (!gl) return;
  const vertex = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';
  const fragment = `
    precision mediump float;
    uniform vec2 size; uniform float time; uniform vec2 pointer; uniform float pull; uniform float blur;
    const vec3 base = vec3(0.153, 0.133, 0.169);
    vec3 tint(int i) {
      if (i == 0) return vec3(0.200, 0.361, 0.388);
      if (i == 1) return vec3(0.224, 0.298, 0.337);
      if (i == 2) return vec3(0.357, 0.263, 0.557);
      if (i == 3) return vec3(0.275, 0.365, 0.647);
      return vec3(0.396, 0.275, 0.329);
    }
    void main() {
      vec2 uv = gl_FragCoord.xy / size;
      vec2 aspect = vec2(size.x / size.y, 1.0);
      // Gentle domain warp keeps each blob's edge irregular instead of circular.
      vec2 warped = uv + 0.035 * vec2(sin(uv.y * 7.0 + time * 0.31), cos(uv.x * 6.0 - time * 0.27));
      vec3 color = vec3(0.0); float weight = 0.0;
      for (int i = 0; i < 5; i++) {
        float f = float(i);
        vec2 center = vec2(0.5 + 0.32 * sin(time * (0.050 + f * 0.011) + f * 1.7),
                           0.5 + 0.36 * cos(time * (0.041 + f * 0.009) + f * 2.3));
        center += (pointer - center) * pull * (0.10 + 0.03 * f);
        float radius = 0.20 + 0.05 * sin(time * 0.13 + f * 4.1);
        vec2 d = (warped - center) * aspect;
        float field = exp(-dot(d, d) / (radius * radius * (0.35 + blur * 1.6)));
        color += tint(i) * field; weight += field;
      }
      vec3 blobs = color / max(weight, 1e-4);
      gl_FragColor = vec4(mix(base, blobs, smoothstep(0.0, 0.9, weight)), 1.0);
    }`;
  const compile = (type, source) => {
    const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
  };
  const program = gl.createProgram();
  const shaders = [compile(gl.VERTEX_SHADER, vertex), compile(gl.FRAGMENT_SHADER, fragment)];
  if (shaders.includes(null)) return;
  shaders.forEach(shader => gl.attachShader(program, shader));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const uniform = Object.fromEntries(['size', 'time', 'pointer', 'pull', 'blur'].map(name => [name, gl.getUniformLocation(program, name)]));
  document.documentElement.classList.add('rail-shader-ready');

  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const target = {x: 0.5, y: 0.5, pull: 0}, current = {x: 0.5, y: 0.5, pull: 0};
  addEventListener('pointermove', event => {
    const box = canvas.getBoundingClientRect();
    const inside = event.clientX >= box.left && event.clientX <= box.right;
    target.x = (event.clientX - box.left) / box.width;
    target.y = 1 - (event.clientY - box.top) / box.height;
    target.pull = inside ? 1 : 0;
  }, {passive: true});
  document.documentElement.addEventListener('pointerleave', () => { target.pull = 0; });

  let frame = 0;
  const draw = now => {
    frame = 0;
    if (!canvas.getClientRects().length || document.hidden) return;
    // Half resolution is enough for a blurred field and keeps the GPU cost low.
    const scale = Math.min(devicePixelRatio || 1, 2) / 2;
    const width = Math.round(canvas.clientWidth * scale), height = Math.round(canvas.clientHeight * scale);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; gl.viewport(0, 0, width, height); }
    for (const key of ['x', 'y', 'pull']) current[key] += (target[key] - current[key]) * 0.04;
    const blur = parseFloat(getComputedStyle(canvas).getPropertyValue('--rail-blur')) || 0;
    gl.uniform2f(uniform.size, width, height);
    gl.uniform1f(uniform.time, still.matches ? 12 : now / 1000);
    gl.uniform2f(uniform.pointer, current.x, current.y);
    gl.uniform1f(uniform.pull, still.matches ? 0 : current.pull);
    gl.uniform1f(uniform.blur, Math.min(Math.max(blur, 0), 1));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!still.matches) frame = requestAnimationFrame(draw);
  };
  const start = () => { if (!frame) frame = requestAnimationFrame(draw); };
  // Restart when the home list, window size, theme, or visibility changes the rail.
  new MutationObserver(start).observe(document.body, {subtree: true, attributes: true, attributeFilter: ['hidden']});
  addEventListener('resize', start);
  document.addEventListener('visibilitychange', start);
  still.addEventListener('change', start);
  start();
})();
