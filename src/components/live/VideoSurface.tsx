import { VideoOff } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import type { Camera } from '@/types';

// Mock-only synthetic video; tree-shaken from live builds.
const LiveSyntheticFeed = import.meta.env.VITE_USE_MOCK === 'true' ? lazy(() => import('@/mocks/SyntheticFeed').then((m) => ({ default: m.LiveSyntheticFeed }))) : null;

const VIDEO_FILE = /\.(mp4|webm|ogv|mov)(\?|#|$)/i;

/**
 * The processed camera stream. With a backend, `camera.stream_url` should point at an
 * MJPEG (multipart) endpoint; an <img> renders it natively without extra libraries.
 * Video files (.mp4/.webm, e.g. recorded sample footage) play looped in a <video>.
 */
export function VideoSurface({ camera }: { camera: Camera }) {
  const [failed, setFailed] = useState(false);

  if (camera.stream_url && !failed && VIDEO_FILE.test(camera.stream_url)) {
    return (
      <video
        key={camera.stream_url}
        src={camera.stream_url}
        autoPlay
        muted
        loop
        playsInline
        aria-label={`Live view of ${camera.name}`}
        onError={() => setFailed(true)}
        className="absolute inset-0 size-full object-cover"
      />
    );
  }
  if (LiveSyntheticFeed && !camera.stream_url) {
    return (
      <Suspense fallback={<div className="absolute inset-0 bg-ink-950" />}>
        <LiveSyntheticFeed cameraId={camera.camera_id} />
      </Suspense>
    );
  }
  if (camera.stream_url && !failed) {
    return <img src={camera.stream_url} alt={`Live view of ${camera.name}`} onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover" />;
  }
  return (
    <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_center,#1b2638_0%,#0a0f1a_75%)] text-center">
      <div>
        <VideoOff className="mx-auto mb-3 size-8 text-ink-500" />
        <p className="text-sm font-medium text-ink-300">{failed ? 'Video stream interrupted' : 'Video stream not configured'}</p>
        <p className="mt-1 text-xs text-ink-500">Detection and counting continue in the background.</p>
      </div>
    </div>
  );
}
