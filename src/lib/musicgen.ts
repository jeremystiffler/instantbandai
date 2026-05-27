/**
 * Audio generation helpers for InstantBandAI
 *
 * Two generation modes:
 *  "loops"   — Stable Audio Open: 8s instrument loops, looped client-side. Clean, isolated, musical.
 *  "fullmix" — ACE-Step: full stereo song from text prompt, 30–60s.
 */

// ryan5453/demucs — htdemucs_6s stem separator
export const DEMUCS_VERSION =
  "5a7041cc9b82e5a558fea6b3d7b12dea89625e89da33f0447bd727c2d0ab9e77";

// MusicGen — melody-conditioned orchestration (primary "Orchestrate" mode)
// stereo-melody-large: feeds your melody audio in, outputs full arrangement following it
export const MUSICGEN_VERSION =
  "671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb";

// Stable Audio Open — short isolated instrument loops
export const STABLE_AUDIO_VERSION =
  "9aff84a639f96d0f7e6081cdea002d15133d0043727f849c40abdd166b7c75a8";

// ACE-Step — full stereo song generation
export const ACE_STEP_VERSION =
  "280fc4f9ee507577f880a167f639c02622421d8fecf492454320311217b688f1";

export const GENERATE_STEMS = ["drums", "bass", "guitar", "keys", "strings"] as const;
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
  drums:   "live acoustic drum kit, tight snare, punchy kick, steady groove, professional studio recording",
  bass:    "electric bass guitar, clean fingerstyle, melodic bass line, deep low-end, locked-in groove",
  guitar:  "electric guitar, clean tone, rhythm chords, musical and tasteful, studio quality",
  keys:    "grand piano, melodic chord voicings, expressive touch, warm and musical",
  strings: "lush orchestral string ensemble, smooth bowing, rich harmonic sustain, cinematic",
  other:   "ambient atmospheric pad, slow evolving texture, musical background",
  // variant entries
  ...VARIANT_PROMPTS,
};

// ─── STABLE AUDIO — Instrument Loop Builder ────────────────────────────────

/** Stable Audio prompt per stem — very specific, single-instrument descriptors */
const LOOP_PROMPTS: Record<string, string> = {
  drums:   "isolated drum loop, tight kick and snare, hi-hat groove, no other instruments, clean studio recording",
  bass:    "isolated electric bass guitar loop, melodic groove, clean fingerstyle tone, no other instruments",
  guitar:  "isolated electric guitar loop, clean chord strumming, no other instruments, studio quality",
  keys:    "isolated grand piano loop, melodic chords, clean tone, no other instruments, studio quality",
  strings: "isolated orchestral strings loop, smooth ensemble bowing, lush sustain, no other instruments",
  other:   "isolated ambient pad loop, evolving texture, no percussion, no melody, atmospheric",
  ...VARIANT_PROMPTS,
};

export interface StableAudioInput {
  prompt: string;
  negative_prompt: string;
  seconds_start: number;
  seconds_total: number;
  cfg_scale: number;
  steps: number;
  seed: number;
  sampler_type: string;
  sigma_min: number;
  sigma_max: number;
  init_noise_level: number;
  batch_size: number;
}

/**
 * Build Stable Audio input for a single instrument loop (8s).
 * BPM is embedded in the prompt — Stable Audio was trained on Freesound loops
 * tagged with BPM so it follows it reliably.
 */
export function buildLoopInput(
  stem: string,
  bpm?: number | null,
  key?: string | null,
): StableAudioInput {
  const bpmStr = bpm ? `${Math.round(bpm)} BPM, ` : "";
  const keyStr = key ? `key of ${key}, ` : "";
  const basePrompt = LOOP_PROMPTS[stem] ?? LOOP_PROMPTS["other"];
  const prompt = `${bpmStr}${keyStr}${basePrompt}`;
  const negative = "distortion, noise, clipping, other instruments bleeding in, full mix, choir, vocals";

  return {
    prompt,
    negative_prompt: negative,
    seconds_start: 0,
    seconds_total: 8,
    cfg_scale: 7,
    steps: 100,
    seed: -1,
    sampler_type: "dpmpp-3m-sde",
    sigma_min: 0.03,
    sigma_max: 500,
    init_noise_level: 1,
    batch_size: 1,
  };
}

// ─── MUSICGEN MELODY — Melody Orchestration Builder ─────────────────────────

export interface MusicGenMelodyInput {
  prompt: string;
  input_audio: string;   // URL of uploaded melody audio (was "melody" — wrong field name)
  model_version: string;
  duration: number;
  top_k: number;
  top_p: number;
  temperature: number;
  classifier_free_guidance: number;
  output_format: string;
  normalization_strategy: string;
}

/**
 * Build MusicGen input for melody-conditioned orchestration.
 * Uses stereo-melody-large: your melody audio drives the melodic structure,
 * the prompt drives style/instrumentation. This is the primary use case:
 * "I have a simple melody — orchestrate it."
 */
export function buildMelodyOrchestrationInput(
  melodyUrl: string,
  stylePrompt: string,
  bpm?: number | null,
  key?: string | null,
  duration = 30,
): MusicGenMelodyInput {
  const bpmStr = bpm ? `${Math.round(bpm)} BPM, ` : "";
  const keyStr = key ? `in the key of ${key}, ` : "";
  const prompt = `${bpmStr}${keyStr}${stylePrompt}`;

  return {
    prompt,
    input_audio: melodyUrl,
    model_version: "stereo-melody-large",
    duration,
    top_k: 250,
    top_p: 0,
    temperature: 1,
    classifier_free_guidance: 4,
    output_format: "mp3",
    normalization_strategy: "loudness",
  };
}

// ─── ACE-STEP — Full Mix Builder ────────────────────────────────────────────

export interface AceStepInput {
  tags: string;
  lyrics: string;
  duration: number;
  seed: number;
  number_of_steps: number;
  scheduler: string;
  guidance_type: string;
  guidance_scale: number;
  granularity_scale: number;
  guidance_interval: number;
  min_guidance_scale: number;
}

/**
 * Build ACE-Step input for a full stereo song.
 * Tags drive style/instrumentation; lyrics use [instrumental] for no vocals.
 */
export function buildFullMixInput(
  prompt: string,
  bpm?: number | null,
  key?: string | null,
  duration = 45,
): AceStepInput {
  const bpmTag = bpm ? `${Math.round(bpm)} BPM` : "";
  const keyTag = key ? `key of ${key}` : "";
  const tags = [prompt, bpmTag, keyTag, "high quality", "studio recording"]
    .filter(Boolean).join(", ");

  return {
    tags,
    lyrics: "[instrumental]",
    duration,
    seed: -1,
    number_of_steps: 60,
    scheduler: "euler",
    guidance_type: "apg",
    guidance_scale: 15,
    granularity_scale: 10,
    guidance_interval: 0.5,
    min_guidance_scale: 3,
  };
}

// ─── Replicate API helpers ──────────────────────────────────────────────────

/** Fire a single prediction on Replicate. Retries once on 429. */
export async function startPrediction(
  version: string,
  input: Record<string, unknown>,
  apiToken: string,
  webhookUrl?: string
): Promise<string> {
  const body: Record<string, unknown> = { version, input };
  if (webhookUrl) {
    body.webhook = webhookUrl;
    body.webhook_events_filter = ["completed"];
  }

  async function attempt(): Promise<Response> {
    return fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  let res = await attempt();
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 12_000));
    res = await attempt();
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Replicate error ${res.status}: ${JSON.stringify(err)}`);
  }
  const prediction = await res.json();
  return prediction.id as string;
}

/** Legacy alias used by generate route */
export type MusicGenInput = StableAudioInput;
export const startMusicGenPrediction = (
  input: StableAudioInput,
  apiToken: string,
  webhookUrl?: string
) => startPrediction(STABLE_AUDIO_VERSION, input as unknown as Record<string, unknown>, apiToken, webhookUrl);

/** Fire all stem loops sequentially (staggered to avoid 429). */
export async function startAllStemPredictions(
  stems: string[],
  buildInput: (stem: string) => StableAudioInput,
  apiToken: string,
  webhookUrl?: string,
  staggerMs = 2000
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  for (let i = 0; i < stems.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, staggerMs));
    const stem = stems[i];
    try {
      const predId = await startPrediction(
        STABLE_AUDIO_VERSION,
        buildInput(stem) as unknown as Record<string, unknown>,
        apiToken,
        webhookUrl
      );
      results[stem] = predId;
    } catch (e) {
      console.error(`Stable Audio start failed for ${stem}:`, e);
    }
  }
  return results;
}

