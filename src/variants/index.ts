import type { Variant } from '../core/variant.js'
import { chrome } from './chrome.js'
import { glass, prism } from './glass.js'
import { lumen } from './lumen.js'
import { cloud, haze, wisp } from './mist.js'
import { satin, silk } from './silk.js'

export { chrome, cloud, glass, haze, lumen, prism, satin, silk, wisp }

const all = { wisp, silk, glass, satin, chrome, haze, cloud, prism, lumen }
export type VariantName = keyof typeof all

/** Every design by name. `variants.wisp` is a Variant; `variants[someString]` may be undefined. */
export const variants: typeof all & Partial<Record<string, Variant>> = all
