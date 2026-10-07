<p align="center">
  <a href="https://lalia.offbrand.design"><img src="https://raw.githubusercontent.com/mbenhard/lalia/main/assets/cover.jpg" alt="lalia: audio-reactive orbs for voice AI agents" width="100%"></a>
</p>

# lalia

**Audio-reactive orbs for voice AI agents.** A WebGL voice visualizer that shows what your agent is doing (listening, thinking, speaking) and moves with every word. React component or plain JavaScript, zero dependencies.

[Docs](https://lalia.offbrand.design/docs) · [Playground](https://lalia.offbrand.design/play) · [npm](https://www.npmjs.com/package/lalia)

## Install with your coding agent

Paste this into Claude Code, Cursor, Codex or any other coding agent:

> Add the lalia voice orb to this app: https://lalia.offbrand.design/prompt.md

Or install it yourself with `npm i lalia`.

## What you get

- **9 designs:** wisp, silk, glass, satin, chrome, haze, cloud, prism, lumen
- **6 states:** idle, connecting, listening, thinking, speaking, muted. Every change glides, nothing jumps.
- **Moves with speech:** follows the microphone while listening and the agent's voice while speaking
- **22 color schemes,** or turn one brand color into a full palette
- **Light and dark pages,** detected from the page behind the orb
- **Small:** about 25 kB gzipped with every design, no dependencies

## Works with

ElevenLabs, OpenAI Realtime and Gemini Live through built-in adapters. LiveKit, Pipecat, Vapi and anything else that plays audio in the browser, through its `MediaStream` or Web Audio node. React, Next.js, Vue, Svelte or plain HTML.

## For agents

- [llms.txt](https://lalia.offbrand.design/llms.txt): index and quick start
- [llms-full.txt](https://lalia.offbrand.design/llms-full.txt): the full reference in one file
- [SKILL.md](https://lalia.offbrand.design/SKILL.md): a drop-in skill for Claude Code and other agents
- [DOCS.md](https://github.com/mbenhard/lalia/blob/main/DOCS.md): the same reference, also shipped in the npm package

## License

MIT
