import { luminance, parseColor } from './color.js'

/**
 * `dark`: the orb is a light source; glows add light.
 * `light`: the orb is ink; glows become tinted haze and colors deepen.
 * `auto`: follows the actual background behind the canvas.
 */
export type Appearance = 'auto' | 'light' | 'dark'

/** 0 for a dark background, 1 for a light one, read from the nearest opaque ancestor. */
export function detectLightness(el: Element): number {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const color = parseColor(getComputedStyle(node).backgroundColor)
    if (color[3] > 0.5) return luminance(color) > 0.18 ? 1 : 0
  }
  // No background anywhere means the browser default canvas color.
  const scheme = getComputedStyle(document.documentElement).colorScheme
  const dark = scheme.includes('dark') && matchMedia('(prefers-color-scheme: dark)').matches
  return dark ? 0 : 1
}
