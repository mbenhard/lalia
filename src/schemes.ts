import { oklch, type ColorRole, type ColorScheme, type SchemeColors } from './core/scheme.js'

export {
  COLOR_ROLES,
  createScheme,
  DEFAULT_ROLES,
  maxChroma,
  oklch,
  schemeColors,
  toOklch,
  type ColorRole,
  type ColorScheme,
  type Harmony,
  type RoleMap,
  type SchemeColors,
  type SchemeOptions,
} from './core/scheme.js'

type Tone = readonly [L: number, C: number, H: number]

/**
 * Every scheme follows the same ladder, so switching schemes never changes the orb's weight:
 * highlight ≈ .97, tint ≈ .9, primary .7–.88, secondary ~.1 below primary, deep ≈ .45, ink ≈ .22.
 * Hues lean toward sunlight (~85°) as they brighten and toward sky (~275°) as they darken.
 * Light-page overrides keep the same ordering but drop pale roles so they hold up on white.
 */
function scheme(
  name: string,
  description: string,
  tones: Record<ColorRole, Tone>,
  light?: Partial<Record<ColorRole, Tone>>,
): ColorScheme {
  const hex = <T extends Partial<Record<ColorRole, Tone>>>(set: T) =>
    Object.fromEntries(Object.entries(set).map(([role, t]) => [role, oklch(...(t as Tone))])) as {
      [K in keyof T]: string
    }
  return { name, description, colors: hex(tones) as SchemeColors, light: light && hex(light) }
}

// Neutral: brand-agnostic. The orb supports the product instead of decorating it.

export const graphite = scheme(
  'graphite',
  'Cool silver on dark pages, soft graphite on light ones. For products where the orb must never compete with the brand.',
  {
    highlight: [0.985, 0.004, 250], tint: [0.9, 0.008, 250], primary: [0.8, 0.012, 255],
    secondary: [0.66, 0.018, 258], accent: [0.86, 0.03, 225], deep: [0.42, 0.02, 262], ink: [0.22, 0.012, 265],
  },
  {
    highlight: [0.84, 0.006, 250], tint: [0.66, 0.01, 252], primary: [0.5, 0.014, 256],
    secondary: [0.38, 0.018, 260], accent: [0.58, 0.035, 230], deep: [0.28, 0.016, 262], ink: [0.18, 0.01, 265],
  },
)

export const pearl = scheme(
  'pearl',
  'Opal white with a breath of iridescence: blush, cream, lilac and aqua at the edge of perception. Premium and quiet.',
  {
    highlight: [0.99, 0.012, 90], tint: [0.92, 0.03, 20], primary: [0.86, 0.045, 75],
    secondary: [0.78, 0.055, 305], accent: [0.84, 0.06, 200], deep: [0.62, 0.05, 290], ink: [0.3, 0.02, 290],
  },
  {
    highlight: [0.95, 0.015, 90], tint: [0.86, 0.04, 20], primary: [0.8, 0.05, 72],
    secondary: [0.7, 0.06, 305], accent: [0.76, 0.065, 205], deep: [0.54, 0.05, 290],
  },
)

export const linen = scheme(
  'linen',
  'Sand and terracotta with a dried-herb counterpoint. Warm, tactile, editorial: hospitality, lifestyle, wellness.',
  {
    highlight: [0.975, 0.02, 85], tint: [0.9, 0.035, 75], primary: [0.82, 0.055, 68],
    secondary: [0.68, 0.09, 45], accent: [0.8, 0.05, 115], deep: [0.46, 0.06, 40], ink: [0.25, 0.03, 45],
  },
  { tint: [0.85, 0.04, 75], primary: [0.77, 0.06, 65] },
)

export const glacier = scheme(
  'glacier',
  'Ice and cold air. Calm, clinical and trustworthy: health, finance, support desks.',
  {
    highlight: [0.985, 0.01, 215], tint: [0.92, 0.03, 220], primary: [0.84, 0.06, 228],
    secondary: [0.72, 0.08, 245], accent: [0.88, 0.06, 190], deep: [0.5, 0.08, 255], ink: [0.24, 0.03, 255],
  },
  { tint: [0.86, 0.035, 222], primary: [0.77, 0.07, 230], secondary: [0.65, 0.085, 248], accent: [0.8, 0.07, 192] },
)

// Hue: one identity color with analogous depth and a quiet accent. Easy to align with a brand.

export const cobalt = scheme('cobalt', 'Confident, saturated blue that turns sky-cyan in its highlights. Enterprise, productivity.', {
  highlight: [0.975, 0.02, 235], tint: [0.88, 0.06, 248], primary: [0.7, 0.15, 262],
  secondary: [0.58, 0.19, 272], accent: [0.82, 0.1, 220], deep: [0.42, 0.18, 276], ink: [0.22, 0.06, 275],
})

export const iris = scheme('iris', 'Blue-violet with a pink glint: the color people already associate with AI, done gently.', {
  highlight: [0.975, 0.02, 320], tint: [0.89, 0.06, 300], primary: [0.72, 0.15, 292],
  secondary: [0.6, 0.19, 282], accent: [0.8, 0.11, 345], deep: [0.42, 0.17, 282], ink: [0.22, 0.06, 285],
})

export const orchid = scheme('orchid', 'Magenta deepening into violet, peach in the light. Bold and creative.', {
  highlight: [0.975, 0.025, 355], tint: [0.89, 0.07, 335], primary: [0.72, 0.17, 330],
  secondary: [0.6, 0.2, 312], accent: [0.82, 0.09, 20], deep: [0.42, 0.16, 305], ink: [0.22, 0.06, 305],
})

export const rose = scheme('rose', 'Soft rose and blush with a peach accent. Warm, personal, caring: companionship, health.', {
  highlight: [0.975, 0.02, 40], tint: [0.9, 0.05, 10], primary: [0.78, 0.12, 5],
  secondary: [0.66, 0.16, 350], accent: [0.84, 0.08, 55], deep: [0.48, 0.14, 340], ink: [0.24, 0.05, 340],
})

export const coral = scheme('coral', 'Living coral shading into red, apricot in the light. Friendly consumer energy.', {
  highlight: [0.975, 0.025, 75], tint: [0.9, 0.06, 50], primary: [0.76, 0.14, 36],
  secondary: [0.66, 0.17, 22], accent: [0.84, 0.09, 80], deep: [0.48, 0.15, 18], ink: [0.24, 0.05, 20],
})

export const ember = scheme('ember', 'Glowing orange with crimson shadows and gold sparks. Energetic, urgent, alive.', {
  highlight: [0.97, 0.04, 88], tint: [0.9, 0.08, 72], primary: [0.76, 0.16, 55],
  secondary: [0.64, 0.2, 35], accent: [0.86, 0.14, 90], deep: [0.46, 0.17, 25], ink: [0.24, 0.06, 25],
})

export const honey = scheme('honey', 'Amber and marigold with a rosy accent. Optimistic and sunny without shouting.', {
  highlight: [0.98, 0.035, 100], tint: [0.93, 0.07, 92], primary: [0.85, 0.13, 82],
  secondary: [0.74, 0.15, 62], accent: [0.8, 0.08, 35], deep: [0.52, 0.11, 50], ink: [0.26, 0.04, 50],
})

export const citrus = scheme('citrus', 'Lime and leaf with a lemon accent. Fresh, fast, playful.', {
  highlight: [0.98, 0.04, 105], tint: [0.93, 0.09, 115], primary: [0.88, 0.17, 122],
  secondary: [0.78, 0.17, 142], accent: [0.88, 0.14, 95], deep: [0.54, 0.13, 158], ink: [0.26, 0.05, 160],
})

export const sage = scheme('sage', 'Muted herbal green, pale gold in the light. Grounded and restful: wellness, mindfulness.', {
  highlight: [0.975, 0.02, 110], tint: [0.89, 0.04, 140], primary: [0.78, 0.07, 150],
  secondary: [0.66, 0.075, 165], accent: [0.84, 0.06, 95], deep: [0.46, 0.06, 175], ink: [0.24, 0.025, 175],
})

export const jade = scheme('jade', 'Clear emerald cooling into teal. Growth and health, more vivid than sage.', {
  highlight: [0.975, 0.03, 140], tint: [0.9, 0.08, 160], primary: [0.78, 0.15, 162],
  secondary: [0.64, 0.14, 180], accent: [0.86, 0.12, 125], deep: [0.46, 0.1, 195], ink: [0.24, 0.04, 200],
})

export const lagoon = scheme('lagoon', 'Tropical teal over deep blue water, mint where the light hits. Clear and calm.', {
  highlight: [0.98, 0.025, 170], tint: [0.91, 0.06, 185], primary: [0.8, 0.11, 195],
  secondary: [0.66, 0.12, 215], accent: [0.86, 0.13, 160], deep: [0.46, 0.1, 235], ink: [0.24, 0.04, 240],
})

// Atmosphere: multi-hue stories drawn from natural light. The signature, dreamy looks.

export const dusk = scheme('dusk', 'Golden hour: peach into rose, with lavender settling into the shadows.', {
  highlight: [0.975, 0.03, 80], tint: [0.9, 0.06, 60], primary: [0.82, 0.1, 50],
  secondary: [0.7, 0.15, 10], accent: [0.74, 0.12, 300], deep: [0.48, 0.13, 305], ink: [0.24, 0.05, 300],
})

export const dawn = scheme(
  'dawn',
  'First light: pale apricot and blush under a clear sky. Softer and cooler than dusk.',
  {
    highlight: [0.985, 0.02, 90], tint: [0.9, 0.05, 35], primary: [0.84, 0.075, 55],
    secondary: [0.76, 0.09, 355], accent: [0.8, 0.08, 235], deep: [0.6, 0.09, 275], ink: [0.3, 0.04, 275],
  },
  { tint: [0.86, 0.055, 35], primary: [0.78, 0.085, 52], secondary: [0.7, 0.1, 355], accent: [0.74, 0.09, 235] },
)

export const borealis = scheme('borealis', 'Polar night: green curtains over teal, a violet fringe at the top.', {
  highlight: [0.975, 0.035, 165], tint: [0.9, 0.08, 170], primary: [0.84, 0.16, 158],
  secondary: [0.68, 0.12, 215], accent: [0.68, 0.17, 300], deep: [0.42, 0.13, 275], ink: [0.22, 0.05, 270],
})

export const nocturne = scheme('nocturne', 'A city at night: electric indigo with neon-cyan glints. Dark, focused, a little cinematic.', {
  highlight: [0.97, 0.025, 215], tint: [0.84, 0.07, 245], primary: [0.64, 0.17, 272],
  secondary: [0.5, 0.19, 285], accent: [0.84, 0.13, 205], deep: [0.32, 0.13, 280], ink: [0.18, 0.05, 280],
})

export const abyss = scheme('abyss', 'Deep water lit by bioluminescence: navy and blue, cyan-mint where it glows.', {
  highlight: [0.96, 0.05, 185], tint: [0.84, 0.1, 192], primary: [0.66, 0.12, 218],
  secondary: [0.5, 0.11, 245], accent: [0.88, 0.15, 172], deep: [0.32, 0.08, 255], ink: [0.18, 0.04, 255],
})

export const opal = scheme(
  'opal',
  'Iridescent pastels: aqua, lilac and butter shifting like a soap film. Dreamy, light, optimistic.',
  {
    highlight: [0.985, 0.015, 100], tint: [0.9, 0.05, 330], primary: [0.84, 0.085, 200],
    secondary: [0.78, 0.09, 300], accent: [0.86, 0.09, 70], deep: [0.64, 0.1, 280], ink: [0.3, 0.04, 280],
  },
  { tint: [0.84, 0.06, 330], primary: [0.78, 0.09, 200], secondary: [0.72, 0.1, 300], accent: [0.8, 0.1, 70] },
)

export const cosmic = scheme('cosmic', 'A nebula: hot magenta and violet, a cyan star in the folds. The most vivid scheme.', {
  highlight: [0.96, 0.035, 60], tint: [0.84, 0.1, 340], primary: [0.7, 0.2, 335],
  secondary: [0.58, 0.21, 295], accent: [0.8, 0.13, 215], deep: [0.38, 0.17, 285], ink: [0.2, 0.06, 285],
})

/** Curated schemes in display order, grouped by intent. */
export const schemeGroups = {
  neutral: [graphite, pearl, linen, glacier],
  hue: [cobalt, iris, orchid, rose, coral, ember, honey, citrus, sage, jade, lagoon],
  atmosphere: [dusk, dawn, borealis, nocturne, abyss, opal, cosmic],
} as const

export const schemes = Object.fromEntries(
  Object.values(schemeGroups).flat().map((s) => [s.name, s]),
) as Record<string, ColorScheme>
