'use client';

import { CAMERA_DISTANCE } from '@interactive-photo/shared';
import { useThree } from '@react-three/fiber';
import { useMemo } from 'react';

import { useRuntime } from '../context';
import { computeStageSize, visibleWorldSize } from '../math/coordinates';
import { LayerPlane } from './LayerPlane';

interface SceneContentProps {
  assetBaseUrl: string;
}

/**
 * Computes the contain-fit stage size for the current viewport, then renders the
 * layers back-to-front. Recomputes only when the viewport or camera FOV changes.
 */
export function SceneContent({ assetBaseUrl }: SceneContentProps) {
  const { scene } = useRuntime();
  const size = useThree((s) => s.size);

  const stage = useMemo(() => {
    const aspect = size.width / Math.max(1, size.height);
    const visible = visibleWorldSize(scene.camera.fov, CAMERA_DISTANCE, aspect);
    return computeStageSize(scene.aspectRatio, visible);
  }, [size.width, size.height, scene.camera.fov, scene.aspectRatio]);

  // Render far (depth→1) first so nearer layers paint on top.
  const ordered = useMemo(
    () => [...scene.layers].sort((a, b) => b.depth - a.depth),
    [scene.layers],
  );

  return (
    <group>
      {ordered.map((layer, index) => (
        <LayerPlane
          key={layer.id}
          layer={layer}
          stage={stage}
          index={index}
          assetBaseUrl={assetBaseUrl}
        />
      ))}
    </group>
  );
}
