import { useEffect } from 'react';
import { socket } from '@/api';
import { useAnalyticsStore } from '@/store/analyticsStore';
import { useCameraStore } from '@/store/cameraStore';
import { useConfigStore } from '@/store/configStore';
import { useConnectionStore } from '@/store/connectionStore';
import { resetEventStore, useEventStore } from '@/store/eventStore';
import { useUiStore } from '@/store/uiStore';
import { api } from '@/api';
import type { Point, WsMessage } from '@/types';

const HEALTH_POLL_MS = 15_000;

function loadCameraData(cameraId: string) {
  void useAnalyticsStore.getState().load(cameraId);
  void useEventStore.getState().load(cameraId);
  void useConfigStore.getState().load(cameraId);
  api
    .getCameraStatus(cameraId)
    .then((s) => s && useCameraStore.getState().setStatus(s))
    .catch(() => undefined);
}

function footOfTrack(trackId: number): Point | null {
  const t = useCameraStore.getState().tracks.find((tr) => tr.track_id === trackId);
  if (!t) return null;
  const [x, y, w, h] = t.bbox;
  return { x: x + w / 2, y: y + h };
}

function handleMessage(msg: WsMessage) {
  useConnectionStore.getState().touch();
  const selected = useCameraStore.getState().selectedId;
  switch (msg.type) {
    case 'PERSON_COUNT_EVENT': {
      const e = msg.data;
      if (e.camera_id !== selected) return;
      if (!useEventStore.getState().ingest(e)) return; // duplicate
      useAnalyticsStore.getState().applyEvent(e.direction);
      useUiStore.getState().notify(e, footOfTrack(e.track_id));
      return;
    }
    case 'TRACKS_UPDATE':
      useCameraStore.getState().setTracks(msg.data.camera_id, msg.data.tracks);
      return;
    case 'CAMERA_STATUS':
      useCameraStore.getState().setStatus(msg.data);
      return;
  }
}

/** Wires REST bootstrapping + WebSocket into the stores. Mount once at the app root. */
export function useLiveFeed() {
  const cameraId = useCameraStore((s) => s.selectedId);

  useEffect(() => {
    void useCameraStore.getState().load();
    const health = useConnectionStore.getState().loadHealth;
    void health();
    const id = setInterval(health, HEALTH_POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!cameraId) return;
    resetEventStore();
    useAnalyticsStore.setState({ counts: null, loading: true });
    loadCameraData(cameraId);
  }, [cameraId]);

  useEffect(() => {
    let wasOpen = false;
    const offState = socket.onStateChange((s) => {
      useConnectionStore.getState().setSocket(s);
      if (s === 'open') {
        // After a reconnect, events may have been missed — reconcile from REST.
        const id = useCameraStore.getState().selectedId;
        if (wasOpen && id) {
          void useAnalyticsStore.getState().load(id);
          void useEventStore.getState().load(id);
        }
        wasOpen = true;
      }
    });
    const offMsg = socket.onMessage(handleMessage);
    socket.connect();
    return () => {
      offState();
      offMsg();
      socket.close();
    };
  }, []);
}
