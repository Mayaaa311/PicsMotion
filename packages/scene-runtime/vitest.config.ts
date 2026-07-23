import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@interactive-photo/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
      '@interactive-photo/scene-schema': fileURLToPath(
        new URL('../scene-schema/src/index.ts', import.meta.url),
      ),
      '@interactive-photo/presets': fileURLToPath(
        new URL('../presets/src/index.ts', import.meta.url),
      ),
    },
  },
});
