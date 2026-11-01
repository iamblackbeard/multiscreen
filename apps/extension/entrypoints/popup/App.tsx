export function App() {
  return (
    <main className="w-80 bg-slate-950 p-5 text-slate-100">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
        Extension popup
      </p>
      <h1 className="mt-2 text-2xl font-bold">Twitch Multicam</h1>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        Camera controls are coming next.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-2" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className="aspect-video rounded-md border border-violet-400/30 bg-slate-800"
            key={index}
          />
        ))}
      </div>
    </main>
  );
}
