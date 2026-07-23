'use client';

import type { AudioEngine } from '@interactive-photo/audio-engine';
import { useCallback, useEffect, useRef, useState } from 'react';

const MANIFEST_URL = '/demo-audio/manifest.json';
const AUDIO_DIR = '/demo-audio';

interface Track {
  file: string;
  title: string;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Playback + source controls for the audio engine: demo-track picker, "use your
 * own file", play/pause, seek, mute and volume.
 *
 * Transport state is polled at ~5 Hz (not per frame) purely to drive this DOM UI.
 * The scene reads analysis values imperatively via `engine.getFrame()`.
 */
export function AudioControls({ engine }: { engine: AudioEngine | null }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const objectUrlRef = useRef<string | null>(null);

  // Load the demo-track manifest (absent on a fresh clone — audio is git-ignored).
  useEffect(() => {
    let cancelled = false;
    fetch(MANIFEST_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { tracks?: Track[] }) => {
        if (!cancelled) setTracks(data.tracks ?? []);
      })
      .catch(() => {
        /* no demo audio available; user can still upload a file */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll transport state for the UI (5 Hz).
  useEffect(() => {
    if (!engine) return;
    const id = window.setInterval(() => {
      setIsPlaying(engine.isPlaying);
      setTime(engine.getCurrentTime());
      setDuration(engine.getDuration());
    }, 200);
    return () => window.clearInterval(id);
  }, [engine]);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  const loadTrack = useCallback(
    async (file: string) => {
      if (!engine) return;
      setLoading(true);
      setError(null);
      try {
        await engine.loadUrl(`${AUDIO_DIR}/${encodeURIComponent(file)}`);
        engine.setVolume(volume);
        engine.setMuted(muted);
        setSelected(file);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load track');
      } finally {
        setLoading(false);
      }
    },
    [engine, muted, volume],
  );

  const onUpload = useCallback(
    async (fileList: FileList | null) => {
      const file = fileList?.[0];
      if (!file || !engine) return;
      if (!file.type.startsWith('audio/')) {
        setError('Please choose an audio file.');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        await engine.loadFile(file);
        engine.setVolume(volume);
        engine.setMuted(muted);
        setSelected(`upload:${file.name}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load file');
      } finally {
        setLoading(false);
      }
    },
    [engine, muted, volume],
  );

  const togglePlay = useCallback(async () => {
    if (!engine) return;
    try {
      // Browsers require a user gesture before audio may start — this is one.
      if (engine.isPlaying) await engine.pause();
      else await engine.play();
      setIsPlaying(engine.isPlaying);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Playback failed');
    }
  }, [engine]);

  const hasSource = selected !== '';

  return (
    <section
      data-testid="audio-controls"
      aria-label="Audio controls"
      className="absolute bottom-3 left-3 right-3 mx-auto flex max-w-3xl flex-col gap-2 rounded-lg border border-white/10 bg-black/65 p-3 backdrop-blur"
    >
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="track" className="font-mono text-[11px] uppercase tracking-wide text-slate-400">
          Track
        </label>
        <select
          id="track"
          value={selected.startsWith('upload:') ? '' : selected}
          onChange={(e) => void loadTrack(e.target.value)}
          className="min-w-[12rem] flex-1 rounded bg-white/10 px-2 py-1 text-sm text-slate-100"
        >
          <option value="" disabled>
            {tracks.length ? 'Choose a demo track…' : 'No demo tracks found'}
          </option>
          {tracks.map((t) => (
            <option key={t.file} value={t.file}>
              {t.title}
            </option>
          ))}
        </select>

        <label className="cursor-pointer rounded bg-white/10 px-3 py-1 text-sm text-slate-100 hover:bg-white/20">
          Use your own…
          <input
            type="file"
            accept="audio/*"
            className="sr-only"
            onChange={(e) => void onUpload(e.target.files)}
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void togglePlay()}
          disabled={!hasSource || loading}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="rounded bg-mist px-4 py-1 text-sm font-medium text-ink disabled:opacity-40"
        >
          {loading ? '…' : isPlaying ? 'Pause' : 'Play'}
        </button>

        <span className="font-mono text-xs text-slate-400">{formatTime(time)}</span>
        <input
          type="range"
          aria-label="Seek"
          min={0}
          max={Math.max(duration, 0.1)}
          step={0.1}
          value={Math.min(time, duration || 0)}
          onChange={(e) => {
            const t = Number(e.target.value);
            setTime(t);
            void engine?.seek(t);
          }}
          disabled={!hasSource || !duration}
          className="flex-1 accent-[#8fd3fe]"
        />
        <span className="font-mono text-xs text-slate-400">{formatTime(duration)}</span>

        <button
          type="button"
          onClick={() => {
            const next = !muted;
            setMuted(next);
            engine?.setMuted(next);
          }}
          aria-pressed={muted}
          className="rounded bg-white/10 px-2 py-1 text-xs text-slate-100 hover:bg-white/20"
        >
          {muted ? 'Unmute' : 'Mute'}
        </button>

        <input
          type="range"
          aria-label="Volume"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => {
            const v = Number(e.target.value);
            setVolume(v);
            engine?.setVolume(v);
          }}
          className="w-20 accent-[#8fd3fe]"
        />
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
      {!hasSource && !error && (
        <p className="text-xs text-slate-400">
          Pick a track (or your own file), then press Play — the scene reacts to bass, overall
          loudness and detected beats.
        </p>
      )}
    </section>
  );
}
