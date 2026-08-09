import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, endpoints, proxyImg, type LibraryEntry } from "../lib/api";
import { ErrorState, FullPageSpinner, EmptyState } from "../components/Feedback";

const STATUS_LABEL: Record<string, string> = {
  reading: "Reading",
  completed: "Completed",
  plan_to_read: "Plan to Read",
  dropped: "Dropped",
};

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    endpoints
      .listLibrary()
      .then(({ entries }) => !cancelled && setEntries(entries ?? []))
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : "Failed to load library.");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Reading stats derived from library entries.
  const stats = (() => {
    if (!entries) return null;
    const byStatus: Record<string, number> = {};
    entries.forEach((e) => {
      byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
    });
    return { total: entries.length, byStatus };
  })();

  function onLogout() {
    logout();
    navigate("/", { replace: true });
  }

  if (!user) {
    // RequireAuth guards this route; if we reach here, auth is still loading.
    return <FullPageSpinner />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* User card */}
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-gray-800 bg-gray-800/50 p-6 text-center sm:flex-row sm:text-left">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-2xl font-bold text-white">
          {user.avatar_url ? (
            <img
              src={proxyImg(user.avatar_url)}
              alt={user.username}
              className="h-full w-full object-cover"
            />
          ) : (
            (user.username.charAt(0).toUpperCase() || "?")
          )}
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-100">{user.username}</h1>
          <p className="text-sm text-gray-400">{user.email}</p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-xs font-medium capitalize text-indigo-300">
              {user.role}
            </span>
            <span className="text-xs text-gray-500">
              Joined{" "}
              {new Date(user.created_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:border-rose-500 hover:text-rose-300"
        >
          Log out
        </button>
      </div>

      {/* Stats */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-100">
          Reading stats
        </h2>
        {loading ? (
          <FullPageSpinner label="Loading your library..." />
        ) : error ? (
          <ErrorState message={error} />
        ) : !stats || stats.total === 0 ? (
          <EmptyState
            title="Your library is empty"
            description="Add manga from any detail page to start tracking."
            action={
              <Link
                to="/"
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600"
              >
                Browse manga
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="In Library" value={stats.total} accent="indigo" />
            {(["reading", "completed", "plan_to_read", "dropped"] as const).map(
              (s) => (
                <StatCard
                  key={s}
                  label={STATUS_LABEL[s] ?? s}
                  value={stats.byStatus[s] ?? 0}
                />
              )
            )}
          </div>
        )}
      </section>

      {/* Quick links */}
      <section className="flex flex-wrap gap-3">
        <Link
          to="/library"
          className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-200 hover:border-indigo-500 hover:text-indigo-300"
        >
          Go to Library →
        </Link>
        <Link
          to="/lists"
          className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-200 hover:border-indigo-500 hover:text-indigo-300"
        >
          Browse Lists →
        </Link>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "indigo";
}) {
  const accentClass =
    accent === "indigo" ? "text-indigo-300" : "text-gray-100";
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-800/40 p-4 text-center">
      <div className={`text-2xl font-bold ${accentClass}`}>{value}</div>
      <div className="mt-0.5 text-xs uppercase tracking-wide text-gray-500">
        {label}
      </div>
    </div>
  );
}
