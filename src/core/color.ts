export type OKLab = [L: number, a: number, b: number]
type RGBA = [r: number, g: number, b: number, a: number]

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

let rasterizer: CanvasRenderingContext2D | null = null

function parseHex(color: string): RGBA | null {
  const m = /^#([0-9a-f]{3,8})$/i.exec(color)
  if (!m) return null
  let h = m[1]
  if (h.length <= 4) h = [...h].map((c) => c + c).join('')
  const [r, g, b, a = 255] = [0, 2, 4, 6].map((i) => (i < h.length ? parseInt(h.slice(i, i + 2), 16) : undefined))
  return [r! / 255, g! / 255, b! / 255, a / 255]
}

/** `rgb()`/`rgba()`, which is what getComputedStyle returns for most colors. */
function parseRgb(color: string): RGBA | null {
  const m = /^rgba?\(([^)]+)\)$/.exec(color)
  if (!m) return null
  const [r = 0, g = 0, b = 0, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
  return [r / 255, g / 255, b / 255, a]
}

/** Any other CSS color the browser understands, flattened to sRGB by drawing one pixel. */
function rasterize(color: string): RGBA {
  // On a server there is no canvas to ask (hex and rgb() are parsed without one).
  if (typeof document === 'undefined') return [0, 0, 0, 1]
  if (!rasterizer) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    rasterizer = canvas.getContext('2d', { willReadFrequently: true })
  }
  if (!rasterizer) return [0, 0, 0, 0]
  rasterizer.clearRect(0, 0, 1, 1)
  // Reset first: an invalid color is ignored and would otherwise repeat the previous one.
  rasterizer.fillStyle = '#0000'
  rasterizer.fillStyle = color
  rasterizer.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = rasterizer.getImageData(0, 0, 1, 1).data
  return [r / 255, g / 255, b / 255, a / 255]
}

export function parseColor(color: string): RGBA {
  const c = color.trim()
  return parseHex(c) ?? parseRgb(c) ?? rasterize(c)
}

/** WCAG relative luminance, 0–1. */
export function luminance([r, g, b]: RGBA): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

export function toOklab(color: string): OKLab {
  const [r, g, b] = parseColor(color).slice(0, 3).map(toLinear) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

export const PALETTE_SIZE = 4

/** Writes a palette as 4 OKLab triplets, repeating colors when fewer are given. */
export function writePalette(colors: readonly string[], out: Float32Array) {
  if (colors.length === 0) return
  for (let i = 0; i < PALETTE_SIZE; i++) out.set(toOklab(colors[i % colors.length]), i * 3)
}
