import { shaderVariant } from '../core/variant.js'
import type { RoleMap } from '../core/scheme.js'

/**
 * - `pearl` lit core with a drifting inner gradient
 * - `duo`   two colored lights orbit the sphere
 */
export type LumenStyle = 'pearl' | 'duo'

const STYLES: Record<LumenStyle, number> = { pearl: 0, duo: 1 }

const fragment = (style: LumenStyle) => /* glsl */ `
const int STYLE = ${STYLES[style]};
const int PEARL = 0, DUO = 1;

void main() {
  vec2 p = orbUV();
  float r = length(p);
  vec2 dir = p / max(r, 1e-4);
  float ang = atan(p.y, p.x);
  float px = 2.0 / min(uResolution.x, uResolution.y);
  float t = uPhase;
  float breathe = 0.5 + 0.5 * sin(t * 1.6);
  float pulse = uPulse * (0.5 + 0.5 * sin(uTime * 3.0));
  float R = 0.5 * uScale
    * (1.0 + 0.04 * breathe + 0.12 * uAudio.x + 0.04 * uAudio.y - 0.1 * pulse);

  vec2 s = p / R;
  float z = sqrt(max(1.0 - dot(s, s), 0.0));
  vec3 n = vec3(s, z);
  float rim = pow(1.0 - z, 3.0);
  vec3 L = normalize(vec3(-0.5, 0.6, 0.7));

  vec3 core;
  vec3 aura = mix(uColors[2], uColors[3], 0.5 + 0.5 * sin(ang + uSpin * 1.5));
  float reach = R * (0.16 + 0.14 * uGlow + 0.3 * uAudio.x + 0.06 * breathe * uEnergy);
  float strength = 0.4 + 0.15 * uEnergy;

  if (STYLE == DUO) {
    float a = uSpin * 1.2 + t * 0.6;
    vec3 la = normalize(vec3(cos(a), sin(a) * 0.6, 0.55));
    vec3 lb = vec3(-la.xy, la.z);
    // Wrapped lobes overlap across the middle so the lights blend instead of leaving a dark band.
    float wa = pow(clamp(dot(n, la) * 0.6 + 0.45, 0.0, 1.0), 2.0);
    float wb = pow(clamp(dot(n, lb) * 0.6 + 0.45, 0.0, 1.0), 2.0);
    core = uColors[0];
    core = mix(core, uColors[1], 0.85 * wa);
    core = mix(core, uColors[2], 0.85 * wb);
    core.x -= 0.06 * rim;
    core.x += 0.08 * (wa + wb) * (1.0 + uAudio.x);
    // The aura takes the color of whichever light faces that side.
    float side = dot(dir, normalize(la.xy));
    aura = mix(uColors[2], uColors[1], smoothstep(-0.6, 0.6, side));
  } else {
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
  }
  core.x += 0.05 * uAudio.x;

  // The edge melts over a few pixels into a glow that starts at the same tone.
  float soft = 1.5 * px + 0.02 * R;
  float body = smoothstep(R + soft, R - soft, r);
  float fall = exp(-max(r - R, 0.0) / reach);
  float glow = glowAlpha(min(strength * fall * fall, 1.0));
  aura = glowTone(mix(aura, core, 0.35 * fall));

  float alpha = body + glow * (1.0 - body);
  fragColor = orbColor(mix(aura, core, body / max(alpha, 1e-4)), alpha);
}
`

// The scheme role behind each color slot, matching how the shader reads it.
const ROLES: Record<LumenStyle, RoleMap> = {
  pearl: ['tint', 'primary', 'secondary', 'accent'],
  duo: ['tint', 'primary', 'accent', 'highlight'],
}

export function createLumen(style: LumenStyle = 'pearl', colors?: readonly string[]) {
  const palettes: Record<LumenStyle, readonly string[]> = {
    pearl: ['#ffe3c2', '#ff9a76', '#ff6f91', '#9d8cff'],
    duo: ['#efe6ff', '#ff7a9c', '#5fd4ff', '#ffffff'],
  }
  return shaderVariant({
    name: style === 'pearl' ? 'lumen' : `lumen-${style}`,
    colors: colors ?? palettes[style],
    roles: ROLES[style],
    fragment: fragment(style),
  })
}

/** A pearl-like core with a slow inner gradient, inside a close, breathing aura. */
export const lumen = createLumen()
export const lumenDuo = createLumen('duo')
