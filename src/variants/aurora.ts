import { shaderVariant } from '../core/variant.js'

/** Swaying curtains of northern light, seen through a soft round window. */
export const aurora = shaderVariant({
  name: 'aurora',
  colors: ['#5ff0c0', '#5fb4ff', '#b48cff', '#ffd6f0'],
  fragment: /* glsl */ `
void main() {
  vec2 p = orbUV();
  float r = length(p);
  float pulse = uPulse * (0.5 + 0.5 * sin(uTime * 3.0));
  float R = 0.52 * uScale * (1.0 + 0.06 * uAudio.x - 0.06 * pulse);
  vec2 q = p / R;
  float t = uPhase + uSpin * 0.6;

  vec3 acc = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x = q.x * (0.9 + 0.3 * fi) + fi * 1.7;
    // Each curtain's lower hem sways; speech sends a ripple along it.
    float sway = snoise(vec3(x * 0.55, fi * 3.1, t * 0.35)) * (0.35 + 0.3 * uTurbulence)
      + 0.25 * uAudio.y * sin(x * 3.0 - uPhase * 5.0);
    float hem = -0.35 + 0.3 * (fi - 1.0) + 0.45 * sway;
    float h = q.y - hem;
    // Vertical rays depend only on x, so they read as hanging folds.
    float rays = 0.55 + 0.45 * snoise(vec3(x * 4.0, fi * 5.0, t * 0.6));
    float curtain = smoothstep(-0.03, 0.06, h) * exp(-max(h, 0.0) * (2.4 - 1.0 * uAudio.x - 0.6 * uEnergy)) * rays;
    vec3 c = mix(uColors[i], uColors[3], 0.6 * smoothstep(0.1, 1.0, h));
    acc += c * curtain;
    total += curtain;
  }

  vec3 col = acc / max(total, 1e-4);
  col.x += 0.08 * uAudio.x + 0.04 * grain();
  float window = smoothstep(1.2, 0.45, r / R);
  float alpha = clamp(total * (0.75 + 0.3 * uGlow), 0.0, 1.0) * window;
  fragColor = orbColor(mix(glowTone(col), col, smoothstep(0.0, 0.5, alpha)), alpha);
}
`,
})
