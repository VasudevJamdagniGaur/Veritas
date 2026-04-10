import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../state/appState";
import { Badge, Card, Shell } from "../components/Ui";

export default function InstructionsPage() {
  const { user } = useApp();
  const apiBase = useMemo(() => import.meta.env.VITE_API_URL || "http://localhost:5000/api", []);

  return (
    <Shell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-sm text-gray-400">Step 4</div>
          <h1 className="mt-1 text-3xl font-semibold text-white">Install the Chrome Extension</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-300">
            Load the extension locally and open X/Twitter (or any feed-like page). Veritas will inject credibility
            badges and insights under detected posts.
          </p>
        </div>
        <Badge label={user?.username || "No session"} tone="gray" />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <div className="text-sm font-semibold text-white">1) Build / load extension</div>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-gray-300">
            <li>Open Chrome → Extensions → enable Developer mode</li>
            <li>Click “Load unpacked”</li>
            <li>Select the `extension/` folder in this repo</li>
          </ol>
        </Card>

        <Card>
          <div className="text-sm font-semibold text-white">2) Confirm backend URL</div>
          <p className="mt-2 text-sm text-gray-300">
            The extension calls your backend at:
          </p>
          <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-xs text-gray-200">
            {apiBase}
          </div>
          <p className="mt-3 text-sm text-gray-300">
            If you changed ports, update `extension/config.js`.
          </p>
        </Card>

        <Card className="md:col-span-2">
          <div className="text-sm font-semibold text-white">3) Try it</div>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-300">
            <li>
              Open `x.com` and scroll. Under posts you should see a Veritas card (badge + AI warning + Insight).
            </li>
            <li>
              For a deterministic test, you can also open the local “Mock Feed” page (we’ll add it next) and see
              overlays immediately.
            </li>
          </ul>
          <div className="mt-4">
            <Link className="text-sm text-pink-200 hover:underline" to="/dashboard">
              ← Back to dashboard
            </Link>
          </div>
        </Card>
      </div>
    </Shell>
  );
}

