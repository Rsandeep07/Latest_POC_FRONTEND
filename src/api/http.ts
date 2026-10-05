/** Real backend client (FastAPI). Paths live in ENDPOINTS. */
import { DEFAULT_CONFIG, ENDPOINTS, ENV } from '@/config/constants';
import type { Camera, CameraConfig, EventsQuery } from '@/types';
import { ApiError, type BackendApi } from './types';

type Query = Record<string, string | number | undefined>;

function buildUrl(path: string, query?: Query) {
  const url = new URL(path, ENV.apiBaseUrl);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  return url.toString();
}

/** FastAPI returns `detail` as a string (HTTPException) or an array (422 validation). */
function messageFromDetail(detail: unknown, fallback: string) {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string; loc?: unknown[] };
    const field = Array.isArray(first.loc) ? first.loc.slice(1).join('.') : '';
    return [field, first.msg].filter(Boolean).join(': ') || fallback;
  }
  return fallback;
}

async function request<T>(method: string, path: string, opts: { query?: Query; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      signal: opts.signal,
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError('Cannot reach the server. Check your connection.', 0);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => undefined);
  if (!res.ok) {
    const detail = (data as { detail?: unknown } | undefined)?.detail;
    throw new ApiError(messageFromDetail(detail, `Request failed (${res.status})`), res.status, detail);
  }
  return data as T;
}

const isNotFound = (e: unknown) => e instanceof ApiError && (e.status === 404 || e.status === 405);

/** Single camera used until the backend exposes /cameras (contract example id). */
const FALLBACK_CAMERA: Camera = { camera_id: 'CAM_01', name: 'Main Entrance', location: '—', source: '—', resolution: '—' };

export const httpApi: BackendApi = {
  getEvents: (q: EventsQuery, signal) =>
    request('GET', ENDPOINTS.events, {
      signal,
      query: { limit: q.limit, offset: q.offset, direction: q.direction, from: q.from, to: q.to, camera_id: q.camera_id, track_id: q.track_id },
    }),

  getCounts: (cameraId, signal) => request('GET', ENDPOINTS.counts, { signal, query: { camera_id: cameraId } }),

  getHealth: (signal) => request('GET', ENDPOINTS.health, { signal }),

  async getCameras(signal) {
    try {
      return await request<Camera[]>('GET', ENDPOINTS.cameras, { signal });
    } catch (e) {
      if (isNotFound(e)) return [FALLBACK_CAMERA];
      throw e;
    }
  },

  updateCamera: (camera) => request('PUT', ENDPOINTS.camera(camera.camera_id), { body: camera }),

  async getCameraStatus(cameraId, signal) {
    try {
      return await request('GET', ENDPOINTS.cameraStatus(cameraId), { signal });
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  },

  async getConfig(cameraId, signal) {
    try {
      return await request<CameraConfig>('GET', ENDPOINTS.config(cameraId), { signal });
    } catch (e) {
      if (isNotFound(e)) return { camera_id: cameraId, ...structuredClone(DEFAULT_CONFIG) };
      throw e;
    }
  },

  saveConfig: (config) => request('PUT', ENDPOINTS.config(config.camera_id), { body: config }),

  resetCounts: (cameraId) => request('POST', ENDPOINTS.resetCounts, { query: { camera_id: cameraId } }),

  async getRecording(cameraId, from, to, signal) {
    try {
      return await request('GET', ENDPOINTS.recording(cameraId), { signal, query: { from, to } });
    } catch (e) {
      if (isNotFound(e)) return { kind: 'unavailable' };
      throw e;
    }
  },
};
