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
| Mist | `mist` · `mistDissolve` · `mistWisp` · `mistHaze` · `mistRadial` · `mistSphere` |
| Silk | `silk` · `silkSimple` · `silkMinimal` · `silkVivid` |
| Glass | `glass` · `glassFrosted` |
| Swarm | `swarm` · `swarmSphere` · `swarmRings` · `swarmAtom` · `swarmSaturn` · `swarmOrbit` |
| Nebula | `nebula` · `nebulaCore` · `nebulaGalaxy` · `nebulaSmoke` |
| Lumen | `lumen` · `lumenEclipse` · `lumenRipple` · `lumenDuo` |
| Aurora | `aurora` |

`families` groups them (first entry is the family default) and `variants` maps names like `'mist-wisp'` to designs. Each design takes up to four colors (any CSS color) via the factories:

```ts
createMist('wisp', ['#9be7ff', '#6f8bff', '#c29bff', '#ffffff'])
createNebula('galaxy', colors) // 'cloud' | 'core' | 'galaxy' | 'smoke'
createLumen('eclipse', colors) // 'pearl' | 'eclipse' | 'ripple' | 'duo'
createSwarm({
  shape: 'rings',              // 'cloud' | 'sphere' | 'rings'
  count: 8000,
  core: 0.5,                   // optional particle planet inside the rings
  precess: 1,                  // ring planes slowly wander
  rings: [{ tilt: 0.5, turn: 0.35, radius: 0.9 }, { tilt: 0.5, turn: 0.35, radius: 1.1 }],
})
```

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
