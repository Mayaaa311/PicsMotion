import Link from 'next/link';

/** Landing page. Milestone 1 ships a single manually-layered demo scene. */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-widest text-mist">Milestone 1</p>
        <h1 className="text-4xl font-semibold leading-tight">Interactive Photo</h1>
        <p className="max-w-xl text-lg text-slate-300">
          A photograph that understands how it wants to move — and uses music to come alive. This
          build renders a manually-layered scene as an interactive 2.5D canvas with depth-aware
          parallax.
        </p>
      </header>

      <nav className="flex flex-wrap gap-4">
        <Link
          href="/demo/soft-nature"
          className="rounded-lg bg-mist px-5 py-3 font-medium text-ink transition hover:opacity-90"
        >
          Open Soft Nature demo →
        </Link>
      </nav>

      <section className="text-sm text-slate-400">
        <p>
          Move your cursor over the scene to feel depth. Use the debug panel (top-left) to switch
          quality, pause, or toggle reduced motion.
        </p>
      </section>
    </main>
  );
}
