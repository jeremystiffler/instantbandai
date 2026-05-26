declare module "music-tempo" {
  export default class MusicTempo {
    tempo: number;
    beats: number[];
    constructor(data: Float32Array, options?: { sampleRate?: number });
  }
}
