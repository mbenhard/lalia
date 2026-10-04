import type { Variant } from '../core/variant.js'
import { aurora } from './aurora.js'
import { glass, glassFrosted } from './glass.js'
import { createLumen, lumen, lumenDuo, lumenEclipse, lumenRipple, type LumenStyle } from './lumen.js'
import { createMist, mist, mistDissolve, mistHaze, mistRadial, mistSphere, mistWisp, type MistEdge } from './mist.js'
import { createNebula, nebula, nebulaCore, nebulaGalaxy, nebulaSmoke, type NebulaStyle } from './nebula.js'
import { silk, silkMinimal, silkSimple, silkVivid } from './silk.js'
import {
  createSwarm, swarm, swarmAtom, swarmOrbit, swarmRings, swarmSaturn, swarmSphere,
  type RingSpec, type SwarmOptions, type SwarmShape,
} from './swarm.js'

export {
  aurora,
  createLumen, lumen, lumenDuo, lumenEclipse, lumenRipple,
  createMist, mist, mistDissolve, mistHaze, mistRadial, mistSphere, mistWisp,
  createNebula, nebula, nebulaCore, nebulaGalaxy, nebulaSmoke,
  glass, glassFrosted,
  silk, silkMinimal, silkSimple, silkVivid,
  createSwarm, swarm, swarmAtom, swarmOrbit, swarmRings, swarmSaturn, swarmSphere,
  type LumenStyle, type MistEdge, type NebulaStyle, type RingSpec, type SwarmOptions, type SwarmShape,
}

/** Every design, grouped by family. The first entry of each family is its default. */
export const families = {
  mist: [mist, mistDissolve, mistWisp, mistHaze, mistRadial, mistSphere],
  silk: [silk, silkSimple, silkMinimal, silkVivid],
  glass: [glass, glassFrosted],
  swarm: [swarm, swarmSphere, swarmRings, swarmAtom, swarmSaturn, swarmOrbit],
  nebula: [nebula, nebulaCore, nebulaGalaxy, nebulaSmoke],
  lumen: [lumen, lumenEclipse, lumenRipple, lumenDuo],
  aurora: [aurora],
} as const
export type FamilyName = keyof typeof families

export const variants = Object.fromEntries(
  Object.values(families).flat().map((v) => [v.name, v]),
) as Record<string, Variant>
