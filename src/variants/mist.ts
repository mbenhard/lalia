import type { RoleMap } from '../core/scheme.js'
import { shaderVariant } from '../core/variant.js'
import { volume } from './volume.js'

/**
 * How the cloud meets the page.
 * - `soft`   smooth falloff with a trace of grain
 * - `wisp`   tendrils peel off and drift outward like smoke
 * - `haze`   a dense heart with a long, breath-like tail
 * - `sphere` held inside a glass ball
 * - `smoke`  a slow fog volume lit from above, with real depth
 */
export type MistEdge = 'soft' | 'wisp' | 'haze' | 'sphere' | 'smoke'

const EDGES: Record<Exclude<MistEdge, 'smoke'>, number> = { soft: 0, wisp: 1, haze: 2, sphere: 3 }

const SMOKE = /* glsl */ `
float medium(vec3 pos, out vec3 c) {
  float core = 1.0 - length(pos);
  float t = uPhase;

  vec3 q = pos;
  q.xz = rot(uSpin * 0.6 + t * 0.15) * q.xz;
  q.xy = rot(0.3) * q.xy;
  q += 0.35 * vec3(
    snoise(q * 0.9 + vec3(0.0, t * 0.15, 0.0)),
    snoise(q * 0.9 + vec3(7.0, 0.0, t * 0.15)),
    snoise(q * 0.9 + vec3(t * 0.15, 13.0, 0.0)));
  float n = fbm2(q * (0.9 + 0.3 * uTurbulence) + vec3(0.0, t * 0.12, 0.0));
  c = palette(0.15 * n + 0.3 * (1.0 - core) + t * 0.015);
  c = vec3(c.x + 0.16 * pos.y + 0.12 * core * (0.5 + uAudio.x), c.yz * 0.85);
  return 0.7 * smoothstep(-0.2, 0.8, 0.5 * n + core * (1.3 + 0.5 * uAudio.y) - 0.15) * smoothstep(0.0, 0.4, core);
}
`
const SMOKE_COLORS = ['#c9b8ff', '#9fb6ff', '#ffc4dc', '#f6f0ff']
const SMOKE_ROLES: RoleMap = ['tint', 'primary', 'accent', 'highlight']

const fragment = (edge: Exclude<MistEdge, 'smoke'>) => /* glsl */ `
const int EDGE = ${EDGES[edge]};
const int SOFT = 0, WISP = 1, HAZE = 2, SPHERE = 3;

vec3 cloud(vec2 q, vec2 s, float detail, out float f) {
  float t = uPhase;
  vec3 sp = vec3(q * 0.9, t * 0.3);
  vec2 w = vec2(fbm2(sp), fbm2(sp + vec3(5.2, 1.3, 2.7)));
  float warp = (0.6 + 0.8 * uTurbulence + 0.8 * uAudio.z) * detail;
  f = fbm(vec3(q + w * warp, t * 0.22 + 3.0));
  float g = fbm2(vec3(q * 1.5 - w * 0.6, t * 0.37 + 7.0));
  vec3 col = mix(uColors[0], uColors[1], smoothstep(-0.7, 0.8, f));
  col = mix(col, uColors[2], 0.8 * smoothstep(-0.45, 0.9, g));
  float lit = dot(s, normalize(vec2(-0.55, 0.8))) + 0.5 * f;
  col = mix(col, uColors[3], 0.65 * smoothstep(0.25, 1.1, lit));
  col.x += 0.06 * uEnergy * f + 0.08 * uAudio.x;
  return col;
}

void main() {
  vec2 p = orbUV();
  float r = length(p);
  vec2 dir = p / max(r, 1e-4);
  float px = 2.0 / min(uResolution.x, uResolution.y);
  float t = uPhase;
  float pulse = uPulse * (0.5 + 0.5 * sin(uTime * 3.0));
  float R = (EDGE == SPHERE ? 0.56 : 0.48) * uScale
    * (1.0 + (EDGE == SPHERE ? 0.07 : 0.14) * uAudio.y + 0.06 * uAudio.x - 0.06 * pulse);

  vec2 s = p / R;
  float z = sqrt(max(1.0 - dot(s, s), 0.0));
  // Inside the ball, the cloud is wrapped onto a sphere so it reads as depth.
  vec2 base = EDGE == SPHERE ? s * R / (0.65 + 0.35 * z) : p;
  // Loose cloud: detail fades toward the rim, which reads like a blur.
  float detail = EDGE == SPHERE ? 1.0 : mix(1.0, 0.5, smoothstep(0.3 * R, 1.15 * R, r));
  mat2 swirl = rot(uSpin * 0.5 + uSwirl * 1.8 * (1.0 - smoothstep(0.0, R, r)));

  float f;
  vec3 col = cloud(swirl * base, s, detail, f);

  float n = grain();
  float rim = snoise(vec3(dir * 1.1, t * 0.45));
  float edge = R * (1.0 + (0.04 + 0.08 * uTurbulence + 0.12 * uAudio.y) * rim + 0.08 * f);
  float alpha;

  if (EDGE == SPHERE) {
    float fresnel = pow(1.0 - z, 2.0);
    // Fog gathers against the glass, so the rim reads misty and bright.
    col = mix(col, uColors[3], 0.45 * fresnel);
    vec2 h = rot(0.6) * (s - vec2(-0.32, 0.4));
    h *= vec2(2.4, 5.0);
    col.x += 0.12 * exp(-dot(h, h)) + 0.06 * n;
    col.x += mix(0.05, -0.08, uLight) * smoothstep(0.8, 1.0, 1.0 - z);
    float d = r - R;
    float body = smoothstep(px, -px, d);
    float glow = glowAlpha(0.3 * uGlow * exp(-max(d, 0.0) * 9.0));
    alpha = body + glow * (1.0 - body);
    col = mix(glowTone(col), col, body / max(alpha, 1e-4));
  } else if (EDGE == WISP) {
    // The boundary is a noise threshold scrolling outward, so tendrils peel away and fade.
    // Low-octave noise and a wide threshold keep tendrils soft rather than shredded.
    // Sampling by position (not angle) avoids starburst spikes; scrolling the third axis
    // against radius makes features drift outward.
    float wn = fbm2(vec3(rot(uSpin * 0.3) * p * 1.7, r * 1.6 - t * 0.4));
    // The noise only shifts the boundary, so the heart stays solid while the rim frays.
    float x = (r - edge) / R;
    float density = smoothstep(0.5, -0.3, x - (0.5 + 0.3 * uTurbulence) * wn);
    density *= density * (3.0 - 2.0 * density) * smoothstep(1.7 * R, 0.8 * R, r);
    col = mix(col, uColors[3], 0.35 * smoothstep(edge, edge + 0.4 * R, r));
    col.x += 0.05 * n * density;
    alpha = density;
    col = mix(glowTone(col), col, smoothstep(0.0, 0.6, density));
  } else if (EDGE == HAZE) {
    float x = max(r - 0.62 * edge, 0.0) / (0.62 * edge);
    alpha = exp(-1.6 * x * x) * (1.0 + 0.12 * n);
    col.x += 0.05 * n * alpha;
    col = mix(glowTone(col), col, smoothstep(0.0, 0.6, alpha));
  } else {
    float soft = 0.16 + 0.1 * uGlow;
    // A trace of grain in the falloff keeps it airy; the rest of the edge stays smooth.
    float body = smoothstep(edge + soft, edge - soft * 0.6, r + n * 0.025);
    body *= body * (3.0 - 2.0 * body);
    float halo = glowAlpha(0.25 * uGlow * exp(-max(r - edge, 0.0) * 5.0));
    col.x += 0.06 * n * body;
    alpha = max(body, halo);
    col = mix(glowTone(col), col, body);
  }

  fragColor = orbColor(col, alpha);
}
`

const COLORS = ['#ffb38a', '#ff7a9c', '#b9a3ff', '#fff1e6']

export function createMist(edge: MistEdge = 'soft', colors?: readonly string[]) {
  const name = edge === 'soft' ? 'mist' : `mist-${edge}`
  if (edge === 'smoke') {
    return shaderVariant({ name, colors: colors ?? SMOKE_COLORS, roles: SMOKE_ROLES, fragment: volume(SMOKE, 1.8) })
  }
  return shaderVariant({ name, colors: colors ?? COLORS, fragment: fragment(edge) })
}

/** A grainy, airy gradient cloud whose edge melts away. */
export const mist = createMist()
export const mistWisp = createMist('wisp')
export const mistHaze = createMist('haze')
/** The same cloud, held inside a glass ball. */
export const mistSphere = createMist('sphere')
/** Fog raymarched through a sphere, so it has real depth rather than a painted gradient. */
export const mistSmoke = createMist('smoke')
