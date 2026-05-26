/**
 * MusicGen helper — builds Replicate input params from a similarity slider.
 *
 * slider = 0   → mirror mode  (continuation=true, low temp, high CFG)
 * slider = 50  → complement   (melody mimicry, mid temp/CFG)
 * slider = 100 → original     (text-prompt only, high temp, low CFG)
 */

export const MUSICGEN_VERSION =
  "b05b1dff1d8c6dc63d14b0cdb42135378dcb87f6373b0d3d341ede46e59e2b38";

export const DEMUCS_VERSION =
  "671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb";

export const GENERATE_STEMS = ["drums", "bass", "guitar", "keys", "strings", "other"] as const;
export const SEPARATE_STEMS = ["vocals", "bass", "drums", "guitar", "piano", "other"] as const;

export type GenerateStem = (typeof GENERATE_STEMS)[number];

/** Available extra instruments. Each has multiple variants with distinct sounds.
 *  When a user adds the same instrument twice they get the next variant —
 *  different prompt, different texture, different feel.
 */
export const EXTRA_INSTRUMENT_OPTIONS = [
  {
    id: "acoustic-guitar",
    label: "🎸 Acoustic Guitar",
    variants: [
      { suffix: "fingerpick", label: "Acoustic Guitar (Fingerpick)", prompt: "fingerpicking acoustic guitar, delicate arpeggios, warm nylon strings, intimate feel" },
      { suffix: "strummed",   label: "Acoustic Guitar (Strummed)",   prompt: "strummed acoustic guitar, driving open chords, bright steel string, rhythmic pulse" },
      { suffix: "slide",      label: "Acoustic Guitar (Slide)",      prompt: "slide acoustic guitar, bluesy portamento glide, resonator bottle-neck tone" },
      { suffix: "picked",     label: "Acoustic Guitar (Flatpick)",   prompt: "flatpicked acoustic guitar, articulate single-note runs, country-bluegrass bright attack" },
    ],
  },
  {
    id: "electric-guitar",
    label: "🎸 Electric Guitar",
    variants: [
      { suffix: "lead",    label: "Electric Guitar (Lead)",    prompt: "electric guitar lead melody, sustain and vibrato, clean tone" },
      { suffix: "crunch",  label: "Electric Guitar (Crunch)",  prompt: "crunchy electric guitar, overdriven power chords, mid-range grit" },
      { suffix: "clean",   label: "Electric Guitar (Clean)",   prompt: "clean electric guitar, glassy Fender-style tone, rhythmic chops" },
      { suffix: "ambient", label: "Electric Guitar (Ambient)", prompt: "ambient electric guitar, reverb-drenched swells, shoegazer texture, slow attack" },
    ],
  },
  {
    id: "percussion",
    label: "🪘 Percussion",
    variants: [
      { suffix: "hand",    label: "Percussion (Hand)",    prompt: "hand percussion, djembe, shakers, congas, organic world feel" },
      { suffix: "latin",   label: "Percussion (Latin)",   prompt: "latin percussion, timbales, clave, bongo, rhythmic latin groove" },
      { suffix: "kit",     label: "Percussion (Kit)",     prompt: "drum kit percussion fills, snare rolls, cymbal accents, punchy hits" },
      { suffix: "ambient", label: "Percussion (Ambient)", prompt: "ambient metallic percussion, bells, gongs, shimmering sustained textures" },
    ],
  },
  {
    id: "piano",
    label: "🎹 Piano",
    variants: [
      { suffix: "classical", label: "Piano (Classical)",  prompt: "grand piano, classical touch, expressive legato melody, concert hall reverb" },
      { suffix: "gospel",    label: "Piano (Gospel)",     prompt: "gospel piano, churchy chord stabs, soulful runs, righthand melody with left-hand bass" },
      { suffix: "jazz",      label: "Piano (Jazz)",       prompt: "jazz piano comping, extended chords, walking-bass left hand, bebop feel" },
      { suffix: "ambient",   label: "Piano (Ambient)",    prompt: "ambient prepared piano, soft Rhodes-like texture, spacious and meditative" },
    ],
  },
  {
    id: "synth",
    label: "🎛️ Synth",
    variants: [
      { suffix: "lead",  label: "Synth (Lead)",  prompt: "analog synth lead, saw-wave melody, Moog-style brightness, expressive filter" },
      { suffix: "pad",   label: "Synth (Pad)",   prompt: "lush synthesizer pad, slow attack, warm choir-like sustain, ambient shimmer" },
      { suffix: "bass",  label: "Synth (Bass)",  prompt: "synth bass, deep sub oscillator, punchy 808-style, electronic groove" },
      { suffix: "arp",   label: "Synth (Arp)",   prompt: "arpeggiating synthesizer, sequenced rhythmic pattern, 80s synth-pop feel" },
    ],
  },
  {
    id: "brass",
    label: "🎺 Brass",
    variants: [
      { suffix: "trumpet",  label: "Brass (Trumpet)",   prompt: "solo trumpet melody, bright and punchy, jazz-influenced phrasing" },
      { suffix: "section",  label: "Brass (Section)",   prompt: "full brass section, trumpets and trombones, tight stab chords, big-band energy" },
      { suffix: "flugelhorn", label: "Brass (Flugelhorn)", prompt: "flugelhorn, warm and mellow brass tone, lyrical slow melody" },
      { suffix: "tuba",     label: "Brass (Low Brass)", prompt: "tuba and low brass, deep supporting harmony, slow attack, orchestral underpinning" },
    ],
  },
  {
    id: "strings",
    label: "🎻 Strings",
    variants: [
      { suffix: "ensemble", label: "Strings (Ensemble)",  prompt: "orchestral string ensemble, lush swell, cinematic sustain" },
      { suffix: "pizzicato", label: "Strings (Pizzicato)", prompt: "pizzicato strings, plucked staccato notes, light and rhythmic character" },
      { suffix: "solo",     label: "Strings (Solo Violin)", prompt: "expressive solo violin, vibrato melody, intimate and emotional" },
      { suffix: "cello",    label: "Strings (Cello)",     prompt: "solo cello, deep warm register, lyrical slow theme, rich resonance" },
    ],
  },
  {
    id: "choir",
    label: "🎤 Choir",
    variants: [
      { suffix: "aah",     label: "Choir (Aah Pad)",    prompt: "choir vocal pads, AAHH sustain, lush harmonic background texture" },
      { suffix: "gospel",  label: "Choir (Gospel)",     prompt: "gospel choir, call-and-response energy, soulful harmonies, spirited feel" },
      { suffix: "classical", label: "Choir (Classical)", prompt: "classical mixed choir, polyphonic counterpoint, cathedral reverb" },
      { suffix: "ooh",     label: "Choir (Ooh Melody)", prompt: "close-harmony choir singing OOH, melodic wordless vocals, intimate ensemble" },
    ],
  },
  {
    id: "organ",
    label: "🎹 Organ",
    variants: [
      { suffix: "hammond", label: "Organ (Hammond)",  prompt: "Hammond B3 organ, Leslie rotary speaker effect, rock/gospel drawbar chords" },
      { suffix: "church",  label: "Organ (Church)",   prompt: "church pipe organ, slow cathedral reverb, hymn-like sustained chords" },
      { suffix: "jazz",    label: "Organ (Jazz)",     prompt: "jazz organ comping, walking left-hand bass, right-hand jazz chords" },
      { suffix: "ambient", label: "Organ (Ambient)",  prompt: "ambient organ drone, evolving harmonic pad, meditative and spacious" },
    ],
  },
  {
    id: "woodwind",
    label: "🪈 Woodwind",
    variants: [
      { suffix: "flute",    label: "Woodwind (Flute)",    prompt: "solo flute, airy breathy tone, lyrical high register melody" },
      { suffix: "clarinet", label: "Woodwind (Clarinet)", prompt: "solo clarinet, warm chalumeau register, expressive jazz or classical phrasing" },
      { suffix: "sax",      label: "Woodwind (Sax)",      prompt: "tenor saxophone, smooth jazz tone, melodic sax solo with vibrato" },
      { suffix: "oboe",     label: "Woodwind (Oboe)",     prompt: "solo oboe, reedy nasal tone, folk or orchestral melodic line" },
    ],
  },
] as const;

export type ExtraInstrumentId = (typeof EXTRA_INSTRUMENT_OPTIONS)[number]["id"];

/** Flat lookup: variant full id (e.g. 'acoustic-guitar-fingerpick') → prompt */
export const VARIANT_PROMPTS: Record<string, string> = Object.fromEntries(
  EXTRA_INSTRUMENT_OPTIONS.flatMap(inst =>
    inst.variants.map(v => [`${inst.id}-${v.suffix}`, v.prompt])
  )
);

/** Flat lookup: variant full id → display label */
export const VARIANT_LABELS: Record<string, string> = Object.fromEntries(
  EXTRA_INSTRUMENT_OPTIONS.flatMap(inst =>
    inst.variants.map(v => [`${inst.id}-${v.suffix}`, v.label])
  )
);

/** All instrument prompts (base stems + extras/variants) */
const STEM_PROMPTS: Record<string, string> = {
  drums:   "acoustic drum kit, live drums, full kit",
  bass:    "electric bass guitar, groove bass line, low-end foundation",
  guitar:  "electric guitar, rhythm guitar chords",
  keys:    "piano keys, keyboard chords, melodic support",
  strings: "orchestral string ensemble, cinematic sustain",
  other:   "ambient texture, atmospheric pad, experimental",
  // variant entries (acoustic-guitar-fingerpick, etc.)
  ...VARIANT_PROMPTS,
};

export interface MusicGenInput {
  prompt: string;
  input_audio: string;
  duration: number;
  continuation: boolean;
  continuation_start: number;
  temperature: number;
  classifier_free_guidance: number;
  top_k: number;
  model_version: string;
  output_format: "wav" | "mp3";
  normalization_strategy: "loudness";
}

/**
 * Build MusicGen input for a given stem + slider value.
 * @param stem   Which instrument to generate
 * @param slider 0 (mirror) … 100 (original)
 * @param sourceUrl  Uploaded audio URL used as the melody/continuation guide
 * @param bpm    Optional BPM for prompt enrichment
 * @param key    Optional key for prompt enrichment
 * @param duration Seconds of output audio to generate (default 30)
 */
export function buildMusicGenInput(
  stem: string,
  slider: number,
  sourceUrl: string,
  bpm?: number | null,
  key?: string | null,
    duration = 30
): MusicGenInput {
  const s = Math.max(0, Math.min(100, slider));

  // Interpolate params
  // temperature: 0.7 (mirror) → 1.3 (original)
  const temperature = 0.7 + (s / 100) * 0.6;
  // CFG: 5 (mirror) → 2 (original)
  const cfg = Math.round(5 - (s / 100) * 3);
  // continuation mode only at slider < 25, but ONLY when source audio is short
  // For safety always disable continuation to avoid "prompt longer than audio" errors
  const continuation = false;

  const keyStr = key ? ` in the key of ${key}` : "";
  const bpmStr = bpm ? ` at ${Math.round(bpm)} BPM` : "";
  const prompt = `${STEM_PROMPTS[stem]}${keyStr}${bpmStr}, matching the mood and structure of the reference track`;

  return {
    prompt,
    input_audio: sourceUrl,
    duration,
    continuation,
    continuation_start: 0,
    temperature,
    classifier_free_guidance: cfg,
    top_k: 250,
    model_version: "melody-large",
    output_format: "wav",
    normalization_strategy: "loudness",
  };
}

/** Fire a single MusicGen prediction on Replicate, return prediction ID */
export async function startMusicGenPrediction(
  input: MusicGenInput,
  apiToken: string
): Promise<string> {
  const res = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Token ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ version: MUSICGEN_VERSION, input }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Replicate error: ${JSON.stringify(err)}`);
  }
  const prediction = await res.json();
  return prediction.id as string;
}
