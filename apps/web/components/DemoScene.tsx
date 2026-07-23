'use client';

import { useAudioEngine } from '@interactive-photo/audio-engine';
import { SPIDERVERSE_PALETTES } from '@interactive-photo/effects';
import { presets } from '@interactive-photo/presets';
import { loadScene, useRuntimeStore } from '@interactive-photo/scene-runtime';
import type { PresetName, SceneDocument } from '@interactive-photo/scene-schema';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AudioControls } from './AudioControls';
import { InteractiveSceneDynamic } from './InteractiveSceneDynamic';

const SCENE_DIR = '/scenes/yosemite-falls';
const PRESET_NAMES = Object.keys(presets) as PresetName[];

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
  const spiderPalette = useRuntimeStore((s) => s.spiderPalette);
  const setSpiderPalette = useRuntimeStore((s) => s.setSpiderPalette);
  const activeStyle = useRuntimeStore((s) => s.activeStyle);
  const setActiveStyle = useRuntimeStore((s) => s.setActiveStyle);
  const [styles, setStyles] = useState<Array<{ id: string; displayName: string }>>([]);

  // The scene pulls normalized audio values imperatively each render frame.
  // Return null until a source is actually analysable, so the runtime skips all
  // audio work (and the debug panel reports "off") instead of seeing zeroed data.
  const getAudioFrame = useCallback(
    () => (engine && engine.canAnalyse ? engine.getFrame() : null),
    [engine],
  );

  useEffect(() => {
    let cancelled = false;
    loadScene(`${SCENE_DIR}/scene.json`)
      .then((doc) => {
        if (!cancelled) setScene(doc);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the AI style manifest for this scene, if styles have been generated.
  useEffect(() => {
    let cancelled = false;
    fetch(`${SCENE_DIR}/styles/manifest.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { styles?: Array<{ id: string; displayName: string }> }) => {
        if (!cancelled) setStyles(data.styles ?? []);
      })
      .catch(() => {
        /* no styles generated yet — the picker just won't show */
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
            assetBaseUrl={`${SCENE_DIR}/`}
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

            {/* Spider-Verse comic palette (Urban only). Auto cycles on beats. */}
            {preset === 'urban' && (
              <div className="mt-2 flex flex-col gap-1 border-t border-white/10 pt-2">
                <span className="px-1 font-mono text-[11px] uppercase tracking-wide text-slate-400">
                  Comic palette
                </span>
                {[{ label: 'Auto (beats)', i: -1 }, ...SPIDERVERSE_PALETTES.map((p, i) => ({ label: p.name, i }))].map(
                  ({ label, i }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setSpiderPalette(i)}
                      aria-pressed={spiderPalette === i}
                      className={`rounded px-3 py-1 text-left text-xs transition ${
                        spiderPalette === i
                          ? 'bg-mist text-ink'
                          : 'bg-white/5 text-slate-200 hover:bg-white/10'
                      }`}
                    >
                      {label}
                    </button>
                  ),
                )}
              </div>
            )}

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
