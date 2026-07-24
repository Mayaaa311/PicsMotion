'use client';

import { PerspectiveCamera } from '@react-three/drei';
import { CAMERA_DISTANCE } from '@interactive-photo/shared';

import { useRuntime } from '../context';

/** Default perspective camera looking down -Z at the stage plane. */
export function SceneCamera() {
  const { scene } = useRuntime();
  return (
    <PerspectiveCamera
      makeDefault
      position={[0, 0, CAMERA_DISTANCE]}
      fov={scene.camera.fov}
      near={0.1}
      far={100}
    />
  );
}
