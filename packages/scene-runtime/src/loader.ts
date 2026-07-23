import { parseSceneDocument, type SceneDocument } from '@interactive-photo/scene-schema';

/**
 * Fetch and validate a scene document from a URL. Throws a readable error if the
 * response is not OK or the payload fails schema validation.
 */
export async function loadScene(url: string, init?: RequestInit): Promise<SceneDocument> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`Failed to load scene from ${url}: ${res.status} ${res.statusText}`);
  }
  const json: unknown = await res.json();
  try {
    return parseSceneDocument(json);
  } catch (err) {
    throw new Error(
      `Scene at ${url} failed validation: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}
