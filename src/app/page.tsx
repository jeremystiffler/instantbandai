export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 text-center">
      <div className="mb-5 rounded-full border border-violet-400/25 bg-violet-500/10 px-4 py-2 text-sm text-violet-200">
        Quality-first AI arrangement studio
      </div>
      <h1 className="text-5xl md:text-7xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent mb-6">
        Your Idea. Full Band.
      </h1>
      <p className="text-xl text-white/60 max-w-2xl mb-10">
        Upload a rough vocal, piano, guitar, or phone demo. InstantBandAI helps turn it into a fuller, more believable band arrangement — with analysis, mix playback, and downloadable results.
      </p>
      <a href="/studio" className="px-8 py-4 bg-violet-600 hover:bg-violet-500 rounded-xl text-lg font-semibold transition">
        Open Producer Studio →
      </a>
    </div>
  );
}
