/** MOCK ONLY — BackendApi implementation backed by the in-memory DB. */
import { ApiError, type BackendApi } from '@/api/types';
import type { Camera, CameraConfig, PersonCountEvent } from '@/types';
import { getDb, persistConfigs } from './db';
import { snapshotUri } from './scene';
import { currentStatus } from './simulator';

const latency = (min = 180, max = 520) => new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));

const snapshotCache = new Map<string, string>();
function withSnapshot(e: PersonCountEvent): PersonCountEvent {
  if (e.snapshot_url) return e;
  let url = snapshotCache.get(e.event_id);
  if (!url) {
    const lane = 520 + ((e.track_id * 137) % 560);
    url = snapshotUri(e.track_id, e.direction === 'ENTRY', 560 + ((e.track_id * 53) % 220), lane);
    snapshotCache.set(e.event_id, url);
  }
  return { ...e, snapshot_url: url };
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export const mockApi: BackendApi = {
  async getEvents(q) {
    await latency();
    const db = getDb();
    const from = q.from ? Date.parse(q.from) : -Infinity;
    const to = q.to ? Date.parse(q.to) : Infinity;
    const filtered: PersonCountEvent[] = [];
    for (let i = db.events.length - 1; i >= 0; i--) {
      const e = db.events[i];
      const t = Date.parse(e.timestamp);
      if (t < from || t > to) continue;
      if (q.direction && e.direction !== q.direction) continue;
      if (q.camera_id && e.camera_id !== q.camera_id) continue;
      if (q.track_id != null && e.track_id !== q.track_id) continue;
      filtered.push(e);
    }
    const limit = q.limit ?? 50;
    const offset = q.offset ?? 0;
    const items = filtered.slice(offset, offset + limit);
    // Only attach snapshots for small pages (charts pull thousands of rows).
    return { items: limit <= 100 ? items.map(withSnapshot) : items, total: filtered.length, limit, offset };
  },

  async getCounts(cameraId) {
    await latency(150, 380);
    const db = getDb();
    let entries = 0;
    let exits = 0;
    for (const e of db.events) {
      if (cameraId && e.camera_id !== cameraId) continue;
      const cutoff = Math.max(startOfToday(), db.countsResetAt.get(e.camera_id) ?? 0);
      if (Date.parse(e.timestamp) < cutoff) continue;
      if (e.direction === 'ENTRY') entries++;
      else exits++;
    }
    return { total_entries: entries, total_exits: exits, current_occupancy: entries - exits };
  },

  async getHealth() {
    await latency(80, 200);
    return { status: 'healthy', components: { ai_engine: 'online', camera: 'online', tracker: 'online', database: 'online' } };
  },

  async getCameras() {
    await latency();
    return structuredClone(getDb().cameras);
  },

  async updateCamera(camera: Camera) {
    await latency(250, 500);
    const db = getDb();
    const idx = db.cameras.findIndex((c) => c.camera_id === camera.camera_id);
    if (idx < 0) db.cameras.push(camera);
    else db.cameras[idx] = camera;
    return structuredClone(camera);
  },

  async getCameraStatus(cameraId) {
    await latency(100, 250);
    return currentStatus(cameraId);
  },

  async getConfig(cameraId) {
    await latency(120, 300);
    const cfg = getDb().configs.get(cameraId);
    if (!cfg) throw new ApiError('Camera not found', 404);
    return structuredClone(cfg);
  },

  async saveConfig(config: CameraConfig) {
    await latency(300, 650);
    getDb().configs.set(config.camera_id, structuredClone(config));
    persistConfigs();
    return structuredClone(config);
  },

  async resetCounts(cameraId) {
    await latency(250, 500);
    const db = getDb();
    const now = Date.now();
    for (const cam of db.cameras) if (!cameraId || cam.camera_id === cameraId) db.countsResetAt.set(cam.camera_id, now);
  },

  async getRecording() {
    await latency(200, 400);
    return { kind: 'synthetic' };
  },
};
