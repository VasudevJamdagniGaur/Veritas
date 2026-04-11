import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadString } from "firebase/storage";
import { db, storage } from "./firebase";

const COLLECTION = "veritas_profiles";
/** Storage path prefix; file is keyed by Veritas backend user id. */
const STORAGE_PREFIX = "face-captures";

/**
 * Uploads a JPEG data URL to Firebase Storage and stores the download URL in Firestore.
 * Requires the user to be signed in with Firebase Auth (Storage rules).
 */
export async function saveFaceCaptureToFirebase(veritasUserId: string, dataUrl: string): Promise<string> {
  const storageRef = ref(storage, `${STORAGE_PREFIX}/${veritasUserId}.jpg`);
  await uploadString(storageRef, dataUrl, "data_url");
  const faceImageUrl = await getDownloadURL(storageRef);
  await setDoc(
    doc(db, COLLECTION, veritasUserId),
    {
      veritasUserId,
      faceImageUrl,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return faceImageUrl;
}

/** Loads the profile image URL from Firestore (not from localStorage). */
export async function loadFaceImageUrl(veritasUserId: string): Promise<string | null> {
  const snap = await getDoc(doc(db, COLLECTION, veritasUserId));
  if (!snap.exists()) return null;
  const data = snap.data() as { faceImageUrl?: string };
  return data.faceImageUrl || null;
}

/** Best-effort removal of profile doc and face image in Firebase (rules may deny). */
export async function deleteProfileFromFirebase(veritasUserId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, COLLECTION, veritasUserId));
  } catch {
    // ignore
  }
  try {
    await deleteObject(ref(storage, `${STORAGE_PREFIX}/${veritasUserId}.jpg`));
  } catch {
    // ignore
  }
}
