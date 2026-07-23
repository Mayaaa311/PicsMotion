import { notFound } from 'next/navigation';

import { presets } from '@interactive-photo/presets';
import type { PresetName } from '@interactive-photo/scene-schema';

import { DemoScene } from '@/components/DemoScene';

const VALID = new Set(Object.keys(presets));

/** Pre-render a route for each known preset. */
export function generateStaticParams() {
  return Object.keys(presets).map((preset) => ({ preset }));
}

export default function DemoPage({ params }: { params: { preset: string } }) {
  if (!VALID.has(params.preset)) {
    notFound();
  }
  return <DemoScene initialPreset={params.preset as PresetName} />;
}
