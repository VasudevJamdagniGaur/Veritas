import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../state/appState";
import SocialIdentityCard from "../components/SocialIdentityCard.jsx";
import { Button, Shell } from "../components/Ui";
import { markSocialStepComplete } from "../lib/socialOnboarding";

export default function SocialLinkPage() {
  const nav = useNavigate();
  const { user, setUser, refreshUser } = useApp();

  useEffect(() => {
    if (!user) {
      nav("/");
      return;
    }
    if (!user.isHumanVerified) {
      nav("/verify");
    }
  }, [user, nav]);

  useEffect(() => {
    if (!user?._id) return;
    refreshUser().catch(() => {});
  }, [user?._id, refreshUser]);

  const onNext = () => {
    if (!user?._id) return;
    markSocialStepComplete(user._id);
    nav("/dashboard");
  };

  if (!user) {
    return (
      <Shell>
        <p className="text-sm text-gray-500">Redirecting…</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <SocialIdentityCard user={user} userId={user._id} onLinked={setUser} className="w-full" />

      <div className="mt-8 flex justify-end">
        <Button type="button" onClick={onNext}>
          Next
        </Button>
      </div>
    </Shell>
  );
}
