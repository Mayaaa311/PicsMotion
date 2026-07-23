/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source and must be transpiled by Next.
  transpilePackages: [
    '@interactive-photo/audio-engine',
    '@interactive-photo/effects',
    '@interactive-photo/scene-runtime',
    '@interactive-photo/scene-schema',
    '@interactive-photo/presets',
    '@interactive-photo/shared',
  ],
};

export default nextConfig;
