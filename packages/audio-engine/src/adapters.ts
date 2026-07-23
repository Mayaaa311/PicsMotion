/**
 * Audio source adapters. Each adapter owns exactly one `HTMLAudioElement` (or,
 * for sources that cannot expose one, `null`) and knows how to load/control
 * its own playback. The `AudioEngine` is the only consumer that wires a
 * media element into the Web Audio graph — adapters never touch
 * `AudioContext`/`AnalyserNode` themselves.
 *
 * IMPORTANT: no adapter may touch `document`/`window` at module load time —
 * only inside methods — so this module can be imported safely in Node (e.g.
 * for tests) without a DOM present.
 */

export interface AudioSourceAdapter {
  load(): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(time: number): Promise<void>;
  getCurrentTime(): number;
  getDuration(): number;
  supportsSignalAnalysis: boolean;
  getMediaElement(): HTMLAudioElement | null;
}

/**
 * Adapters that own DOM resources (object URLs, media elements) additionally
 * implement this so the engine can release them deterministically. Not part
 * of the core `AudioSourceAdapter` contract — callers that only depend on
 * `AudioSourceAdapter` are not required to call it.
 */
export interface DisposableAudioSourceAdapter extends AudioSourceAdapter {
  /** Releases the media element and any owned object URLs. Idempotent. */
  dispose(): void;
}

function assertDomAvailable(adapterName: string): void {
  if (typeof document === 'undefined') {
    throw new Error(`${adapterName} requires a DOM environment (no \`document\` found).`);
  }
}

function loadHtmlAudioElement(src: string, errorContext: string): Promise<HTMLAudioElement> {
  const audio = new Audio();
  audio.crossOrigin = 'anonymous';
  audio.preload = 'auto';
  audio.src = src;

  return new Promise<HTMLAudioElement>((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('error', onError);
    };
    const onLoaded = () => {
      cleanup();
      resolve(audio);
    };
    const onError = () => {
      cleanup();
      reject(new Error(`Failed to load audio (${errorContext}).`));
    };
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('error', onError);
    audio.load();
  });
}

/** Loads audio the end user uploaded directly (a `File`/`Blob`, or an already-created object URL string). */
export class UploadedAudioAdapter implements DisposableAudioSourceAdapter {
  readonly supportsSignalAnalysis = true;

  private readonly source: File | Blob | string;
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private ownsObjectUrl = false;

  constructor(source: File | Blob | string) {
    this.source = source;
  }

  async load(): Promise<void> {
    assertDomAvailable('UploadedAudioAdapter');

    let src: string;
    if (typeof this.source === 'string') {
      src = this.source;
    } else {
      this.objectUrl = URL.createObjectURL(this.source);
      this.ownsObjectUrl = true;
      src = this.objectUrl;
    }

    this.audio = await loadHtmlAudioElement(src, 'uploaded file');
  }

  async play(): Promise<void> {
    await this.audio?.play();
  }

  async pause(): Promise<void> {
    this.audio?.pause();
  }

  async seek(time: number): Promise<void> {
    if (this.audio) this.audio.currentTime = time;
  }

  getCurrentTime(): number {
    return this.audio?.currentTime ?? 0;
  }

  getDuration(): number {
    return this.audio?.duration ?? 0;
  }

  getMediaElement(): HTMLAudioElement | null {
    return this.audio;
  }

  dispose(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
      this.audio = null;
    }
    if (this.ownsObjectUrl && this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
      this.ownsObjectUrl = false;
    }
  }
}

/** Loads audio from a licensed music-library URL (e.g. a CDN-hosted track). */
export class LicensedLibraryAdapter implements DisposableAudioSourceAdapter {
  readonly supportsSignalAnalysis = true;

  private readonly url: string;
  private audio: HTMLAudioElement | null = null;

  constructor(url: string) {
    this.url = url;
  }

  async load(): Promise<void> {
    assertDomAvailable('LicensedLibraryAdapter');
    this.audio = await loadHtmlAudioElement(this.url, this.url);
  }

  async play(): Promise<void> {
    await this.audio?.play();
  }

  async pause(): Promise<void> {
    this.audio?.pause();
  }

  async seek(time: number): Promise<void> {
    if (this.audio) this.audio.currentTime = time;
  }

  getCurrentTime(): number {
    return this.audio?.currentTime ?? 0;
  }

  getDuration(): number {
    return this.audio?.duration ?? 0;
  }

  getMediaElement(): HTMLAudioElement | null {
    return this.audio;
  }

  dispose(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
      this.audio = null;
    }
  }
}

/**
 * Placeholder adapter for Spotify playback. Spotify's playback SDKs do not
 * expose raw PCM/frequency data (and doing so would run counter to their
 * platform policies), so this adapter intentionally CANNOT perform signal
 * analysis and cannot be used as an audio-reactive source. It exists only so
 * the UI can represent "Spotify" as a source option and explain why it is
 * unavailable for the audio-reactive engine. Do not extend this to analyze
 * Spotify audio — that is out of scope by design.
 */
export class SpotifyPlaybackAdapter implements AudioSourceAdapter {
  readonly supportsSignalAnalysis = false;

  async load(): Promise<void> {
    throw new Error(
      'SpotifyPlaybackAdapter is not implemented: Spotify does not expose raw audio signal ' +
        'for analysis, and depending on Spotify for the core audio-reactive engine is out of ' +
        'scope. This requires product/policy review before any implementation is attempted.',
    );
  }

  async play(): Promise<void> {
    throw new Error('SpotifyPlaybackAdapter.play is not implemented (see load()).');
  }

  async pause(): Promise<void> {
    throw new Error('SpotifyPlaybackAdapter.pause is not implemented (see load()).');
  }

  async seek(): Promise<void> {
    throw new Error('SpotifyPlaybackAdapter.seek is not implemented (see load()).');
  }

  getCurrentTime(): number {
    return 0;
  }

  getDuration(): number {
    return 0;
  }

  getMediaElement(): HTMLAudioElement | null {
    return null;
  }

  dispose(): void {
    // Nothing to release — no media element is ever created.
  }
}
