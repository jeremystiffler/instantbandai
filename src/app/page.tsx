export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 text-center">
      <h1 className="text-5xl md:text-7xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent mb-6">
        Your Song. Full Band.
      </h1>
      <p className="text-xl text-white/60 max-w-2xl mb-10">
        Upload your vocal or piano recording. AI generates drums, bass, guitar, keys, and more — individually downloadable stems in minutes.
      </p>
      <a href="/studio" className="px-8 py-4 bg-violet-600 hover:bg-violet-500 rounded-xl text-lg font-semibold transition">
        Start for Free →
      </a>
    </div>
  );
}
