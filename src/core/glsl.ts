/**
 * Shared GLSL. Variants work entirely in OKLab: palette colors arrive as OKLab,
 * mixing them with `mix()` is perceptually even, `.x` is lightness and `.yz`
 * is chroma. `orbColor()` converts to sRGB at the very end.
 */

export const UNIFORMS = /* glsl */ `
uniform vec2 uResolution;
uniform float uTime;
uniform float uPhase;
uniform float uSpin;
uniform float uLight;
uniform float uOnset;
uniform float uEnergy;
uniform float uScale;
uniform float uTurbulence;
uniform float uSwirl;
uniform float uGlow;
uniform float uSaturation;
uniform float uPulse;
uniform float uInput;
uniform float uOutput;
uniform vec4 uAudio;
uniform vec3 uColors[4];
`

// Simplex noise by Ian McEwan and Ashima Arts (MIT): github.com/ashima/webgl-noise
export const NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  vec3 ns = 0.142857142857 * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float fbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * snoise(p);
    p = p * 2.02 + 17.0;
    amp *= 0.5;
  }
  return sum;
}

// Two octaves: broad, soft structure.
float fbm2(vec3 p) {
  return 0.65 * snoise(p) + 0.35 * snoise(p * 2.03 + 17.0);
}

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

// Cyclic walk through the four palette colors.
vec3 palette(float t) {
  t = fract(t) * 4.0;
  int a = int(t);
  return mix(uColors[a], uColors[(a + 1) % 4], smoothstep(0.0, 1.0, fract(t)));
}
`

export const OUTPUT = /* glsl */ `
out vec4 fragColor;

// Orb space: origin at the center, radius 1 touches the shorter canvas edge.
vec2 orbUV() {
  return (gl_FragCoord.xy - 0.5 * uResolution) / (0.5 * min(uResolution.x, uResolution.y));
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Film grain in [-0.5, 0.5], re-rolled at 24 fps so it reads as film, not static.
float grain() {
  return hash12(gl_FragCoord.xy + mod(floor(uTime * 24.0), 64.0) * 17.31) - 0.5;
}

vec3 oklabToLinear(vec3 c) {
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.291485548 * c.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
   -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
   -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
}

// A glow is emitted light on dark pages; on light pages it becomes a deeper, tinted haze.
vec3 glowTone(vec3 lab) {
  return mix(lab, vec3(lab.x - 0.12, lab.yz * 1.5), uLight);
}

float glowAlpha(float a) {
  return a * (1.0 - 0.35 * uLight);
}

vec4 orbColor(vec3 lab, float alpha) {
  // Pastels lose contrast against white, so light pages get slightly deeper, richer color.
  // The boost tapers off for colors that are already vivid, which would otherwise leave sRGB
  // and clip per channel, skewing hue (orange turns red, lime turns yellow).
  float vivid = smoothstep(0.06, 0.18, length(lab.yz));
  lab = vec3(lab.x - 0.05 * uLight, lab.yz * (1.0 + 0.3 * uLight * (1.0 - vivid)) * uSaturation);
  vec3 rgb = pow(clamp(oklabToLinear(lab), 0.0, 1.0), vec3(1.0 / 2.2));
  // Dither hides 8-bit banding in soft gradients.
  rgb = clamp(rgb + grain() / 255.0, 0.0, 1.0);
  alpha = clamp(alpha * smoothstep(1.0, 0.75, length(orbUV())), 0.0, 1.0);
  return vec4(rgb * alpha, alpha);
}
`

export const VERTEX_PRELUDE = `#version 300 es
precision highp float;
${UNIFORMS}
${NOISE}
`

export const FRAGMENT_PRELUDE = `#version 300 es
precision highp float;
${UNIFORMS}
${NOISE}
${OUTPUT}
`

export const FULLSCREEN_VERTEX = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4.0 - 1.0;
  gl_Position = vec4(p, 0.0, 1.0);
}
`
