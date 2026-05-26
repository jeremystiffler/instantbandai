import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Generate a click track WAV file in-memory at the given BPM
// Returns a downloadable WAV audio file
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const bpm = Math.max(40, Math.min(300, Number(searchParams.get("bpm") ?? 120)));
  const bars = Math.max(1, Math.min(200, Number(searchParams.get("bars") ?? 32)));
  const beats = bars * 4;
  const sampleRate = 44100;
  const secondsPerBeat = 60 / bpm;
  const totalSamples = Math.ceil(beats * secondsPerBeat * sampleRate);

  // Generate PCM samples — short sine beep on each beat, accent on beat 1
  const samples = new Float32Array(totalSamples);
  const clickDuration = 0.04; // 40ms click
  const clickSamples = Math.floor(clickDuration * sampleRate);

  for (let beat = 0; beat < beats; beat++) {
    const startSample = Math.floor(beat * secondsPerBeat * sampleRate);
    const isDownbeat = beat % 4 === 0;
    const freq = isDownbeat ? 1000 : 800; // higher pitch on 1
    const amplitude = isDownbeat ? 0.9 : 0.6;

    for (let i = 0; i < clickSamples && startSample + i < totalSamples; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-i / (clickSamples * 0.3)); // fast decay
      samples[startSample + i] += amplitude * envelope * Math.sin(2 * Math.PI * freq * t);
    }
  }

  // Convert Float32 PCM to 16-bit WAV
  const pcm16 = new Int16Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767)));
  }

  const wavBuffer = encodeWav(pcm16, sampleRate, 1);

  return new NextResponse(wavBuffer, {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Content-Disposition": `attachment; filename="click-${bpm}bpm.wav"`,
      "Content-Length": wavBuffer.byteLength.toString(),
      "Cache-Control": "public, max-age=3600",
    },
  });
}

function encodeWav(samples: Int16Array, sampleRate: number, channels: number): ArrayBuffer {
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };

  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  write(36, "data");
  view.setUint32(40, dataSize, true);

  const output = new Int16Array(buffer, 44);
  output.set(samples);

  return buffer;
}
