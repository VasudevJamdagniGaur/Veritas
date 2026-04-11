import type { User } from "./api";

/** Removes base64 face data from the in-memory user (keeps Firestore `faceImageUrl` only). */
export function stripFaceCaptureDataUrl(u: User): User {
  if (!u.faceCaptureDataUrl) return u;
  const { faceCaptureDataUrl: _, ...rest } = u;
  return rest as User;
}
