import { signOut } from "firebase/auth";
import { api } from "./api";
import { auth } from "./firebase";
import { deleteProfileFromFirebase } from "./profileImageFirestore";
import { removeLocalFaceCapture } from "./localFaceCapture";

/** Deletes the user on the backend, clears Firebase profile data, and signs out of Firebase Auth. */
export async function deleteVeritasAccount(userId: string): Promise<void> {
  await api.delete(`/user/${userId}`);
  removeLocalFaceCapture(userId);
  await deleteProfileFromFirebase(userId);
  try {
    await signOut(auth);
  } catch {
    // ignore
  }
}
