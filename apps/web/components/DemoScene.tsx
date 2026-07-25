'use client';

import { useAudioEngine } from '@interactive-photo/audio-engine';
import { presets } from '@interactive-photo/presets';
import { loadScene, useRuntimeStore } from '@interactive-photo/scene-runtime';
import type { PresetName, SceneDocument } from '@interactive-photo/scene-schema';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AudioControls } from './AudioControls';
import { InteractiveSceneDynamic } from './InteractiveSceneDynamic';

/**
 * Music/audio UI is hidden for now while the visual pipeline is being tuned.
 * The audio engine and all its bindings stay wired up — flip this to `true` to
 * bring the transport back with no other changes.
 */
const SHOW_AUDIO_CONTROLS = false;

/**
 * The preset selector (Soft Nature / Urban / Dark / Nostalgic) is hidden for now:
 * the app shows the plain moving photo and the art-style paintbrush, with no
 * colour grade or ambient effect applied before painting. The presets and their
 * effect code are kept intact for future use — flip this to `true` to bring the
 * selector back (and drop `plain` on InteractiveSceneDynamic).
 */
const SHOW_PRESETS = false;

const DEFAULT_SCENE_DIR = '/scenes/gallery/yosemite-falls';
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
  const setStyleList = useRuntimeStore((s) => s.setStyleList);
  const resetStyles = useRuntimeStore((s) => s.resetStyles);
  const [styles, setStyles] = useState<Array<{ id: string; displayName: string }>>([]);

  // Which processed scene is loaded, the photo gallery, and intake UI state.
  const [sceneDir, setSceneDir] = useState(DEFAULT_SCENE_DIR);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [showPhotos, setShowPhotos] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [uploadState, setUploadState] = useState<'idle' | 'processing' | 'error'>('idle');
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  const chooseScene = useCallback(
    (dir: string) => {
      resetStyles(); // styles + painted strokes are per-scene
      setScene(null);
      setError(null);
      setSceneDir(dir);
      setShowPhotos(false);
    },
    [resetStyles],
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
        if (cancelled) return;
        const list = data.styles ?? [];
        setStyles(list);
        // The order here defines the paint-buffer style index for each style.
        setStyleList(list.map((s) => s.id));
      })
      .catch(() => {
        /* no styles for this scene */
      });
    return () => {
      cancelled = true;
    };
  }, [sceneDir, setStyleList]);

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
      setUploadMsg('Separating depth layers & painting AI styles — this takes a few minutes…');
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
            plain
            showDebug={false}
            getAudioFrame={getAudioFrame}
          />
          {/* Screen-reader description of the visual scene. */}
          <p className="sr-only">
            Interactive scene: {activeScene.title}. {activeScene.visualAnalysis.mood}. Move the
            pointer to shift the layers with depth.
          </p>

          {/* Compact, collapsible control panel (top-right) so it never blocks
              the picture. Presets on top; the art-style paintbrush below. */}
          <div className="absolute right-3 top-3 w-52 rounded-lg border border-white/10 bg-black/60 backdrop-blur">
            <button
              type="button"
              onClick={() => setShowControls((v) => !v)}
              aria-expanded={showControls}
              className="flex w-full items-center justify-between rounded-t-lg px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-wide text-slate-300 hover:bg-white/5"
            >
              <span>Controls</span>
              <span aria-hidden className="text-slate-500">{showControls ? '▾' : '▸'}</span>
            </button>

            {showControls && (
              <div className="flex flex-col gap-1 px-2 pb-2">
                {SHOW_PRESETS && (
                  <>
                    <span className="px-0.5 font-mono text-[10px] uppercase tracking-wide text-slate-500">
                      Preset
                    </span>
                    <div className="grid grid-cols-2 gap-1">
                      {PRESET_NAMES.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setPreset(name)}
                          aria-pressed={preset === name}
                          aria-label={presets[name].displayName}
                          title={presets[name].displayName}
                          className={`truncate rounded px-1.5 py-1 text-left text-[11px] transition ${
                            preset === name
                              ? 'bg-mist text-ink'
                              : 'bg-white/5 text-slate-200 hover:bg-white/10'
                          }`}
                        >
                          {presets[name].displayName.split(' / ')[0]}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* AI art style — a cursor "paintbrush" paints the restyled photo
                    in along its path (needs generated styles; gen-styles.py). */}
                {styles.length > 0 && (
                  <div
                    className={`flex flex-col gap-1 ${
                      SHOW_PRESETS ? 'mt-1.5 border-t border-white/10 pt-1.5' : ''
                    }`}
                  >
                    <span className="px-0.5 font-mono text-[10px] uppercase tracking-wide text-slate-500">
                      Paintbrush
                    </span>
                    <div className="grid max-h-64 grid-cols-2 gap-1 overflow-y-auto pr-0.5">
                      {[{ id: null as string | null, displayName: 'Original' }, ...styles].map(
                        (s) => (
                          <button
                            key={s.id ?? 'original'}
                            type="button"
                            onClick={() => setActiveStyle(s.id)}
                            aria-pressed={activeStyle === s.id}
                            title={s.id ? `Paint ${s.displayName}` : 'Eraser — reveal the photo'}
                            className={`truncate rounded px-1.5 py-1 text-left text-[11px] transition ${
                              activeStyle === s.id
                                ? 'bg-mist text-ink'
                                : 'bg-white/5 text-slate-200 hover:bg-white/10'
                            }`}
                          >
                            {s.displayName}
                          </button>
                        ),
                      )}
                    </div>
                    <p className="px-0.5 pt-0.5 text-[10px] leading-snug text-slate-400">
                      Paint over the photo. Switching only affects new strokes; Original erases.
                    </p>
                  </div>
                )}
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

          {SHOW_AUDIO_CONTROLS && <AudioControls engine={engine} />}
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
          Loading scene…
        </div>
      )}
    </div>
  );
}
