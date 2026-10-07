import { shaderVariant } from '../core/variant.js'
import type { RoleMap } from '../core/scheme.js'

const fragment = /* glsl */ `
void main() {
  vec2 p = orbUV();
  float r = length(p);
  if (r >= 1.0) { fragColor = vec4(0.0); return; }
  vec2 dir = p / max(r, 1e-4);
  float ang = atan(p.y, p.x);
  float t = uPhase;
  float breathe = 0.5 + 0.5 * sin(t * 1.6);
  float R = 0.5 * uScale
    * (1.0 + 0.04 * breathe + 0.12 * uAudio.x + 0.04 * uAudio.y - 0.1 * orbPulse());

  vec2 s = p / R;
  float z = sqrt(max(1.0 - dot(s, s), 0.0));
  vec3 n = vec3(s, z);
  float rim = pow(1.0 - z, 3.0);
  vec3 L = normalize(vec3(-0.5, 0.6, 0.7));

  vec3 core;
  vec3 aura = mix(uColors[2], uColors[3], 0.5 + 0.5 * sin(ang + uSpin * 1.5));
  float reach = R * (0.16 + 0.14 * uGlow + 0.3 * uAudio.x + 0.06 * breathe * uEnergy);
  float strength = 0.4 + 0.15 * uEnergy;

  // Inner gradient drifts slowly, as if lit from within.
  vec2 flow = s + (0.25 + 0.3 * uTurbulence) * vec2(
    snoise(vec3(s * 0.9, t * 0.3)),
    snoise(vec3(s * 0.9 + 5.0, t * 0.3)));
  flow = rot(uSpin * 0.8) * flow;
  core = mix(uColors[1], uColors[0], smoothstep(-0.9, 0.9, flow.y - 0.4 * flow.x));
  core = mix(core, uColors[2], 0.45 * smoothstep(0.2, 1.3, -flow.y + 0.3 * flow.x));
  // Wrapped key light: a soft terminator that never falls into shadow.
  core.x += (dot(n, L) * 0.5 - 0.1) * 0.16;
  core = vec3(core.x + 0.06 * rim * (1.0 - uLight), core.yz * (1.0 + 0.25 * rim));
  core.x += 0.05 * uAudio.x;

  // The edge melts over a few pixels into a glow that starts at the same tone.
  float soft = 1.5 * orbPx() + 0.02 * R;
  float body = smoothstep(R + soft, R - soft, r);
  float fall = exp(-max(r - R, 0.0) / reach);
  float glow = glowAlpha(min(strength * fall * fall, 1.0));
  fragColor = orbComposite(core, body, glowTone(mix(aura, core, 0.35 * fall)), glow);
}
`

/** A pearl-like core with a slow inner gradient, inside a close, breathing aura. */
export const lumen = shaderVariant({
  name: 'lumen',
  colors: ['#f9e7b3', '#f8c562', '#ed9235', '#ecac9b'],
  // The scheme role behind each color slot, matching how the shader reads it.
  roles: ['tint', 'primary', 'secondary', 'accent'] satisfies RoleMap,
  fragment,
})
