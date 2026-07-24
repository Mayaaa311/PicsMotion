# Master Implementation Prompt: API-First AI Interactive Photo-to-Music Web Experience

You are the lead engineer and technical product architect responsible for building an interactive audiovisual web application that transforms a single photograph into a layered, depth-aware, music-responsive experience.

The application must accept an uploaded photograph, separate it into semantic visual components, reconstruct hidden background regions, estimate depth, and render the result as an interactive 2.5D webpage. Users should be able to move their cursor, drag visual components, and play music while the photograph reacts through preset-specific motion, lighting, particles, distortion, fog, and camera effects.

The product should feel like a photograph becoming a living world, not like a collection of draggable stickers.

Do not build five independent demos. Build one reusable scene engine with five configurable interaction presets.

---

# 0. Execution Mode, Existing Subagents, and Secret Safety

Assume the Claude Code skills and project subagents have already been installed and verified.

Do not reinstall skills or recreate subagents unless a required agent file is missing or invalid.

The main Claude session remains the orchestrator. It should inspect the existing `.claude/agents/` and `.claude/skills/` directories, use the installed agents according to the ownership rules in this specification, and avoid overlapping writes.

## Secret handling is mandatory

Before beginning implementation:

1. Confirm that `.env`, `.env.local`, `.env.*.local`, credentials files, and secret-manager artifacts are ignored by Git.
2. Confirm that no real API key appears in:
   - Git history
   - Source code
   - Markdown specifications
   - Test snapshots
   - Logs
   - Browser bundles
   - Screenshots
   - CI output
3. Create `.env.example` using placeholders only.
4. Read real credentials from server-side environment variables.
5. Never request that the user paste credentials into chat, prompts, issues, or source files.
6. Never print complete secrets, even during debugging.
7. Mask keys in diagnostics, for example `sk-...abcd`.
8. If a key is known or suspected to have been exposed, stop provider integration until the user rotates it.

Required server-side variables:


```bash
# SECURITY: The original spec contained real-looking API keys here. They were
# redacted by the coding agent on 2026-07-22 (real secrets must never live in a
# markdown spec, per section 0). Treat the originals as COMPROMISED and rotate
# them. Put freshly rotated values in a local, git-ignored .env only.
ANTHROPIC_API_KEY=sk-ant-api03-...REDACTED-ROTATE-THIS
OPENAI_API_KEY=sk-proj-...REDACTED-ROTATE-THIS
FAL_KEY=...REDACTED-ROTATE-THIS
BFL_API_KEY=bfl_...REDACTED-ROTATE-THIS
```

Recommended model configuration:

```bash
# Scene understanding and structured analysis
OPENAI_SCENE_MODEL=gpt-5.6-terra
ANTHROPIC_SCENE_MODEL=claude-sonnet-5
SCENE_ANALYSIS_PROVIDER=openai

# Image generation and editing
OPENAI_IMAGE_MODEL=gpt-image-2

# fal hosted computer-vision endpoints
FAL_LAYER_MODEL=fal-ai/qwen-image-layered
FAL_TEXT_SEGMENTATION_MODEL=fal-ai/evf-sam
FAL_MATTING_MODEL=fal-ai/birefnet/v2
FAL_DEPTH_MODEL=fal-ai/image-preprocessors/depth-anything/v2

# Provider selection
PRIMARY_SEGMENTATION_PROVIDER=fal
PRIMARY_DEPTH_PROVIDER=fal
PRIMARY_COMPLETION_PROVIDER=bfl
FALLBACK_COMPLETION_PROVIDER=openai
```

Model IDs must remain configurable. At startup, validate configured provider access and report unavailable optional providers without crashing the application.

The Anthropic key is optional for the product runtime if OpenAI is used for scene analysis. It may be used for an alternate scene-analysis adapter, evaluation, or Claude Code authentication, but the application must not require two language-model providers to start.


---

# 1. Product Vision

The user uploads a photograph.

The system:

1. Analyzes the image.
2. Identifies its main subject, supporting objects, foreground, midground, background, atmosphere, lighting, and approximate depth.
3. Extracts important objects into transparent visual layers.
4. Reconstructs the background hidden behind extracted objects.
5. Packages the result into a structured scene format.
6. Renders the scene as a responsive 2.5D environment.
7. Lets the user interact with the scene using cursor movement, dragging, clicking, scrolling, and optional device motion.
8. Analyzes uploaded or licensed music.
9. Selects or configures a suitable interaction preset.
10. Connects musical energy, frequency bands, beats, and sections to visual parameters.

The visual experience must preserve the original photograph’s subject hierarchy and emotional center.

The main subject should generally move less than foreground decorations and environmental elements.

---

# 2. Initial Interaction Presets

Implement these five presets.

## 2.1 Soft Nature / Acoustic

Intended for:

* Forests
* Beaches
* Mountains
* Lakes
* Flowers
* Wildlife
* Natural landscapes
* Soft outdoor portraits

Effects:

* Cursor behaves like wind.
* Plants bend gently away from the cursor.
* Plant bases remain anchored.
* Grass sways using procedural motion.
* Pollen, dust, leaves, or fireflies move subtly.
* Music controls environmental movement at low intensity.
* Fog drifts at multiple depths.
* Water reacts with pointer-generated ripples.
* Soft sunlight slowly changes intensity.
* Camera movement is slow and gentle.
* No aggressive flashing or strong camera shake.

Audio mapping:

* Bass controls broad wind strength and fog density.
* Low-mid frequencies control grass and plant sway.
* High frequencies control lightweight particles.
* Beat events create subtle sunlight pulses.
* Overall loudness slightly increases scene depth.

## 2.2 Urban / Hip-Hop

Intended for:

* Street photography
* Cars
* Buildings
* Fashion
* Graffiti
* Night cities
* Industrial environments

Effects:

* Foreground objects follow cursor movement with heavy inertia.
* Layers overshoot and settle slowly.
* Bass creates controlled camera impact.
* Foreground elements move more than distant layers.
* Graffiti fragments, paper scraps, paint particles, and geometry can appear.
* Depth zoom creates a strong push-in effect.
* Fast motion creates directional blur.
* Dragged objects should feel heavy rather than elastic.
* Effects should be rhythmic but not nauseating.

Audio mapping:

* Bass transients create camera impulses.
* Bass controls foreground depth displacement.
* Mid frequencies control environmental fragments.
* High frequencies control smaller particles.
* Strong beats create short depth-zoom impulses.
* Cursor velocity controls directional blur.

## 2.3 Dark / Mysterious

Intended for:

* Dark portraits
* Foggy forests
* Abandoned buildings
* Night photography
* Horror-adjacent scenes
* Moody interiors
* Low-key cinematic images

Effects:

* Cursor becomes a flashlight.
* The base scene is darkened.
* A radial reveal around the cursor shows the original or enhanced image.
* Flashlight movement should have slight inertia.
* Flashlight edges should be irregular using procedural noise.
* Hidden visual details can appear only under the flashlight.
* Fog moves in response to low frequencies.
* Shadows stretch and distort.
* Vignette strength changes dynamically.
* Optional volumetric light cone appears around the pointer.
* The result should feel atmospheric rather than like a simple circular mask.

Audio mapping:

* Bass controls fog movement and shadow deformation.
* Low-mid frequencies change flashlight radius slightly.
* Loudness controls vignette intensity.
* Strong beats create short shadow displacement.
* Quiet sections make hidden details easier to discover.

## 2.4 Electronic / Energetic

Intended for:

* Concert photography
* Neon scenes
* Futuristic images
* Abstract art
* Sports
* Cars
* Dance
* Technology imagery

Effects:

* Objects repel from the cursor.
* Small visual fragments use physical collisions.
* Layers snap, overshoot, and rebound elastically.
* Bass moves layers along the depth axis.
* Beats create visual pulses.
* Chromatic aberration reacts to motion and audio.
* Neon trails follow dragged objects.
* Particle bursts occur on selected beats.
* Bloom responds to musical energy.
* Scene intensity should be clamped to avoid visual chaos.

Audio mapping:

* Bass controls depth separation.
* Beat events trigger pulses and particle bursts.
* Mid frequencies control glow.
* High frequencies control sparks and trails.
* Cursor velocity controls chromatic separation.
* Musical drops can temporarily increase effect intensity.

## 2.5 Nostalgic / Folk

Intended for:

* Family photographs
* Travel memories
* Countryside scenes
* Vintage portraits
* Warm interiors
* Old architecture
* Folk or acoustic imagery

Effects:

* Visual layers look like paper cutouts or printed photographs.
* Each layer has slight thickness, border, and shadow.
* Dragging lifts a layer toward the camera.
* Lifted layers rotate slightly.
* Release returns the layer through a soft imperfect spring.
* Gentle handheld camera movement follows musical phrases.
* Film grain, dust, fading colors, and warm light are applied.
* Shadows grow when a layer is lifted.
* The scene should feel tactile and handmade.

Audio mapping:

* Loudness controls slight camera drift.
* Beat strength controls subtle layer movement.
* High frequencies illuminate dust.
* Musical phrases control warmth and fading.
* Quiet sections increase film grain visibility slightly.

---

# 3. Technical Stack

Use a monorepo.

## Frontend

Use:

* Next.js with App Router
* React
* TypeScript with strict mode
* Three.js
* React Three Fiber
* Drei
* React Postprocessing
* `@use-gesture/react`
* `@react-spring/three`
* `@react-three/rapier`
* Three.quarks or an equivalent Three.js-compatible particle system
* Zustand for application and editor state
* Zod for runtime validation
* Tailwind CSS for the application interface
* Web Audio API for real-time audio analysis
* Essentia.js for offline audio analysis where permitted

Use the latest stable package versions compatible with each other.

## Backend: API-First and CPU-Only

The application must run on a normal CPU-only development machine.

Use:

* Python 3.11+
* FastAPI
* Pydantic
* `httpx`
* Official OpenAI Python SDK
* Official Anthropic Python SDK as an optional provider
* `fal-client` or direct fal queue APIs
* Direct Black Forest Labs HTTP API adapter
* Pillow
* OpenCV
* NumPy
* Redis-backed job queue
* Celery, Dramatiq, or RQ
* PostgreSQL for project metadata
* S3-compatible object storage for images, masks, audio, and generated scene packages

Do not require:

* A local GPU
* CUDA
* cuDNN
* Local PyTorch inference
* Local Hugging Face model downloads
* Grounded SAM weights
* BiRefNet weights
* Depth Anything weights
* Qwen-Image-Layered weights
* LaMa or IOPaint weights
* Large local checkpoint storage

Local CPU work is limited to lightweight operations such as:

* Validation
* Metadata extraction
* Cropping and resizing
* Mask morphology
* Feathering
* Alpha compositing
* Color and grain matching
* Candidate scoring
* File conversion
* Scene packaging

## Hosted AI Providers

Use provider adapters rather than embedding vendor calls throughout the pipeline.

Primary hosted routing:

```text
Structured image understanding and typed scene analysis
    → OpenAI Responses API
    → optional Anthropic Messages API fallback

Initial structural layer proposal
    → fal-ai/qwen-image-layered

Natural-language semantic segmentation
    → fal-ai/evf-sam

Interactive point or box correction
    → hosted SAM-compatible provider adapter
    → fal endpoint if available for the selected account
    → otherwise use text segmentation plus brush correction

High-resolution alpha matting
    → fal-ai/birefnet/v2
    → fall back to fal-ai/birefnet if v2 is unavailable

Relative depth
    → fal-ai/image-preprocessors/depth-anything/v2

Routine hidden-background reconstruction
    → Black Forest Labs FLUX erase endpoint

Prompt-directed difficult reconstruction
    → Black Forest Labs FLUX editing/fill endpoint if available
    → otherwise fal hosted fill endpoint

Difficult semantic reconstruction fallback
    → OpenAI GPT Image 2 edit endpoint
```

Do not assume an endpoint exists merely from memory. Before implementing each provider adapter, inspect the current official API schema, pin the endpoint ID in configuration, and add a contract test using a mocked response.

## Development Infrastructure

Use:

* pnpm workspaces
* Docker Compose
* ESLint
* Prettier
* Ruff
* Pyright or mypy
* Vitest
* Playwright
* Pytest
* Storybook for isolated visual components where useful
* GitHub Actions for linting, testing, and builds

Provide:

* `README.md`
* `.env.example`
* Docker setup
* Local development commands
* Production deployment notes
* Sample scene assets
* Sample audio safe to redistribute
* Provider setup guide
* Cost-control guide
* Data-retention and privacy notes

---

# 4. Monorepo Structure

Create a structure similar to:

```text
interactive-photo/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── hooks/
│   │   ├── stores/
│   │   ├── public/
│   │   └── tests/
│   │
│   └── ai-service/
│       ├── api/
│       ├── workers/
│       ├── pipelines/
│       │   ├── scene_analysis/
│       │   ├── segmentation/
│       │   ├── matting/
│       │   ├── depth/
│       │   ├── inpainting/
│       │   └── packaging/
│       ├── models/
│       ├── schemas/
│       └── tests/
│
├── packages/
│   ├── scene-runtime/
│   ├── audio-engine/
│   ├── interaction-engine/
│   ├── effects/
│   ├── presets/
│   ├── scene-schema/
│   ├── editor-ui/
│   └── shared/
│
├── infrastructure/
│   ├── docker/
│   ├── migrations/
│   └── github/
│
├── examples/
│   ├── soft-nature/
│   ├── urban/
│   ├── dark/
│   ├── electronic/
│   └── nostalgic/
│
├── docker-compose.yml
├── pnpm-workspace.yaml
└── README.md
```

---

# 5. Scene Data Model

Create a versioned scene schema.

Example:

```ts
type SceneDocument = {
  version: "1.0";
  id: string;
  title: string;
  width: number;
  height: number;
  aspectRatio: number;
  originalImageUrl: string;
  backgroundPlateUrl: string;
  depthMapUrl?: string;
  preset: PresetName;
  visualAnalysis: VisualAnalysis;
  layers: SceneLayer[];
  atmosphere: AtmosphereConfig;
  camera: CameraConfig;
  audioBindings: AudioBinding[];
  metadata: {
    createdAt: string;
    pipelineVersion: string;
  };
};
```

Each layer should include:

```ts
type SceneLayer = {
  id: string;
  name: string;
  semanticLabel: string;
  role:
    | "background"
    | "distant"
    | "midground"
    | "secondary-subject"
    | "primary-subject"
    | "foreground"
    | "atmosphere";

  assetUrl: string;
  maskUrl?: string;
  alphaAssetUrl?: string;

  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  anchor: {
    x: number;
    y: number;
  };

  depth: number;
  depthVariance: number;
  baseScale: number;
  baseRotation: number;
  baseOpacity: number;

  movement: {
    enabled: boolean;
    maxOffsetX: number;
    maxOffsetY: number;
    maxOffsetZ: number;
    maxRotation: number;
    parallaxStrength: number;
    dragEnabled: boolean;
    returnMode: "spring" | "inertia" | "physics" | "fixed";
  };

  interactionTags: string[];
  materialTags: string[];
  audioSensitivity: {
    bass: number;
    lowMid: number;
    highMid: number;
    treble: number;
    beat: number;
    loudness: number;
  };

  importance: number;
  locked: boolean;

  revealBudget: {
    maxOffsetX: number;
    maxOffsetY: number;
    confidence: number;
    generatedCoverageMaskUrl?: string;
  };

  provenance: {
    visiblePixels: "original" | "generated" | "mixed";
    sourceImageHash: string;
    segmentationProvider?: string;
    mattingProvider?: string;
    completionProvider?: string;
    providerRequestIds?: string[];
  };
};
```

All schemas must be defined with Zod and mirrored through Python Pydantic models.

Reject malformed scene files with readable validation errors.

---

# 6. Shared Scene Runtime

Build a reusable `<InteractiveScene />` component.

Responsibilities:

* Load and validate `scene.json`.
* Load image textures.
* Display a loading progress state.
* Position layers using normalized coordinates.
* Preserve image composition across screen sizes.
* Support portrait and landscape scenes.
* Convert pointer position into image-space coordinates.
* Expose cursor velocity.
* Expose drag events.
* Handle render quality levels.
* Apply depth-aware parallax.
* Connect layers to audio values.
* Activate one preset configuration.
* Render postprocessing effects.
* Support pause, reduced motion, and mute.

Suggested component hierarchy:

```tsx
<InteractiveScene scene={scene}>
  <SceneCamera />
  <SceneBackground />
  <LayerStack />
  <AtmosphereRenderer />
  <ParticleRenderer />
  <PresetController />
  <PostProcessingPipeline />
  <AudioController />
  <InteractionOverlay />
</InteractiveScene>
```

Build an internal event bus with typed events:

```ts
type SceneEvent =
  | { type: "pointer-move"; position: Vector2; velocity: Vector2 }
  | { type: "drag-start"; layerId: string }
  | { type: "drag-move"; layerId: string; offset: Vector3 }
  | { type: "drag-end"; layerId: string; velocity: Vector2 }
  | { type: "beat"; strength: number; timestamp: number }
  | { type: "audio-frame"; frame: AudioFrame }
  | { type: "section-change"; section: AudioSection }
  | { type: "preset-change"; preset: PresetName };
```

Do not allow components to read arbitrary global state every animation frame. Use refs, selectors, and shared mutable frame data to minimize React rerenders.

---

# 7. Layer Rendering

Render photo layers as textured planes.

Requirements:

* Correct transparency.
* No visible rectangular borders.
* Preserve original pixel alignment.
* Use premultiplied alpha correctly.
* Avoid halos around extracted objects.
* Support object-space and screen-space effects.
* Maintain layer order.
* Use depth values for parallax but prevent accidental z-fighting.
* Keep the primary subject visually stable by default.

Implement:

* `LayerPlane`
* `LayerMaterial`
* `LayerHitArea`
* `LayerDragController`
* `LayerSpringController`
* `LayerPhysicsController`

Use simplified hit meshes rather than expensive pixel-perfect hit testing during the first milestone.

Add optional alpha-aware hit testing later.

---

# 8. Pointer Field

Create a reusable pointer field that exposes:

```ts
type PointerFieldState = {
  normalized: { x: number; y: number };
  imageSpace: { x: number; y: number };
  velocity: { x: number; y: number };
  speed: number;
  acceleration: number;
  isDown: boolean;
  lastInteractionTime: number;
};
```

Smooth cursor motion with configurable damping.

Support pointer types:

* Mouse
* Touch
* Pen

Add optional gyroscope support later.

---

# 9. Audio Engine

Create an `AudioEngine` independent of the rendering code.

Support:

* User-uploaded audio.
* Locally licensed demo audio.
* Play, pause, seek, mute, and volume.
* Audio context initialization after user interaction.
* Real-time frequency analysis.
* Offline beat and section analysis where permitted.
* Timeline events.
* Smoothed values for animation.

Create a stable frame structure:

```ts
type AudioFrame = {
  time: number;
  bass: number;
  lowMid: number;
  highMid: number;
  treble: number;
  loudness: number;
  spectralFlux: number;
  beatPulse: number;
};
```

Use exponential smoothing:

```ts
smoothed = previous + smoothingFactor * (current - previous);
```

Use separate attack and release values so effects respond quickly but decay smoothly.

Create a mapping system:

```ts
type AudioBinding = {
  source:
    | "bass"
    | "lowMid"
    | "highMid"
    | "treble"
    | "loudness"
    | "beatPulse";

  target: string;
  scale: number;
  offset: number;
  smoothing: number;
  clamp: [number, number];
  curve: "linear" | "easeIn" | "easeOut" | "exponential";
};
```

The rendering engine must consume normalized audio values rather than directly querying an analyser node.

---

# 10. Effect Modules

Implement effects as reusable modules.

## Required Shared Effects

* Pointer parallax
* Depth zoom
* Camera impulse
* Camera drift
* Wind deformation
* Water ripple
* Fog planes
* Volumetric fog approximation
* Flashlight reveal
* Shadow distortion
* Particle field
* Particle burst
* Bloom
* Vignette
* Film grain
* Chromatic aberration
* Directional blur
* Neon trail
* Paper cutout material
* Warm color fade
* Layer lift shadow

Each effect must have:

* Typed configuration.
* Sensible default values.
* Intensity clamping.
* Enable/disable control.
* Reduced-motion behavior.
* Cleanup logic.
* A small isolated demo or Storybook story where appropriate.

---

# 11. Soft Nature Implementation Details

Build Soft Nature first.

## Wind Shader

Implement a custom vertex shader.

The bottom of the plant should remain fixed.

Use UV height as the bend weight:

```glsl
float flexibility = pow(clamp(vUv.y, 0.0, 1.0), 2.0);
```

Combine:

* Cursor force
* Cursor velocity
* Procedural wind
* Audio wind
* Layer-specific stiffness

Conceptual formula:

```glsl
float proceduralWind =
    sin(uTime * uWindSpeed + position.y * uFrequency + uSeed)
    * uNaturalStrength;

float cursorDistance =
    distance(vUv, uCursorUv);

float cursorInfluence =
    1.0 - smoothstep(uInnerRadius, uOuterRadius, cursorDistance);

float bend =
    flexibility *
    (proceduralWind + cursorInfluence * uCursorStrength);
```

Apply the bend primarily to x and slightly to y.

Every plant layer should have a configurable stiffness.

## Fog

Use two or three transparent planes with animated procedural noise.

Parameters:

* Speed
* Scale
* Opacity
* Depth
* Drift direction
* Bass sensitivity
* Cursor sensitivity

Keep fog movement slow.

## Water Ripple

Create a ripple manager storing active ripples:

```ts
type Ripple = {
  center: [number, number];
  startTime: number;
  amplitude: number;
  frequency: number;
  decay: number;
};
```

Limit active ripples.

Trigger on:

* Pointer click inside water mask.
* Slow pointer drag over water.
* Selected beat events at low amplitude.

## Sunlight

Use a screen-space radial glow or world-space sprite.

Connect it to smoothed loudness and beat pulse.

Never flash at full intensity.

## Acceptance Criteria

Soft Nature is complete when:

* Pointer movement bends a plant layer away from the cursor.
* Plant roots remain visually anchored.
* Fog moves at multiple depths.
* Water can generate localized ripples.
* Particles move gently.
* Audio changes motion without overwhelming the image.
* The scene performs near 60 FPS on a normal desktop browser using a reasonable test image.

---

# 12. Nostalgic Implementation Details

Create a paper-cutout material.

Each layer should support:

* Optional cream border.
* Soft shadow.
* Slight thickness.
* Mild rotation.
* Texture grain.
* Lift state.

On drag:

1. Increase z position.
2. Increase shadow offset and softness.
3. Apply small rotation based on drag direction.
4. Reduce surrounding layer motion slightly.
5. Return with a soft spring after release.

Add:

* Film grain.
* Vignette.
* Dust.
* Warm color matrix.
* Slow exposure fading.
* Very subtle camera drift.

Avoid making the effect look like a scrapbook template unless configured intentionally.

---

# 13. Dark Implementation Details

Create a flashlight material.

Render:

* Darkened version of the scene.
* Original or enhanced version of the scene.
* Noise-distorted radial mask centered on smoothed cursor position.

Conceptual shader:

```glsl
float d = distance(vUv, uCursorUv);
float edgeNoise = noise(vUv * uNoiseScale + uTime * uNoiseSpeed);
float radius = uRadius + edgeNoise * uEdgeDistortion;
float reveal = 1.0 - smoothstep(radius, radius + uFeather, d);

vec3 darkScene = originalColor.rgb * uDarkness;
vec3 revealedScene = applyRevealGrade(originalColor.rgb);
vec3 finalColor = mix(darkScene, revealedScene, reveal);
```

Create fake shadow layers by:

* Duplicating the subject alpha.
* Applying blur.
* Offsetting it.
* Distorting it with noise.
* Modulating it with bass.

Add hidden detail support:

```ts
type HiddenDetail = {
  assetUrl: string;
  position: [number, number];
  revealOnly: true;
  revealThreshold: number;
};
```

---

# 14. Urban Implementation Details

Use `@react-spring/three` for large foreground layers.

Recommended starting parameters:

```ts
{
  mass: 4.5,
  tension: 110,
  friction: 24
}
```

Make all parameters configurable.

Implement camera impulses through an impulse accumulator:

```ts
type CameraImpulse = {
  translation: Vector3;
  rotation: Vector3;
  decay: number;
};
```

Do not directly overwrite camera coordinates from multiple effects.

Build a camera controller that combines:

* Base camera position
* Pointer parallax
* Audio depth zoom
* Camera drift
* Beat impulse
* User accessibility settings

Directional blur must follow cursor or camera velocity.

Limit blur intensity and disable it under reduced-motion settings.

---

# 15. Electronic Implementation Details

Use React Spring for primary semantic layers.

Use Rapier only for:

* Small fragments
* Independent decorative elements
* Collisions
* Repulsion effects
* Burst-and-return sequences

Do not assign full rigid-body simulation to the entire photograph.

Create a cursor repulsion body or mathematical force field.

Use object pooling for particles and fragments.

Create chromatic aberration values from:

```ts
aberration =
  base +
  pointerSpeed * pointerScale +
  beatPulse * beatScale;
```

Clamp the result.

Create neon trails for selected layers only.

Bloom should respond to a smoothed envelope rather than raw frequency bins.

---

# 16. Preset Configuration System

Create presets as serializable TypeScript objects.

Example:

```ts
export const softNaturePreset: ScenePreset = {
  id: "soft-nature",
  displayName: "Soft Nature",
  pointer: {
    mode: "wind",
    smoothing: 0.12,
    radius: 0.25,
    strength: 0.35
  },
  camera: {
    parallaxStrength: 0.16,
    zoomResponse: 0.03,
    shakeStrength: 0
  },
  particles: {
    type: "pollen",
    count: 350,
    speed: 0.08
  },
  postprocessing: {
    bloom: 0.08,
    vignette: 0.05,
    noise: 0.01,
    chromaticAberration: 0
  },
  audioBindings: []
};
```

A scene can override individual preset properties.

Do not hardcode preset-specific conditions throughout the runtime.

---

# 17. API-First Photo-Parsing and High-Fidelity Completion Pipeline

Do not integrate paid AI processing before the manual-layer scene runtime works.

The pipeline must preserve original photographic pixels wherever they were visible. The application is not an image-redrawing tool by default.

Core rule:

```text
final visible layer =
    original uploaded RGB pixels
    ×
    approved high-resolution alpha mask
```

Generative models may create only:

* Background regions that were hidden behind extracted objects
* Previously occluded portions revealed by permitted movement
* Small edge extensions
* Outpainted margins
* Missing parts of partially occluded objects
* User-approved creative regeneration

Original visible pixels must be composited over generated object completions.

## Pipeline Overview

```text
Upload original
  ↓
Validate, hash, orient, and create immutable source asset
  ↓
Structured scene analysis
  ↓
Structural layer proposal
  ↓
Semantic mask extraction
  ↓
Mask cleanup and alpha refinement
  ↓
Depth estimation
  ↓
Layer grouping and role assignment
  ↓
Reveal-budget planning
  ↓
Hidden-background reconstruction
  ↓
Candidate quality evaluation
  ↓
Original-pixel-preserving compositing
  ↓
Asset export and scene JSON generation
  ↓
User correction and approval
```

## 17.1 Immutable Original and Provenance

Never overwrite the uploaded original.

Store:

* Original file
* Normalized display copy
* Cryptographic hash
* EXIF orientation result
* Color profile information
* Original dimensions
* MIME type
* Upload timestamp

Every generated layer and background must record:

* Provider
* Model endpoint
* Provider request ID
* Input asset hashes
* Mask hash
* Prompt hash
* Seed when supported
* Creation time
* Candidate score
* User approval state

## 17.2 Structured Scene Analysis

Use `SceneAnalysisProvider`.

Default provider:

```text
OpenAI Responses API
Model: configurable through OPENAI_SCENE_MODEL
Suggested default: gpt-5.6-terra
```

Optional alternate provider:

```text
Anthropic Messages API
Model: configurable through ANTHROPIC_SCENE_MODEL
Suggested default: claude-sonnet-5
```

The provider must return JSON validated by Pydantic and Zod.

Required fields:

* Scene type
* Main subject
* Secondary subjects
* Foreground candidates
* Midground candidates
* Background
* Water regions
* Vegetation regions
* Sky regions
* Transparent or reflective regions
* Lighting direction
* Depth-of-field description
* Estimated camera style
* Dominant colors
* Mood
* Suggested interaction preset
* Suggested motion tags
* Suggested segmentation prompts
* Objects that should remain locked
* Expected segmentation difficulty
* Inpainting risk areas

Do not trust unrestricted prose.

Retry once with a repair prompt if structured validation fails. If it fails again, save the raw response and require manual layer planning.

## 17.3 Structural Layer Proposal

Use hosted Qwen Image Layered through the configured fal endpoint.

Default endpoint:

```text
fal-ai/qwen-image-layered
```

Use it to propose:

* Number of meaningful visual layers
* Semantic grouping
* Occlusion order
* Approximate full-object structure
* Background and atmosphere separation

Do not use the generated layer pixels as final high-resolution assets by default.

Treat outputs as structural guidance and compare them with original-image masks.

The final visible layer must still use the original photograph’s RGB pixels.

## 17.4 Semantic Segmentation

Use `SegmentationProvider`.

Default text-prompted endpoint:

```text
fal-ai/evf-sam
```

Inputs:

* Original or normalized image URL
* Positive prompt
* Optional negative prompt
* Optional bounding region derived from scene analysis
* Provider model version

Examples:

```text
foreground grass and flowers, excluding the person
the primary person in the center
the lake surface, excluding reflections of the person
distant buildings behind the car
```

Outputs:

* Binary or alpha mask URL
* Confidence
* Bounding box
* Label
* Provider request ID

Merge duplicate masks based on intersection-over-union, semantic label, and depth.

Do not automatically merge thin foreground occluders into the main subject.

## 17.5 Interactive Mask Correction

The editor must support:

* Positive clicks
* Negative clicks
* Bounding boxes
* Brush add
* Brush erase
* Feather control
* Edge preview
* Undo and redo

If a hosted point-prompt SAM endpoint is available and approved, call it through the backend or a restricted short-lived token.

The permanent `FAL_KEY` must never reach the browser.

The brush editor must work without an AI provider so the user can correct a mask even during provider outages.

## 17.6 Alpha Refinement

Use hosted BiRefNet through fal.

Preferred endpoint:

```text
fal-ai/birefnet/v2
```

Fallback:

```text
fal-ai/birefnet
```

Prioritize refinement for:

* Hair
* Fur
* Grass
* Leaves
* Thin branches
* Fabric
* Soft blurred edges
* Semi-transparent boundaries

Process a padded crop around the object.

Combine the refined alpha with the semantic mask to prevent leakage.

Required quality checks:

* No detached alpha islands above threshold
* No severe holes inside solid subjects
* No bright or dark halo
* Boundary gradient consistency
* User-visible edge preview against light and dark checkerboards

## 17.7 Depth Estimation

Use:

```text
fal-ai/image-preprocessors/depth-anything/v2
```

For each layer compute:

* Median depth
* Mean depth
* Depth variance
* Near percentile
* Far percentile
* Relative ordering confidence

Depth is used for relative ordering and interaction strength, not metric measurement.

Resolve conflicts using semantic reasoning and user correction.

## 17.8 Layer Grouping

Combine:

* Semantic role
* Relative depth
* Mask overlap
* Spatial location
* Object importance
* Visual composition
* Expected motion behavior
* Inpainting risk

Rules:

* Sky and distant landscape generally become background.
* Distant buildings may become a distant layer.
* The main subject remains independent.
* Closely connected vegetation may be grouped if their motion should match.
* Foreground occluders remain independent when moving them reveals useful depth.
* Tiny irrelevant masks should be merged or removed.
* Reflections and cast shadows should be explicitly associated with their source object or locked to the background.

The user must be able to override grouping.

## 17.9 Reveal Budget

Do not permit arbitrary drag distances.

Starting limits:

```text
Primary subject: 1–3% of image width
Large foreground object: 3–6%
Small decorative object: 5–10%
Background: parallax only
```

For each layer, calculate a reveal budget from:

* Amount of reconstructed hidden content
* Completion confidence
* Boundary confidence
* Object importance
* Scene composition
* Preset intensity

Create a generated-coverage mask showing which hidden pixels are safe to reveal.

Clamp all motion to this coverage.

## 17.10 Two-Mask Completion Strategy

Create:

1. `generation_mask`
   * Larger and dilated
   * Covers segmentation halos
   * May include cast shadows and reflections
   * Gives the model reconstruction room

2. `composite_mask`
   * Smaller
   * Feathered
   * Controls which generated pixels enter the final image

Never replace unmasked original pixels.

## 17.11 Crop-Based Hidden-Region Reconstruction

Do not regenerate the full photograph for a local hole.

For each region:

1. Compute the generation-mask bounding box.
2. Expand by 20–40% for context.
3. Preserve the original crop aspect and effective resolution.
4. Submit crop plus crop-relative mask.
5. Generate one candidate by default.
6. Generate up to three candidates only for low-confidence or user-requested cases.
7. Score candidates.
8. Composite only through the approved composite mask.

## 17.12 Completion Provider Routing

Create `ImageCompletionProvider`.

Primary routing:

```text
Routine masked removal
    → BFLFluxEraseProvider

Prompt-directed background continuation
    → BFLFluxEditProvider or configured BFL fill endpoint

Alternative hosted fill
    → FalImageFillProvider

Difficult semantic or human-centered failure
    → OpenAIGPTImage2Provider

Development and tests
    → MockCompletionProvider
```

Do not require every provider to be configured.

At least one real completion provider or mock provider must be available.

### Black Forest Labs erase behavior

The BFL erase adapter must support:

* Base64 or provider-supported image input
* Same-size black/white mask
* Configurable dilation
* Seed
* PNG output
* Async request ID
* Polling URL returned by the service
* Webhook option
* Cost metadata

Always use the returned polling URL rather than reconstructing it.

### OpenAI image fallback

Use:

```text
OPENAI_IMAGE_MODEL=gpt-image-2
```

Use it for:

* Semantically difficult backgrounds
* Human-centered reconstruction
* Missing object completion
* Repairing an unacceptable BFL candidate

Preserve original visible pixels when compositing the output.

## 17.13 Photographic Matching

Estimate surrounding:

* White balance
* Exposure
* Contrast
* Saturation
* Sharpness
* Noise and grain
* Depth of field
* Blur
* Lighting direction

After generation, conservatively match:

* Color statistics
* Edge sharpness
* Local blur
* Grain amplitude
* Dynamic range

The generated patch must not look cleaner, sharper, smoother, or more saturated than the original.

Do not apply generative restoration to the full photograph.

## 17.14 Candidate Evaluation

Score each candidate using:

* Boundary color difference
* Boundary gradient difference
* Texture-frequency consistency
* Semantic consistency
* Depth consistency
* Unexpected-object penalty
* Face corruption risk
* Text corruption risk
* Visible seam penalty

Suggested normalized score:

```text
25% boundary consistency
20% color consistency
20% semantic compatibility
15% texture compatibility
10% depth compatibility
10% artifact penalty
```

If confidence is below threshold, show up to three candidates in the editor.

Do not silently choose a poor candidate.

## 17.15 Provider Interfaces

Implement interfaces resembling:

```python
from typing import Protocol

class SceneAnalysisProvider(Protocol):
    async def analyze_scene(self, image_url: str) -> "VisualAnalysis":
        ...


class LayerProposalProvider(Protocol):
    async def propose_layers(
        self,
        image_url: str,
        *,
        number_of_layers: int,
        prompt: str | None = None,
    ) -> "LayerProposalResult":
        ...


class SegmentationProvider(Protocol):
    async def segment_text(
        self,
        image_url: str,
        prompt: str,
        *,
        negative_prompt: str | None = None,
    ) -> "SegmentationResult":
        ...


class MattingProvider(Protocol):
    async def refine_alpha(
        self,
        image_url: str,
        *,
        model_variant: str,
    ) -> "MattingResult":
        ...


class DepthProvider(Protocol):
    async def estimate_depth(self, image_url: str) -> "DepthResult":
        ...


class ImageCompletionProvider(Protocol):
    async def erase_masked_region(
        self,
        image_url: str,
        mask_url: str,
        *,
        dilation_pixels: int,
        seed: int | None = None,
    ) -> list["CompletionCandidate"]:
        ...

    async def fill_masked_region(
        self,
        image_url: str,
        mask_url: str,
        prompt: str,
    ) -> list["CompletionCandidate"]:
        ...
```

Implement:

```text
OpenAISceneAnalysisProvider
AnthropicSceneAnalysisProvider
FalQwenLayeredProvider
FalEVFSAMProvider
FalBiRefNetProvider
FalDepthAnythingProvider
BFLFluxEraseProvider
BFLFluxEditProvider
FalImageFillProvider
OpenAIGPTImage2Provider
MockSceneAnalysisProvider
MockSegmentationProvider
MockDepthProvider
MockCompletionProvider
```

## 17.16 Asynchronous Job Architecture

Do not block an HTTP request across several hosted model calls.

Use:

```text
Client upload
    ↓
Create pipeline job
    ↓
Queue stage
    ↓
Submit provider request
    ↓
Persist request ID and polling URL
    ↓
Poll or receive webhook
    ↓
Download and validate output
    ↓
Copy into project-controlled storage
    ↓
Advance stage and report progress
```

Store for every provider request:

* Provider
* Endpoint ID
* Model version
* Request ID
* Polling URL where applicable
* Input asset IDs
* Submission time
* Completion time
* Status
* Retry count
* Cost metadata
* Output asset IDs
* Error details

## 17.17 Failure, Retry, and Cancellation

Support:

* Timeout
* Exponential backoff
* Cancellation
* Provider unavailable
* Malformed output
* Partial result recovery
* Manual retry
* Mock mode
* Fallback routing

Maximum automatic retries:

```text
Rate limit: 3
Temporary provider error: 2
Malformed output: 1
Permanent validation error: 0
```

Never retry indefinitely.

## 17.18 Cost Controls

Implement:

* Per-user generation limits
* Maximum input resolution
* Maximum candidate count
* Cost estimate before processing
* Daily spending cap
* Provider usage logging
* Development mock mode
* Cache based on image hash, mask hash, endpoint, version, and parameters

Do not call a provider again when the inputs and versioned configuration are unchanged.

## 17.19 Privacy and Retention

* Use signed, expiring URLs for private source images.
* Copy provider outputs into controlled storage.
* Delete temporary provider-facing assets after the configured retention period.
* Provide a user action to delete the project and generated assets.
* Document which external providers receive image content.
* Do not upload images to more providers than necessary.
* Do not send private images to fallback providers without user-visible disclosure and consent.

## 17.20 Packaging

Export:

```text
scene/
├── original/
│   ├── source
│   └── normalized.webp
├── background.webp
├── depth.webp
├── preview.webp
├── scene.json
├── layers/
│   ├── primary-subject.webp
│   ├── foreground-vegetation.webp
│   └── ...
├── masks/
│   ├── semantic/
│   ├── refined/
│   ├── generation/
│   ├── composite/
│   └── generated-coverage/
└── analysis/
    ├── visual-analysis.json
    ├── layer-proposals.json
    ├── provider-requests.json
    ├── candidate-scores.json
    └── pipeline-report.json
```

---

# 18. Manual Scene Editor

Build a correction interface after the core runtime.

The user should be able to:

* Preview all layers.
* Toggle visibility.
* Reorder layers.
* Rename layers.
* Mark the primary subject.
* Merge layers.
* Delete irrelevant layers.
* Adjust depth.
* Adjust movement strength.
* Change semantic role.
* Refine masks using positive and negative clicks.
* Paint mask corrections.
* Preview each interaction preset.
* Change audio sensitivity.
* Save and republish the scene.

Provide undo and redo.

Store edits separately from the original AI output.

---

# 19. Spotify Boundary

Architect Spotify as an optional adapter, not as a dependency of the visual engine.

Allowed product functions may include:

* Account authentication.
* Playlist browsing.
* Track selection.
* Track metadata.
* Opening or controlling playback where permitted.

Do not make the core visual engine depend on access to Spotify audio data.

Do not analyze, download, ingest, or synchronize Spotify audio unless the implementation has been explicitly reviewed for current Spotify policy compliance.

For full audio-reactive behavior, prioritize:

* User-uploaded music.
* Creator-owned music.
* Properly licensed music.
* Demo tracks included with permission.

Create an `AudioSourceAdapter` interface:

```ts
interface AudioSourceAdapter {
  load(): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(time: number): Promise<void>;
  getCurrentTime(): number;
  getDuration(): number;
  supportsSignalAnalysis: boolean;
}
```

Implement:

* `UploadedAudioAdapter`
* `LicensedLibraryAdapter`
* Placeholder `SpotifyPlaybackAdapter`

---

# 20. Performance Requirements

Target:

* Approximately 60 FPS on desktop for normal scenes.
* Graceful reduction to 30 FPS on weaker devices.
* Fast initial preview using compressed assets.
* Deferred loading of high-resolution textures.
* Texture-size limits.
* Particle limits by quality tier.
* Device-pixel-ratio clamping.
* Pause rendering when the page is hidden.
* Stop unnecessary animation when no effect is active.
* Use object pooling.
* Avoid allocating objects inside `useFrame`.
* Avoid React state updates every frame.
* Dispose textures, materials, geometries, render targets, and audio nodes.

Create quality levels:

```ts
type QualityLevel = "low" | "medium" | "high";
```

Automatically choose a starting level and allow manual override.

---

# 21. Accessibility

Support:

* Reduced motion.
* Mute.
* Keyboard navigation.
* Visible focus indicators.
* Pause effects.
* Disable camera shake.
* Disable flashing.
* Adjustable interaction intensity.
* Text alternatives describing the scene.
* Mobile touch support.
* High-contrast editor controls.

When `prefers-reduced-motion` is enabled:

* Disable camera shake.
* Reduce parallax.
* Disable strong depth pulses.
* Reduce particles.
* Disable directional blur.
* Reduce chromatic aberration.
* Preserve the core image and audio experience.

---

# 22. Testing Strategy

## Unit Tests

Test:

* Scene schema validation.
* Preset merging.
* Audio value smoothing.
* Frequency-band normalization.
* Beat event dispatch.
* Layer sorting.
* Depth normalization.
* Interaction parameter clamping.
* Camera impulse decay.
* Scene migration between schema versions.

## Integration Tests

Test:

* Loading a scene package.
* Switching presets.
* Uploading audio.
* Playing and pausing.
* Dragging a layer.
* Saving editor changes.
* Parsing pipeline job status.
* Failed asset loading.
* Invalid scene JSON.
* Backend timeout handling.

## Visual Tests

Use deterministic screenshots for:

* Default scene.
* Soft Nature.
* Nostalgic.
* Dark flashlight.
* Urban bass impulse.
* Electronic beat pulse.
* Reduced-motion mode.
* Mobile layout.

Disable nondeterministic particle behavior during visual tests.

## Performance Tests

Measure:

* Average FPS.
* Texture memory.
* Scene load time.
* Main-thread blocking.
* Number of draw calls.
* Particle count.
* GPU render time where possible.

---

# 23. Subagent System

Use one orchestrator and specialized implementation agents.

Agents must work from shared contracts rather than modifying each other’s modules unpredictably.

## 23.1 Orchestrator Agent

Responsibilities:

* Maintain the implementation plan.
* Break milestones into bounded tasks.
* Assign tasks to subagents.
* Define interfaces before parallel work begins.
* Review all changes.
* Resolve integration conflicts.
* Run final tests.
* Update project documentation.
* Prevent duplicated implementations.

The orchestrator owns:

* Root architecture
* Shared types
* Scene schema
* Integration branch
* Milestone tracking
* Definition of done

The orchestrator must not let agents independently invent incompatible event formats or configuration structures.

## 23.2 Scene Runtime Agent

Owns:

* React Three Fiber canvas
* Scene loading
* Layer planes
* Depth positioning
* Pointer coordinates
* Render loop
* Responsive camera
* Asset lifecycle
* Quality settings

Deliverables:

* `packages/scene-runtime`
* Sample manually layered scene
* Runtime tests
* Runtime documentation

## 23.3 Interaction and Physics Agent

Owns:

* Drag handling
* React Spring behavior
* Heavy inertia
* Elastic motion
* Cursor repulsion
* Rapier fragment physics
* Pointer force field
* Snap-back systems

Must use shared event and preset contracts.

## 23.4 Shader and Visual Effects Agent

Owns:

* Wind shader
* Water ripple shader
* Flashlight shader
* Shadow distortion
* Directional blur
* Paper material
* Fog
* Postprocessing
* Chromatic aberration bindings
* Visual effect cleanup

Each shader must expose documented uniforms.

## 23.5 Audio Agent

Owns:

* Audio playback
* Web Audio API graph
* Frequency bands
* Beat events
* Value smoothing
* Offline analysis adapter
* Audio binding engine
* Timeline synchronization

The audio agent must not directly modify scene components.

It provides normalized values and typed events.

## 23.6 Preset Agent

Owns:

* Five preset configuration objects
* Preset-specific combinations
* Default intensity values
* Scene overrides
* Preset documentation
* Preset demo pages

The preset agent must reuse shared effects rather than duplicating effect code.

## 23.7 AI Pipeline Agent

Owns:

* FastAPI provider-orchestration endpoints
* Async job orchestration
* OpenAI and optional Anthropic scene-analysis adapters
* fal layer-proposal, segmentation, matting, and depth adapters
* Black Forest Labs erase/edit adapters
* OpenAI GPT Image 2 completion fallback
* Mask morphology and alpha compositing
* Layer grouping
* Reveal-budget calculation
* Candidate scoring
* Scene packaging
* Provider request records
* Pipeline reports
* Mock-provider mode
* Cost controls
* Privacy and retention behavior

This agent begins after the manual runtime milestone is stable.

It must not install or run large local models.

It must not expose permanent API keys to browser code.

It must verify current official provider schemas before implementing an endpoint and must keep model IDs configurable.

## 23.8 Editor UX Agent

Owns:

* Upload flow
* Project page
* Layer panel
* Depth editor
* Preset selector
* Audio controls
* Mask correction interface
* Undo and redo
* Save and publish flow
* Error and loading states

## 23.9 QA and Performance Agent

Owns:

* Test plan
* Playwright tests
* Visual snapshots
* Performance benchmarks
* Accessibility audits
* Memory leak checks
* Browser compatibility
* Mobile testing

This agent should review every milestone, not only the final release.

---

# 24. Subagent Coordination Protocol

Before parallel implementation:

1. Orchestrator defines shared schemas.
2. Orchestrator defines public interfaces.
3. Agents acknowledge dependencies.
4. Agents work only inside assigned modules unless explicitly authorized.
5. Every agent writes or updates module documentation.
6. Every handoff includes:

   * Files changed
   * Public interfaces
   * Tests added
   * Known limitations
   * Integration instructions
7. Orchestrator reviews and merges.
8. QA agent validates the integrated result.

Use small commits.

Commit examples:

```text
feat(scene-runtime): add normalized layer positioning
feat(audio-engine): expose smoothed frequency bands
feat(effects): implement cursor wind shader
feat(presets): add soft nature configuration
test(scene-runtime): validate portrait composition
```

Do not combine unrelated refactors with feature implementation.

---

# 25. Milestone Plan

## Milestone 0: Foundation

Create:

* Monorepo
* Next.js app
* FastAPI service
* Shared schemas
* Docker Compose
* Linting
* Testing
* CI
* Sample assets

Definition of done:

* Web and API start locally.
* CI passes.
* Scene schema validates in TypeScript and Python.
* README contains exact setup commands.

## Milestone 1: Manual Layer Scene

Use a manually separated nature photograph.

Build:

* Scene loader
* Layer rendering
* Depth ordering
* Pointer parallax
* Responsive canvas
* Loading progress
* Quality settings

Definition of done:

* The photo renders as three to five aligned layers.
* Cursor movement creates subtle depth.
* Composition remains stable on mobile and desktop.

## Milestone 2: Audio Engine

Build:

* Audio upload
* Playback
* Frequency analysis
* Beat pulse
* Audio frame smoothing
* Binding configuration

Definition of done:

* Scene receives normalized audio values.
* Audio can play, pause, seek, and mute.
* Visual parameters can be mapped declaratively.

## Milestone 3: Soft Nature

Build:

* Wind shader
* Fog
* Water ripple
* Particles
* Soft sunlight
* Audio bindings

Definition of done:

* Soft Nature feels coherent and polished.
* Motion remains subtle.
* Runtime meets performance target.

## Milestone 4: Nostalgic and Dark

Build Nostalgic first, then Dark.

Reuse:

* Layer dragging
* Postprocessing
* Particle systems
* Camera system
* Audio engine

Definition of done:

* Each preset has a distinct visual identity.
* Presets do not duplicate runtime logic.
* Reduced-motion mode works.

## Milestone 5: Urban and Electronic

Build:

* Heavy inertia
* Camera impulses
* Directional blur
* Depth zoom
* Rapier fragments
* Repulsion
* Chromatic aberration
* Neon trails
* Particle bursts

Definition of done:

* Effects are responsive but controlled.
* Physics cleanup works.
* Performance remains acceptable.

## Milestone 6: Editor

Build:

* Layer list
* Depth controls
* Interaction controls
* Preset preview
* Audio sensitivity
* Save and load

Definition of done:

* A user can customize a manual scene without editing code.

## Milestone 7: Hosted Automatic Parsing and Completion

Integrate:

* OpenAI structured scene analysis
* fal structural layer proposal
* fal semantic segmentation
* Manual and optional hosted interactive correction
* fal alpha matting
* fal depth estimation
* Layer grouping
* Reveal-budget calculation
* BFL hidden-background reconstruction
* GPT Image 2 fallback
* Candidate scoring
* Original-pixel-preserving compositing
* Provider cost and request tracking
* Packaging

Definition of done:

* A CPU-only machine can run the complete application.
* No local model weights are downloaded.
* A suitable photograph can become a draft interactive scene.
* Visible layer pixels are sourced from the original photograph.
* Hidden regions can be reconstructed through a hosted provider.
* The user can correct masks and reject generated candidates.
* Provider failures produce readable reports and retry controls.
* API usage and estimated cost are recorded.
* Secrets never enter browser bundles or logs.

## Milestone 8: Publishing

Build:

* Project persistence
* Shareable URL
* Full-screen player
* Social preview
* Public/private controls
* Asset optimization

---

# 26. First Implementation Task

Begin with Milestones 0 and 1.

Do not begin with the AI models.

Create one manually layered Soft Nature example containing:

* Background sky or mountain layer
* Midground trees or lake
* Main subject
* Foreground grass or flowers
* Optional fog overlay

Implement:

1. Monorepo foundation.
2. Scene schema.
3. Scene loader.
4. Layer plane rendering.
5. Depth ordering.
6. Responsive camera.
7. Cursor parallax.
8. Debug panel showing:

   * FPS
   * Pointer coordinates
   * Layer depth
   * Active preset
   * Quality setting
9. Unit tests.
10. Playwright smoke test.

After Milestone 1 works, implement the audio engine and Soft Nature effects.

Do not make paid AI-provider calls during Milestones 0–5 except for an explicitly approved provider smoke test.

Create mock provider responses and contract fixtures first.

Before Milestone 7, implement a provider-readiness command that validates which credentials are present without printing them.

---

# 26.1 Local Environment and Credential Setup

Generate `.env.example` with placeholders only:

```bash
# Optional runtime use of Anthropic
ANTHROPIC_API_KEY=
ANTHROPIC_SCENE_MODEL=claude-sonnet-5

# OpenAI scene analysis and image fallback
OPENAI_API_KEY=
OPENAI_SCENE_MODEL=gpt-5.6-terra
OPENAI_IMAGE_MODEL=gpt-image-2

# fal hosted vision models
FAL_KEY=
FAL_LAYER_MODEL=fal-ai/qwen-image-layered
FAL_TEXT_SEGMENTATION_MODEL=fal-ai/evf-sam
FAL_MATTING_MODEL=fal-ai/birefnet/v2
FAL_DEPTH_MODEL=fal-ai/image-preprocessors/depth-anything/v2

# Black Forest Labs completion
BFL_API_KEY=
BFL_ERASE_ENDPOINT=https://api.bfl.ai/v1/flux-tools/erase-v1

# Provider routing
SCENE_ANALYSIS_PROVIDER=openai
PRIMARY_SEGMENTATION_PROVIDER=fal
PRIMARY_DEPTH_PROVIDER=fal
PRIMARY_COMPLETION_PROVIDER=bfl
FALLBACK_COMPLETION_PROVIDER=openai

# Application
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/interactive_photo
REDIS_URL=redis://localhost:6379/0
PUBLIC_WEB_BASE_URL=http://127.0.0.1:3000
PUBLIC_API_BASE_URL=http://127.0.0.1:8000

# Object storage
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET=interactive-photo

# Webhooks
BFL_WEBHOOK_SECRET=
FAL_WEBHOOK_SECRET=

# Development controls
AI_PROVIDER_MODE=mock
MAX_DAILY_AI_COST_USD=5
MAX_CANDIDATES_PER_REGION=1
```

The user must create `.env` locally and place newly rotated credentials there.

The coding agent must never write real secret values.

`.gitignore` must include:

```gitignore
.env
.env.local
.env.*.local
*.pem
credentials.json
secrets/
provider-debug/
```

Create:

```text
scripts/check-secrets.sh
scripts/provider-doctor.py
```

`check-secrets.sh` should scan tracked files and pending changes for likely secret formats without printing the full matches.

`provider-doctor.py` should:

* Report which provider variables are present
* Mask values
* Validate lightweight authentication where a low-cost endpoint exists
* Avoid generation by default
* Return a nonzero exit code only when a required provider for the selected mode is unavailable

---

# 27. Coding Standards

Use:

* TypeScript strict mode.
* No `any` unless documented and unavoidable.
* Small focused components.
* Pure utility functions.
* Typed shader uniforms.
* Centralized constants.
* Explicit cleanup.
* Error boundaries.
* Readable names.
* Comments explaining non-obvious graphics mathematics.
* No unexplained magic numbers.
* No hardcoded scene-specific logic inside reusable packages.

For every significant feature:

1. Implement.
2. Add tests.
3. Add documentation.
4. Add a demo.
5. Run linting.
6. Run type checking.
7. Run tests.
8. Record known limitations.

---

# 28. Product Quality Rules

Always prioritize:

1. Preserving original photographic pixels.
2. Stable composition.
3. Smooth interaction.
4. Emotional coherence.
5. Controlled audio response.
6. Accessibility.
7. Performance.
8. Visual novelty.

Avoid:

* Excessive motion.
* Constant camera shaking.
* Effects unrelated to the image.
* Layer edges that look like stickers.
* Uncontrolled particle counts.
* Flashing on every beat.
* Making every object draggable.
* Moving the main subject too aggressively.
* Running AI models synchronously in a web request.
* Depending on Spotify for the core experience.
* Regenerating complete visible layers when the original pixels exist.
* Exposing provider credentials to browser code.
* Running large AI models locally.
* Calling paid providers repeatedly for unchanged inputs.
* Silently sending private images to fallback providers.

---

# 29. Final Definition of Done

The initial product is complete when a user can:

1. Upload or select a suitable photograph.
2. Receive a layered draft scene.
3. Correct the major layers.
4. Choose one of five interaction presets.
5. Upload a music track.
6. Preview synchronized interactions.
7. Adjust effect intensity.
8. Save the project.
9. Publish a shareable full-screen webpage.
10. Use the experience smoothly on desktop and mobile.
11. Run the full AI pipeline from a CPU-only machine through hosted APIs.
12. Preserve original visible pixels and identify generated regions.
13. Review and reject uncertain background completions.
14. Delete their source and generated assets.
15. View approximate AI-provider usage and cost.

The final result should communicate this product promise:

“A photograph that understands how it wants to move—and uses music to come alive.”


---

# 30. Orchestrator Start Command

When this specification is given to Claude Code, begin with this behavior:

1. Read this entire specification.
2. Inspect the existing repository, installed skills, and `.claude/agents/`.
3. Do not reinstall skills or subagents.
4. Run a secret scan before modifying files.
5. Confirm that no real provider credentials are tracked.
6. Create or update the milestone plan.
7. Begin with Milestone 0 and Milestone 1 only.
8. Use mock AI providers until the manual scene runtime, audio engine, and first preset are stable.
9. Delegate only bounded, non-overlapping tasks to installed subagents.
10. Stop after each milestone, run QA, summarize evidence, and continue only when acceptance criteria pass.

Do not skip architecture to produce a visually impressive but non-reusable demo.

Do not put API keys into code, prompts, documentation, tests, browser storage, or Git.
