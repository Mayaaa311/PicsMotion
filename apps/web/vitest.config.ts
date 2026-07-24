import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const pkg = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@interactive-photo/scene-schema': pkg('../../packages/scene-schema/src/index.ts'),
      '@interactive-photo/shared': pkg('../../packages/shared/src/index.ts'),
      '@interactive-photo/presets': pkg('../../packages/presets/src/index.ts'),
    },
  },
});
