/**
 * Shared utilities for sidebar camera feed panels.
 */

/** Produce a stable 4-char hex short-code from a deviceId string. */
export function deviceShortCode(deviceId: string): string {
  let hash = 0;
  for (let i = 0; i < deviceId.length; i++) {
    hash = (hash * 31 + deviceId.charCodeAt(i)) >>> 0;
  }
  return '#' + (hash & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Apply CSS rotation + layout transform to a camera feed element.
 * For playback panels pass a fixed aspectRatio (e.g. 16/9) instead of
 * querying a live stream.
 */
export async function applyCameraRotation(
  deviceId: string,
  rotateAngle: number,
  index: number,
  getLiveAspectRatio?: () => Promise<number>,
): Promise<void> {
  let aspectRatio: number;

  if (getLiveAspectRatio) {
    aspectRatio = await getLiveAspectRatio();
  } else {
    aspectRatio = 16 / 9;
  }

  let isOdd = false;
  let offsetX = 0;
  let offsetY = 0;
  let origin = 'center';

  if (rotateAngle % 180 !== 0) {
    aspectRatio = 1 / aspectRatio;
    isOdd = true;
  }

  const parent = document.getElementById(`camera-box${index}`) as HTMLDivElement | null;
  const video = document.getElementById(`cameraFeed${index}`) as HTMLVideoElement | null;
  if (!parent || !video) return;

  parent.style.width = '100%';
  parent.style.aspectRatio = `${aspectRatio}`;

  await new Promise((resolve) => setTimeout(resolve, 50));

  if (isOdd) {
    const temp = parent.offsetWidth / aspectRatio;
    parent.style.height = temp + 'px';
    video.style.width = temp + 'px';
    video.style.maxWidth = temp + 'px';
    video.style.height = parent.offsetWidth + 'px';
    video.style.maxHeight = parent.offsetWidth + 'px';

    offsetX = video.offsetHeight;
    origin = 'top left';
    if (rotateAngle === 270) {
      offsetY = video.offsetWidth;
      offsetX = 0;
    }
  } else {
    video.style.width = parent.offsetWidth + 'px';
    video.style.height = 'auto';
    video.style.maxWidth = '100%';
    parent.style.height = 'auto';
    offsetX = 0;
    origin = 'center';
  }

  video.style.transform = `translate(${offsetX}px, ${offsetY}px) rotate(${rotateAngle}deg)`;
  video.style.transformOrigin = origin;
}

