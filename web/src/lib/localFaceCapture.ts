/** Persist verification webcam capture in the browser only (not Firestore). */

const KEY_PREFIX = "veritas.localFaceCapture:";

function key(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

export function setLocalFaceCapture(userId: string, dataUrl: string): void {
  try {
    localStorage.setItem(key(userId), dataUrl);
  } catch {
    // quota / private mode
  }
}

export function getLocalFaceCapture(userId: string): string | null {
  try {
    return localStorage.getItem(key(userId));
  } catch {
    return null;
  }
}

export function removeLocalFaceCapture(userId: string): void {
  try {
    localStorage.removeItem(key(userId));
  } catch {
    // ignore
  }
}
