# speaking-orb

Fluid, audio-reactive orbs for voice agents. Zero dependencies, raw WebGL2, about 1 KB of shader per design.

```tsx
import { Orb } from 'speaking-orb/react'
import { mist } from 'speaking-orb/variants'

<Orb variant={mist} state="speaking" output={agentAudio} input={micAudio} size={240} />
```

## Designs

| Family | Variations |
| --- | --- |
| Mist | `mist` · `mistWisp` · `mistHaze` · `mistSphere` · `mistSmoke` |
| Silk | `silk` · `silkSimple` |
| Glass | `glass` · `glassFrosted` · `glassPrism` |
| Swarm | `swarm` · `swarmSphere` · `swarmRings` · `swarmSaturn` · `swarmOrbit` |
| Nebula | `nebula` · `nebulaCore` |
| Lumen | `lumen` · `lumenDuo` |
| Dots | `dots` · `dotsGrille` · `dotsMatrix` |

`families` groups them (first entry is the family default) and `variants` maps names like `'mist-wisp'` to designs. Each design takes up to four colors (any CSS color) via the factories:

```ts
createMist('wisp', ['#9be7ff', '#6f8bff', '#c29bff', '#ffffff']) // 'soft' | 'wisp' | 'haze' | 'sphere' | 'smoke'
createNebula('core', colors)  // 'cloud' | 'core'
createLumen('duo', colors)    // 'pearl' | 'duo'
createDots('grille', colors)  // 'hex' | 'grille' | 'matrix'
createSwarm({
  shape: 'rings',             // 'cloud' | 'sphere' | 'rings'
  count: 8000,
  core: 0.5,                  // optional particle planet inside the rings
  rings: [
    { tilt: 0.5, turn: 0.35, radius: 0.9, wander: 0.3 }, // wander: how far the ring's plane drifts
    { tilt: 0.5, turn: 0.35, radius: 1.1, wander: 0.3 },
  ],
  poses: {                    // optional per-state layouts; rings glide between them
    listening: [{ tilt: 1.3, turn: 0, radius: 0.8 }, { tilt: 1.3, turn: 0, radius: 1.1 }],
  },
})
```

## Colors

Pass a `scheme` and every design wears it the way it was meant to. A scheme defines seven roles, brightest to darkest: `highlight`, `tint`, `primary`, `secondary`, `accent`, `deep`, `ink`. Each design maps the roles it needs onto its own color slots, so the same scheme gives Lumen its pale glow and Swarm its deep particles.

```tsx
import { schemes, sage } from 'speaking-orb/schemes'

<Orb variant={mist} scheme={sage} … />
<Orb variant={mistSmoke} scheme={schemes.nocturne} … />
```

Curated schemes, grouped in `schemeGroups`:

| Group | Schemes |
| --- | --- |
| Neutral | `graphite` · `pearl` · `linen` · `glacier` |
| Hue | `cobalt` · `iris` · `orchid` · `rose` · `coral` · `ember` · `honey` · `citrus` · `sage` · `jade` · `lagoon` |
| Atmosphere | `dusk` · `dawn` · `borealis` · `nocturne` · `abyss` · `opal` · `cosmic` |

All schemes share one lightness ladder, so switching schemes never makes an orb heavier or lighter. Each scheme also carries light-page versions of its pale roles, and the orb blends between the two sets as the page changes.

Build a scheme from a brand color. The hue is kept exactly; lightness and chroma are fitted to the orb:

```ts
import { createScheme } from 'speaking-orb/schemes'

const brand = createScheme('#ff5a1f', { harmony: 'complementary' }) // 'analogous' | 'complementary' | 'split' | 'triadic'
const quiet = createScheme('#ff5a1f', { vibrance: 0.4 })            // 0 is nearly grey, 1 is as vivid as sRGB allows
```

`colors` still works and takes precedence: up to four CSS colors, used as-is for the design's slots. Custom designs declare which role each slot plays with `roles`, for example `roles: ['deep', 'primary', 'highlight', 'ink']`.

## Light and dark pages

On dark pages an orb is a light source; on light pages it behaves like ink, with tinted haze instead of glow and deeper color. By default (`appearance="auto"`) it reads the background behind the canvas and eases between the two when your theme changes. Force either with `appearance="light"` or `"dark"`.

## States

`idle` · `connecting` · `listening` · `thinking` · `speaking` · `muted`

Every state is a set of motion targets (`energy`, `scale`, `speed`, `turbulence`, `swirl`, `glow`, `saturation`, `pulse`, `input`, `output`). Each one springs toward its target, so switching states is always a glide. Tune per state with `motion`, or tune the spring with `transition`:

```tsx
<Orb motion={{ thinking: { swirl: 1.6 } }} transition={{ stiffness: 40, damping: 10 }} … />
```

## Audio

`input` and `output` take an `AudioSampler`: a function returning a 0–1 level or `{ level, low, mid, high }`. The orb follows the microphone while listening and the agent while speaking.

```ts
import { fromStream, fromNode, createVoiceSimulator } from 'speaking-orb'

fromStream(micStream)       // any MediaStream
fromNode(playbackGain)      // any AudioNode
createVoiceSimulator()      // fake speech for demos
```

## Adapters

```ts
// ElevenLabs
import { elevenLabsAudio, elevenLabsState } from 'speaking-orb/adapters/elevenlabs'
const conversation = useConversation()
const audio = useMemo(() => elevenLabsAudio(conversation), [conversation])
<Orb {...audio} state={elevenLabsState(conversation.status, conversation.isSpeaking)} />

// OpenAI Realtime (WebRTC)
import { openaiRealtimeAudio, openaiRealtimeState } from 'speaking-orb/adapters/openai'
const audio = openaiRealtimeAudio({ microphone, remote })
dc.onmessage = (e) => setState((s) => openaiRealtimeState(JSON.parse(e.data), s))

// Gemini Live
import { geminiLiveAudio, geminiLiveState } from 'speaking-orb/adapters/gemini'
const audio = geminiLiveAudio({ microphone, playback: gainNode })
session.on('message', (m) => setState((s) => geminiLiveState(m, s)))
```

## Without React

```ts
import { OrbEngine } from 'speaking-orb'
import { lumen } from 'speaking-orb/variants'
const orb = new OrbEngine(canvas, { variant: lumen, state: 'idle' })
orb.setState('listening')
orb.destroy() // also releases the WebGL context
```

## Custom designs

```ts
import { shaderVariant } from 'speaking-orb'

export const dot = shaderVariant({
  name: 'dot',
  colors: ['#fff'],
  fragment: `void main() {
    float r = length(orbUV());
    fragColor = orbColor(uColors[0], smoothstep(0.3, 0.29, r * (1.0 - 0.2 * uAudio.x)));
  }`,
})
```
