import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  ApiError,
  endpoints,
  type LibraryEntry,
  type LibraryStatus,
} from "../lib/api";
import MangaCard from "../components/MangaCard";
import { ErrorState, FullPageSpinner, EmptyState } from "../components/Feedback";

const STATUS_FILTERS: { value: LibraryStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "reading", label: "Reading" },
  { value: "plan_to_read", label: "Plan to Read" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
];

const STATUS_LABEL: Record<LibraryStatus, string> = {
  reading: "Reading",
  completed: "Completed",
  plan_to_read: "Plan to Read",
  dropped: "Dropped",
};

const STATUS_BADGE: Record<LibraryStatus, string> = {
  reading: "bg-emerald-500/20 text-emerald-300",
  completed: "bg-indigo-500/20 text-indigo-300",
  plan_to_read: "bg-amber-500/20 text-amber-300",
  dropped: "bg-rose-500/20 text-rose-300",
};

export default function Library() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<LibraryStatus | "all">("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    endpoints
      .listLibrary()
      .then(({ entries }) => {
        if (cancelled) return;
        setEntries(entries ?? []);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : "Failed to load library.");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered =
    entries?.filter((e) => filter === "all" || e.status === filter) ?? [];

  if (loading) return <FullPageSpinner label="Loading your library..." />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">
            {user?.username}'s Library
          </h1>
          <p className="text-sm text-gray-400">
            {entries?.length ?? 0} title{(entries?.length ?? 0) === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.value
                ? "border-indigo-500 bg-indigo-500/15 text-indigo-300"
                : "border-gray-700 text-gray-300 hover:border-gray-500"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={
            (entries?.length ?? 0) === 0
              ? "Your library is empty"
              : "No manga in this category"
          }
          description="Add manga from any detail page to start tracking your reading."
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.map((entry) => {
            const manga = entry.manga;
            if (!manga) return null;
            return (
              <div key={entry.id} className="relative">
                <MangaCard manga={manga} />
                <span
                  className={`absolute right-2 top-2 z-10 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide backdrop-blur ${
                    STATUS_BADGE[entry.status] ??
                    "bg-gray-500/20 text-gray-300 border-gray-500/30"
                  }`}
                >
                  {STATUS_LABEL[entry.status] ?? entry.status}
                </span>
                {typeof entry.last_chapter_read === "number" && (
                  <div className="absolute inset-x-0 bottom-[4.5rem] z-10 mx-2">
                    <div className="rounded bg-gray-900/80 px-1.5 py-0.5 text-center text-[10px] text-gray-300 backdrop-blur">
                      Last: Ch.{" "}
                      {Number.isInteger(entry.last_chapter_read)
                        ? entry.last_chapter_read
                        : entry.last_chapter_read.toFixed(1)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
