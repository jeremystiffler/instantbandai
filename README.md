# InstantBandAI

InstantBandAI turns a rough vocal, piano, guitar, or phone demo into a fuller band arrangement.

## Current product focus

The app is being cleaned around one quality-first promise:

> Upload a rough musical idea. Get back a believable full-band arrangement.

## Modes

- **Producer Arrangement** (`melody`) — flagship path. Uses melody-conditioned generation to preserve the uploaded idea while producing a fuller band track.
- **Style Compose** (`style`) — prompt-only full track generation for reference/backing-track ideas.
- **Instrument Loops** (`loops`) — experimental short loop generation matched to BPM/key.
- **Separate** (`separate`) — utility mode for splitting an existing recording into stems.

## Quality roadmap

1. Keep the flagship path centered on `melody` / producer arrangement.
2. Analyze uploads for BPM/key/chords before generation.
3. Generate multiple candidate arrangements from high-quality engines.
4. Add provider abstraction for ElevenLabs Music, Stable Audio, Lyria, and Suno/Udio benchmarking as APIs/terms allow.
5. Let users choose versions like natural band, radio-ready, acoustic, and instrumental-only.

## Development

```bash
npm install
npm run build
npm run dev
```

Required environment variables are listed in `.env.example`.
