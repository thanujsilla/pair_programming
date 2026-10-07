import * as ort from 'onnxruntime-web/wasm';

let configured = false;

/** Where the app is served from, as an absolute URL ending in "/". Works inside a worker. */
export function appBase(): string {
  return new URL(import.meta.env.BASE_URL, self.location.href).href;
}

/**
 * onnxruntime-web, set up once per worker: WASM files come from our own
 * server (so the app works offline), threads only when the page is
 * cross-origin isolated.
 */
export function getOrt(): typeof ort {
  if (!configured) {
    ort.env.wasm.wasmPaths = `${appBase()}ort/`;
    ort.env.wasm.simd = true;
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2)) : 1;
    configured = true;
  }
  return ort;
}

export async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}