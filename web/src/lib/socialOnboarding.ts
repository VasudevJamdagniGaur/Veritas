/** Tracks whether the user finished Step 3 (social link screen) before dashboard — per Veritas user id. */

const prefix = "veritas.socialStepDone:";

export function isSocialStepComplete(userId: string): boolean {
  try {
    return localStorage.getItem(`${prefix}${userId}`) === "1";
  } catch {
    return false;
  }
}

export function markSocialStepComplete(userId: string): void {
  try {
    localStorage.setItem(`${prefix}${userId}`, "1");
  } catch {
    // ignore
  }
}

export function clearSocialStepForUser(userId: string): void {
  try {
    localStorage.removeItem(`${prefix}${userId}`);
  } catch {
    // ignore
  }
}
