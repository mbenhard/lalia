import type { Variant } from '../core/variant.js'
import { createDots, dots, dotsGrille, dotsMatrix, type DotsStyle } from './dots.js'
import { glass, glassFrosted, glassPrism } from './glass.js'
import { createLumen, lumen, lumenDuo, type LumenStyle } from './lumen.js'
import { createMist, mist, mistHaze, mistSmoke, mistSphere, mistWisp, type MistEdge } from './mist.js'
import { createNebula, nebula, nebulaCore, type NebulaStyle } from './nebula.js'
import { silk, silkSimple } from './silk.js'
import {
  createSwarm, swarm, swarmOrbit, swarmRings, swarmSaturn, swarmSphere,
  type RingSpec, type SwarmOptions, type SwarmShape,
} from './swarm.js'

export {
  createDots, dots, dotsGrille, dotsMatrix,
  createLumen, lumen, lumenDuo,
  createMist, mist, mistHaze, mistSmoke, mistSphere, mistWisp,
  createNebula, nebula, nebulaCore,
  glass, glassFrosted, glassPrism,
  silk, silkSimple,
  createSwarm, swarm, swarmOrbit, swarmRings, swarmSaturn, swarmSphere,
  type DotsStyle, type LumenStyle, type MistEdge, type NebulaStyle, type RingSpec, type SwarmOptions, type SwarmShape,
}

/** Every design, grouped by family. The first entry of each family is its default. */
export const families = {
  mist: [mist, mistWisp, mistHaze, mistSphere, mistSmoke],
  silk: [silk, silkSimple],
  glass: [glass, glassFrosted, glassPrism],
  swarm: [swarm, swarmSphere, swarmRings, swarmSaturn, swarmOrbit],
  nebula: [nebula, nebulaCore],
  lumen: [lumen, lumenDuo],
  dots: [dots, dotsGrille, dotsMatrix],
  // TEMPORARY: Dots voice-effect trials, removed once one is picked.
  trial: (['hex', 'grille', 'matrix'] as const).flatMap((style) =>
    (['eq', 'wave', 'sparkle'] as const).map((voice) => createDots(style, undefined, voice))),
} as const satisfies Record<string, readonly Variant[]>
export type FamilyName = keyof typeof families

export const variants = Object.fromEntries(
  Object.values(families).flat().map((v) => [v.name, v]),
) as Record<string, Variant>
