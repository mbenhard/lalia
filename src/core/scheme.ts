import { toOklab } from './color.js'

/**
 * What a color does in an orb, brightest to darkest. Every scheme fills all seven roles and
 * every design picks the four it needs, so any scheme reads as intended on any design.
 *
 * - `highlight` hot cores, speculars, sparkles: nearly white, leaning warm
 * - `tint`      softly lit areas and pale washes
 * - `primary`   the body: the color people will remember
 * - `secondary` the gradient partner: a little deeper, a little cooler
 * - `accent`    a sparse counterpoint; never the majority of the orb
 * - `deep`      shadow, back faces, depth
 * - `ink`       near-black, for silhouettes and dark linework
 */
export type ColorRole = 'highlight' | 'tint' | 'primary' | 'secondary' | 'accent' | 'deep' | 'ink'

export type SchemeColors = Record<ColorRole, string>

export interface ColorScheme {
  name: string
  /** Mood, and where the scheme fits. */
  description?: string
  /** Roles on dark pages, where the orb is a light source. */
  colors: SchemeColors
  /** Roles that change on light pages, where the orb reads like pigment. */
  light?: Partial<SchemeColors>
}

/** Which role feeds each of a design's four color slots. */
export type RoleMap = readonly [ColorRole, ColorRole, ColorRole, ColorRole]

export const DEFAULT_ROLES: RoleMap = ['primary', 'secondary', 'accent', 'highlight']

/** A design's four slot colors for a scheme, on a dark or a light page. */
export function schemeColors(scheme: ColorScheme, roles: RoleMap = DEFAULT_ROLES, page: 'dark' | 'light' = 'dark') {
  const set = page === 'light' ? { ...scheme.colors, ...scheme.light } : scheme.colors
  return roles.map((role) => set[role])
}

// ---------------------------------------------------------------------------------------------
// OKLCH

type RGB = [number, number, number]

function oklabToLinear(L: number, a: number, b: number): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

const rad = (h: number) => (h * Math.PI) / 180
const lchToLinear = (L: number, C: number, H: number) => oklabToLinear(L, C * Math.cos(rad(H)), C * Math.sin(rad(H)))
const inGamut = (rgb: RGB) => rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4)

/** The most chroma sRGB can show at this lightness and hue. */
export function maxChroma(L: number, H: number) {
  let lo = 0
  let hi = 0.4
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2
    if (inGamut(lchToLinear(L, mid, H))) lo = mid
    else hi = mid
  }
  return lo
}

const encode = (c: number) => {
  const v = Math.min(Math.max(c, 0), 1)
  const s = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
  return Math.round(s * 255).toString(16).padStart(2, '0')
}

/**
 * An OKLCH color as hex. Chroma beyond sRGB is reduced at constant lightness and hue instead
 * of being clipped per channel, which would skew the hue (blues drift purple, yellows go green).
 */
export function oklch(L: number, C: number, H: number) {
  const chroma = Math.min(C, maxChroma(L, H))
  return `#${lchToLinear(L, chroma, H).map(encode).join('')}`
}

export function toOklch(color: string): [L: number, C: number, H: number] {
  const [L, a, b] = toOklab(color)
  return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360]
}

// ---------------------------------------------------------------------------------------------
// Generator

export type Harmony = 'analogous' | 'complementary' | 'split' | 'triadic'

export interface SchemeOptions {
  name?: string
  /** How the accent relates to the base hue. Default `analogous`, the calmest. */
  harmony?: Harmony
  /** 0 is nearly grey, 1 is as vivid as sRGB allows. Default: taken from the input color. */
  vibrance?: number
}

// Painter's rule: light leans toward sunlight, shade toward sky. Shifting hue along the
// lightness ramp is what makes a gradient feel lit instead of merely darker.
const SUNLIGHT = 85
const SKY = 275

/** Rotates hue `h` along the shorter arc toward `target`, by a fraction capped at `cap` degrees. */
function toward(h: number, target: number, amount: number, cap: number) {
  const delta = ((target - h + 540) % 360) - 180
  const step = Math.sign(delta) * Math.min(Math.abs(delta) * amount, cap)
  return (h + step + 360) % 360
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/**
 * Builds a full scheme from one color, usually a brand color. The input hue is kept exactly;
 * lightness is lifted into the range where an orb reads as a light source, and the other
 * roles follow the same rules as the curated schemes.
 */
export function createScheme(color: string, options: SchemeOptions = {}): ColorScheme {
  const [L0, C0, H0raw] = toOklch(color)
  const neutral = C0 < 0.02
  const H0 = C0 < 0.005 ? 250 : H0raw
  // Fullness relative to sRGB, capped by absolute chroma: a pastel is near the gamut edge at its
  // own lightness, but its owner wants a soft orb, not the vivid color at the orb's lightness.
  const full = Math.min(C0 / Math.max(maxChroma(L0, H0), 1e-3), C0 / 0.15)
  const v = clamp(options.vibrance ?? (neutral ? 0.08 : full), 0, 1)
  // Chroma as a share of what sRGB allows at that spot, so every role is equally "full".
  const tone = (L: number, H: number, share: number) => oklch(L, maxChroma(L, H) * clamp(share, 0, 1), H)

  const Lp = clamp(L0, 0.64, 0.84)
  let Hs = toward(H0, SKY, 0.2, 20)
  // A hue already at the sky has nowhere cooler to go, so it turns toward magenta instead.
  if (Math.abs(((Hs - H0 + 540) % 360) - 180) < 8) Hs = (H0 + 20) % 360
  const turn = Math.sign(((Hs - H0 + 540) % 360) - 180) || 1
  const Hd = toward(H0, SKY, 0.3, 25)
  const harmony = options.harmony ?? 'analogous'
  const accentHue = ({
    analogous: H0 - turn * 45,
    complementary: H0 + 180,
    split: H0 + 180 - turn * 30,
    triadic: H0 + 120 * -turn,
  }[harmony] + 360) % 360
  // A counterpoint, not a rival: in absolute chroma it stays below the primary, otherwise
  // hues with a deep gamut (yellow, cyan) take over the orb.
  const primaryChroma = maxChroma(Lp, H0) * v
  const accent = neutral
    ? tone(0.8, accentHue, v * 2)
    : oklch(0.8, primaryChroma * (harmony === 'analogous' ? 0.7 : 0.85), accentHue)

  return {
    name: options.name ?? 'custom',
    colors: {
      highlight: tone(0.975, toward(H0, SUNLIGHT, 0.35, 35), Math.min(v, 0.5)),
      tint: tone(0.9, toward(H0, SUNLIGHT, 0.15, 15), v * 0.55),
      primary: tone(Lp, H0, v),
      secondary: tone(Lp - 0.1, Hs, v * 1.08),
      accent,
      deep: tone(0.47, Hd, v),
      ink: tone(0.23, Hd, v * 0.35),
    },
  }
}
