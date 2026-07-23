'use client';

import { useAudioEngine } from '@interactive-photo/audio-engine';
import { presets } from '@interactive-photo/presets';
import { loadScene } from '@interactive-photo/scene-runtime';
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
