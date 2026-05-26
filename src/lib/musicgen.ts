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

/** Stem → text prompt fragment used in MusicGen */
const STEM_PROMPTS: Record<GenerateStem, string> = {
  drums: "acoustic drum kit, live drums",
  bass: "electric bass guitar, groove bass line",
  guitar: "electric guitar, rhythm guitar",
  keys: "piano keys, keyboard chords",
  strings: "string ensemble, orchestral strings",
  other: "ambient texture, atmospheric pad",
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
  stem: GenerateStem,
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
  // continuation mode only at slider < 25
  const continuation = s < 25;

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
    model_version: "stereo-melody-large",
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
