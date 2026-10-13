# lalia

The visual layer for voice AI: fluid, audio-reactive orbs for voice agents. Nine designs, zero dependencies, raw WebGL2.

```bash
npm install lalia
```

## Quick start

Make the orb its own small component, then give it your voice session:

```tsx
'use client'

import type { AudioSampler, OrbState } from 'lalia'
import { Orb } from 'lalia/react'
import { wisp } from 'lalia/variants'

export function AgentOrb(live: { state: OrbState; input?: AudioSampler | null; output?: AudioSampler | null }) {
  return <Orb variant={wisp} size={240} {...live} />
}
```

```tsx
import { fromStream } from 'lalia'

<AgentOrb state={state} input={fromStream(micStream)} output={fromStream(agentStream)} />
```

- `state` is what the agent is doing (see [States](#states)).
- `input` is the user's microphone, `output` is the agent's voice (see [Audio](#audio)).
- With only `state`, the orb still breathes and moves; audio makes it react to speech.
- Using Next.js App Router: keep `'use client'` at the top of that file. Designs and audio samplers are functions, so they can't cross from a server component.

## Designs

| Family | Designs |
| --- | --- |
| Mist | `wisp` · `haze` · `cloud` |
| Silk | `silk` · `satin` |
| Glass | `glass` · `prism` |
| Lumen | `lumen` |
| Chrome | `chrome` |

Import them by name from `lalia/variants`. `variants` holds all of them, for picking one by a string: `variants[name]` (undefined for an unknown name).

## Colors

Every design has its own palette. Pass a `scheme` and every design wears it the way it was meant to:

```tsx
import { sage } from 'lalia/schemes'

<Orb variant={wisp} scheme={sage} … />
```

Curated schemes, grouped in `schemeGroups` and keyed by name in `schemes`:

| Group | Schemes |
| --- | --- |
| Neutral | `graphite` · `pearl` · `linen` · `glacier` |
| Hue | `cobalt` · `iris` · `orchid` · `rose` · `coral` · `ember` · `honey` · `citrus` · `sage` · `jade` · `lagoon` |
| Atmosphere | `dusk` · `dawn` · `borealis` · `nocturne` · `abyss` · `opal` · `cosmic` |

All schemes share one lightness ladder, so switching schemes never makes an orb heavier or lighter, and each carries light-page versions of its pale tones.

Brand color? `createScheme` keeps its hue exactly and fits lightness and chroma to the orb:

```ts
import { createScheme } from 'lalia/schemes'

const brand = createScheme('#ff5a1f')                               // hex or rgb() also work on the server
const bold = createScheme('#ff5a1f', { harmony: 'complementary' }) // 'analogous' | 'complementary' | 'split' | 'triadic'
const quiet = createScheme('#ff5a1f', { vibrance: 0.4 })           // 0 is nearly grey, 1 is as vivid as sRGB allows
```

`colors` takes up to four CSS colors used as-is and wins over `scheme`.

## Light and dark pages

On dark pages an orb is a light source; on light pages it behaves like ink, with tinted haze instead of glow and deeper color. By default (`appearance="auto"`) it reads the background color of the elements behind it and eases between the two when your theme changes. Over an image or video, or anywhere the guess is wrong, set `appearance="light"` or `"dark"`.

## States

`idle` · `connecting` · `listening` · `thinking` · `speaking` · `muted`

Switching states is always a glide: every value springs toward the new state's targets, except the audio weights, which switch in ~40 ms (see [Audio](#audio)). Tune a state with `motion`, or the spring with `transition`:

```tsx
<Orb motion={{ thinking: { swirl: 1.6 } }} transition={{ stiffness: 40, damping: 10 }} … />
```

## Audio

`input` and `output` take an `AudioSampler`: a function the orb calls every frame, returning a 0–1 level or `{ level, low, mid, high }`. The orb follows `input` while listening and `output` while speaking.

```ts
import { fromStream, fromNode, createVoiceSimulator } from 'lalia'

fromStream(micStream)       // any MediaStream: getUserMedia, a remote WebRTC track
fromNode(playbackGain)      // any AudioNode your agent's audio plays through
createVoiceSimulator()      // fake speech, for demos and design work
```

- The same stream or node always gives the same sampler, so writing `fromStream(…)` or `fromNode(…)` inline in JSX is fine.
- A stream with no audio track yet (a remote track that arrives later) reads as silence until it has one.
- Browsers keep audio paused until the user has clicked or tapped the page; the sampler starts by itself once they have. Starting a voice session is usually that click.
- `sampler.dispose?.()` releases the audio nodes when you're done. A disposed sampler that is read again reconnects.
- `fromStream`, `fromNode` and the ElevenLabs adapter auto-range: each voice is stretched between its own recent quiet and loud, so a loud TTS voice and a quiet laptop mic both move the orb fully, and steady room noise reads as silence. A sampler you write yourself is used as-is.
- The orb switches between `input` and `output` within ~40 ms of a state change, so the first syllable of a turn lands even while the look is still easing over.

A complete example with a microphone and audio you play yourself:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { fromNode, fromStream, type OrbState } from 'lalia'
import { Orb } from 'lalia/react'
import { wisp } from 'lalia/variants'

export function VoiceOrb({ state, playback }: { state: OrbState; playback: GainNode }) {
  const [mic, setMic] = useState<MediaStream | null>(null)

  useEffect(() => {
    let stream: MediaStream | undefined
    navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => setMic((stream = s)))
    return () => stream?.getTracks().forEach((t) => t.stop())
  }, [])

  return <Orb variant={wisp} state={state} input={mic && fromStream(mic)} output={fromNode(playback)} />
}
```

## Adapters

Ready-made state mapping for three voice platforms.

**ElevenLabs** (`@elevenlabs/react`): audio and state both come from the conversation.

```tsx
import { elevenLabsAudio, elevenLabsState } from 'lalia/adapters/elevenlabs'

function VoiceOrb() {
  const conversation = useConversation()
  const audio = useMemo(() => elevenLabsAudio(conversation), [conversation])
  return <Orb variant={wisp} {...audio} state={elevenLabsState(conversation.status, conversation.isSpeaking)} />
}
```

**OpenAI Realtime** over WebRTC: feed every data-channel event to the reducer.

```tsx
import { openaiRealtimeState } from 'lalia/adapters/openai'

function VoiceOrb({ dc, micStream, remoteStream }: { dc: RTCDataChannel; micStream: MediaStream; remoteStream: MediaStream }) {
  const [state, setState] = useState<OrbState>('idle')
  useEffect(() => {
    const onEvent = (e: MessageEvent) => setState((s) => openaiRealtimeState(JSON.parse(e.data), s))
    dc.addEventListener('message', onEvent)
    return () => dc.removeEventListener('message', onEvent)
  }, [dc])
  return <Orb variant={wisp} state={state} input={fromStream(micStream)} output={fromStream(remoteStream)} />
}
```

Chrome only feeds a remote WebRTC stream into Web Audio while it is also playing, so keep your `<audio>` element attached. Over WebSocket there are no `output_audio_buffer.*` events: switch to `listening` yourself when your playback queue drains.

**Gemini Live**: feed every server message to the reducer, from the callbacks you already pass to `ai.live.connect`. The agent's audio is the node you play it through.

```tsx
import { geminiLiveState } from 'lalia/adapters/gemini'

const [state, setState] = useState<OrbState>('idle')
// in ai.live.connect({ callbacks: { onmessage(message) { … } } }):
setState((s) => geminiLiveState(message, s))

<Orb variant={wisp} state={state} input={fromStream(micStream)} output={fromNode(playbackGain)} />
```

## `<Orb>` props

| Prop | Default | |
| --- | --- | --- |
| `variant` | required | A design from `lalia/variants` |
| `state` | `'idle'` | What the agent is doing |
| `input`, `output` | none | Microphone and agent audio samplers |
| `scheme` | the design's palette | A scheme from `lalia/schemes` |
| `colors` | none | Up to four CSS colors; wins over `scheme` |
| `size` | `240` | Pixels, or any CSS length. The orb is always square |
| `appearance` | `'auto'` | `'light'` or `'dark'` to stop reading the page |
| `motion`, `transition` | tuned | Per-state targets and spring, see [States](#states) |
| `label` | `"Voice assistant, {state}"` | Accessible name |
| `className`, `style` | | On the canvas |

## Without React

```ts
import { OrbEngine } from 'lalia'
import { lumen } from 'lalia/variants'

const orb = new OrbEngine(canvas, { variant: lumen, state: 'idle' }) // size the canvas with CSS
orb.setState('listening')
orb.destroy() // also releases the WebGL context
```

The constructor takes the same options as the props above (except `size`, `className`, `style` and `label`). Change them later with `setState`, `setVariant`, `setScheme`, `setColors`, `setInput`, `setOutput`, `setMotion`, `setTransition` and `setAppearance`.

## Custom designs

```ts
import { shaderVariant } from 'lalia'

export const dot = shaderVariant({
  name: 'dot',
  colors: ['#fff'],
  fragment: `void main() {
    float r = length(orbUV());
    fragColor = orbColor(uColors[0], smoothstep(0.3, 0.29, r * (1.0 - 0.2 * uAudio.x)));
  }`,
})
```

## Good to know

- ESM only. Needs WebGL2; without it the orb renders nothing and logs a warning.
- Browsers allow about 16 live WebGL contexts per page, one per orb. Unmounted orbs release theirs.
- An orb skips drawing while it is off screen.
