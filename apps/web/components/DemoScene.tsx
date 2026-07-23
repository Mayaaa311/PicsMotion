'use client';

import { useAudioEngine } from '@interactive-photo/audio-engine';
import { presets } from '@interactive-photo/presets';
import { loadScene, useRuntimeStore } from '@interactive-photo/scene-runtime';
import type { PresetName, SceneDocument } from '@interactive-photo/scene-schema';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AudioControls } from './AudioControls';
import { InteractiveSceneDynamic } from './InteractiveSceneDynamic';

const DEFAULT_SCENE_DIR = '/scenes/yosemite-falls';
const GALLERY_INDEX = '/scenes/gallery/index.json';
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000';
const PRESET_NAMES = Object.keys(presets) as PresetName[];

interface GalleryItem {
  id: string;
  title: string;
  preview: string;
  aspect: number;
}

interface DemoSceneProps {
  initialPreset: PresetName;
}

/**
 * Client demo: loads and validates the sample scene, then renders it through the
 * reusable runtime. A preset selector re-runs the same scene under a different
 * preset to demonstrate the "one engine, many presets" architecture.
 */
export function DemoScene({ initialPreset }: DemoSceneProps) {
  const [scene, setScene] = useState<SceneDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<PresetName>(initialPreset);
  const { engine } = useAudioEngine();
  const activeStyle = useRuntimeStore((s) => s.activeStyle);
  const setActiveStyle = useRuntimeStore((s) => s.setActiveStyle);
  const [styles, setStyles] = useState<Array<{ id: string; displayName: string }>>([]);

  // Which processed scene is loaded, the photo gallery, and intake UI state.
  const [sceneDir, setSceneDir] = useState(DEFAULT_SCENE_DIR);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [showPhotos, setShowPhotos] = useState(false);
  const [uploadState, setUploadState] = useState<'idle' | 'processing' | 'error'>('idle');
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  const chooseScene = useCallback(
    (dir: string) => {
      setActiveStyle(null); // styles are per-scene
      setScene(null);
      setError(null);
      setSceneDir(dir);
      setShowPhotos(false);
    },
    [setActiveStyle],
  );

  // The scene pulls normalized audio values imperatively each render frame.
  // Return null until a source is actually analysable, so the runtime skips all
  // audio work (and the debug panel reports "off") instead of seeing zeroed data.
  const getAudioFrame = useCallback(
    () => (engine && engine.canAnalyse ? engine.getFrame() : null),
    [engine],
  );

  useEffect(() => {
    let cancelled = false;
    loadScene(`${sceneDir}/scene.json`)
      .then((doc) => {
        if (!cancelled) setScene(doc);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [sceneDir]);

  // Load the AI style manifest for the current scene, if styles were generated.
  useEffect(() => {
    let cancelled = false;
    setStyles([]);
    fetch(`${sceneDir}/styles/manifest.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { styles?: Array<{ id: string; displayName: string }> }) => {
        if (!cancelled) setStyles(data.styles ?? []);
      })
      .catch(() => {
        /* no styles for this scene */
      });
    return () => {
      cancelled = true;
    };
  }, [sceneDir]);

  // Load the pre-processed photo gallery once.
  useEffect(() => {
    let cancelled = false;
    fetch(GALLERY_INDEX)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { scenes?: GalleryItem[] }) => {
        if (!cancelled) setGallery(data.scenes ?? []);
      })
      .catch(() => {
        /* gallery not generated — run scripts/gen-gallery.py */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Upload a photo → the AI service separates it into layers → load that scene.
  const onUpload = useCallback(
    async (fileList: FileList | null) => {
      const file = fileList?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        setUploadState('error');
        setUploadMsg('Please choose an image file.');
        return;
      }
      setUploadState('processing');
      setUploadMsg('Separating layers…');
      try {
        const body = new FormData();
        body.append('file', file);
        const res = await fetch(`${API_BASE}/scenes/process`, { method: 'POST', body });
        if (!res.ok) throw new Error(`Server ${res.status}`);
        const data = (await res.json()) as { baseUrl: string };
        setUploadState('idle');
        setUploadMsg(null);
        chooseScene(data.baseUrl.replace(/\/$/, ''));
      } catch (e) {
        setUploadState('error');
        setUploadMsg(
          `Couldn't process the photo. Is the AI service running on ${API_BASE}? (${e instanceof Error ? e.message : e})`,
        );
      }
    },
    [chooseScene],
  );

  // Apply the selected preset to the loaded scene (immutably).
  const activeScene = useMemo<SceneDocument | null>(
    () => (scene ? { ...scene, preset } : null),
    [scene, preset],
  );

  if (error) {
    return (
      <div role="alert" className="flex h-screen items-center justify-center p-8 text-center">
        <div>
          <h1 className="mb-2 text-xl font-semibold text-red-300">Could not load scene</h1>
          <p className="max-w-md text-sm text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-ink">
      {activeScene ? (
        <>
          <InteractiveSceneDynamic
            scene={activeScene}
            assetBaseUrl={`${sceneDir}/`}
            showDebug
            getAudioFrame={getAudioFrame}
          />
          {/* Screen-reader description of the visual scene. */}
          <p className="sr-only">
            Interactive scene: {activeScene.title}. {activeScene.visualAnalysis.mood}. Move the
            pointer to shift the layers with depth.
          </p>

          {/* Preset selector (top-right). */}
          <div className="absolute right-3 top-3 flex flex-col gap-1 rounded-lg border border-white/10 bg-black/60 p-2 backdrop-blur">
            <span className="px-1 font-mono text-[11px] uppercase tracking-wide text-slate-400">
              Preset
            </span>
            {PRESET_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setPreset(name)}
                aria-pressed={preset === name}
                className={`rounded px-3 py-1 text-left text-sm transition ${
                  preset === name
                    ? 'bg-mist text-ink'
                    : 'bg-white/5 text-slate-200 hover:bg-white/10'
                }`}
              >
                {presets[name].displayName}
              </button>
            ))}

            {/* AI art style — restyles the actual layers (needs generated styles). */}
            {styles.length > 0 && (
              <div className="mt-2 flex flex-col gap-1 border-t border-white/10 pt-2">
                <span className="px-1 font-mono text-[11px] uppercase tracking-wide text-slate-400">
                  Art style
                </span>
                {[{ id: null as string | null, displayName: 'Original' }, ...styles].map((s) => (
                  <button
                    key={s.id ?? 'original'}
                    type="button"
                    onClick={() => setActiveStyle(s.id)}
                    aria-pressed={activeStyle === s.id}
                    className={`rounded px-3 py-1 text-left text-xs transition ${
                      activeStyle === s.id
                        ? 'bg-mist text-ink'
                        : 'bg-white/5 text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    {s.displayName}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Photo source: choose from the folder or upload + process. */}
          <div className="absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowPhotos((v) => !v)}
                className="rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 text-sm text-slate-100 backdrop-blur hover:bg-white/10"
              >
                {showPhotos ? 'Close' : 'Choose photo'}
              </button>
              <label className="cursor-pointer rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 text-sm text-slate-100 backdrop-blur hover:bg-white/10">
                {uploadState === 'processing' ? 'Processing…' : 'Upload photo'}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={uploadState === 'processing'}
                  onChange={(e) => void onUpload(e.target.files)}
                />
              </label>
            </div>
            {uploadMsg && (
              <p
                role={uploadState === 'error' ? 'alert' : 'status'}
                className={`max-w-xs rounded bg-black/60 px-2 py-1 text-xs backdrop-blur ${
                  uploadState === 'error' ? 'text-red-300' : 'text-slate-300'
                }`}
              >
                {uploadMsg}
              </p>
            )}

            {showPhotos && (
              <div className="max-h-[70vh] w-[19rem] overflow-y-auto rounded-lg border border-white/10 bg-black/70 p-2 backdrop-blur">
                <p className="px-1 pb-2 font-mono text-[11px] uppercase tracking-wide text-slate-400">
                  {gallery.length ? `${gallery.length} photos` : 'Run scripts/gen-gallery.py'}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => chooseScene(DEFAULT_SCENE_DIR)}
                    className="col-span-3 rounded bg-white/5 px-2 py-1 text-left text-xs text-slate-200 hover:bg-white/10"
                  >
                    ★ Yosemite (layer-separated demo)
                  </button>
                  {gallery.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => chooseScene(`/scenes/gallery/${g.id}`)}
                      className="overflow-hidden rounded border border-white/10 hover:border-mist"
                      title={g.title}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/scenes/${g.preview}`}
                        alt={g.title}
                        loading="lazy"
                        className="aspect-square h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <AudioControls engine={engine} />
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
          Loading scene…
        </div>
      )}
    </div>
  );
}
