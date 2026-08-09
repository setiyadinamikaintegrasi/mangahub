import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  ApiError,
  endpoints,
  proxyImg,
  type ChapterLite,
  type LibraryStatus,
  type Manga,
} from "../lib/api";
import { ErrorState, FullPageSpinner } from "../components/Feedback";

const STATUS_OPTIONS: { value: LibraryStatus; label: string }[] = [
  { value: "reading", label: "Reading" },
  { value: "plan_to_read", label: "Plan to Read" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
];

export default function MangaDetail() {
  const { slug = "" } = useParams<{ slug: string }>();
  const { user } = useAuth();

  const [manga, setManga] = useState<Manga | null>(null);
  const [chapters, setChapters] = useState<ChapterLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Library state
  const [inLibrary, setInLibrary] = useState(false);
  const [libStatus, setLibStatus] = useState<LibraryStatus>("reading");
  const [libBusy, setLibBusy] = useState(false);
  const [libMsg, setLibMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setManga(null);
    setChapters([]);
    endpoints
      .getManga(slug)
      .then((res) => {
        if (cancelled) return;
        setManga(res.manga);
        setChapters(res.chapters ?? []);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          e instanceof ApiError
            ? e.status === 404
              ? "Manga not found."
              : e.message
            : "Failed to load manga."
        );
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Check if already in library (best-effort; ignore errors when not authed).
  useEffect(() => {
    if (!user) {
      setInLibrary(false);
      return;
    }
    let cancelled = false;
    endpoints
      .listLibrary()
      .then(({ entries }) => {
        if (cancelled) return;
        const entry = entries?.find((e) => e.manga?.slug === slug);
        if (entry) {
          setInLibrary(true);
          setLibStatus(entry.status);
        } else {
          setInLibrary(false);
        }
      })
      .catch(() => {
        /* ignore — non-fatal */
      });
    return () => {
      cancelled = true;
    };
  }, [slug, user]);

  // Chapters sorted descending by number (backend already sorts desc; ensure).
  const sortedChapters = useMemo(
    () =>
      [...chapters].sort((a, b) => b.chapter_number - a.chapter_number),
    [chapters]
  );

  async function addToLibrary(status: LibraryStatus) {
    setLibBusy(true);
    setLibMsg(null);
    try {
      await endpoints.addLibrary(slug, status);
      setInLibrary(true);
      setLibStatus(status);
      setLibMsg("Added to library.");
    } catch (e) {
      setLibMsg(
        e instanceof ApiError ? e.message : "Failed to update library."
      );
    } finally {
      setLibBusy(false);
    }
  }

  async function removeFromLibrary() {
    setLibBusy(true);
    setLibMsg(null);
    try {
      await endpoints.removeLibrary(slug);
      setInLibrary(false);
      setLibMsg("Removed from library.");
    } catch (e) {
      setLibMsg(
        e instanceof ApiError ? e.message : "Failed to remove from library."
      );
    } finally {
      setLibBusy(false);
    }
  }

  async function changeStatus(status: LibraryStatus) {
    setLibBusy(true);
    setLibMsg(null);
    try {
      await endpoints.updateLibrary(slug, { status });
      setLibStatus(status);
      setLibMsg("Status updated.");
    } catch (e) {
      setLibMsg(e instanceof ApiError ? e.message : "Failed to update status.");
    } finally {
      setLibBusy(false);
    }
  }

  if (loading) return <FullPageSpinner label="Loading manga..." />;
  if (error) return <ErrorState message={error} />;
  if (!manga) return <ErrorState message="Manga not found." />;

  return (
    <div className="space-y-6">
      {/* Header / hero */}
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="mx-auto w-40 shrink-0 overflow-hidden rounded-xl bg-gray-800 shadow-lg sm:mx-0 sm:w-48">
          <div className="aspect-[2/3] w-full bg-gray-700">
            {manga.cover_url ? (
              <img
                src={proxyImg(manga.cover_url)}
                alt={manga.title}
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.opacity = "0";
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-500">
                No cover
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 space-y-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-100 sm:text-3xl">
              {manga.title}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-400">
              <StatusBadge status={manga.status} />
              {manga.author && <span>by {manga.author}</span>}
            </div>
          </div>

          {manga.genres && manga.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {manga.genres.map((g) => (
                <span
                  key={g}
                  className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-0.5 text-xs font-medium text-purple-300"
                >
                  {g}
                </span>
              ))}
            </div>
          )}

          {manga.description && (
            <p className="max-w-2xl text-sm leading-relaxed text-gray-300">
              {manga.description}
            </p>
          )}

          {/* Library actions */}
          {user && (
            <div className="space-y-2 pt-2">
              {!inLibrary ? (
                <button
                  onClick={() => addToLibrary("reading")}
                  disabled={libBusy}
                  className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow transition-colors hover:bg-indigo-600 disabled:opacity-60"
                >
                  + Add to Library
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={libStatus}
                    onChange={(e) =>
                      changeStatus(e.target.value as LibraryStatus)
                    }
                    disabled={libBusy}
                    className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={removeFromLibrary}
                    disabled={libBusy}
                    className="rounded-lg border border-gray-700 px-3 py-2 text-sm font-medium text-gray-300 transition-colors hover:border-rose-500 hover:text-rose-300 disabled:opacity-60"
                  >
                    Remove
                  </button>
                </div>
              )}
              {libMsg && (
                <p className="text-xs text-gray-400">{libMsg}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chapters */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-100">
            Chapters{" "}
            <span className="text-sm font-normal text-gray-500">
              ({sortedChapters.length})
            </span>
          </h2>
        </div>
        {sortedChapters.length === 0 ? (
          <p className="rounded-lg border border-gray-800 bg-gray-800/40 p-4 text-sm text-gray-400">
            No chapters available yet.
          </p>
        ) : (
          <ul className="divide-y divide-gray-800 overflow-hidden rounded-xl border border-gray-800 bg-gray-800/40">
            {sortedChapters.map((c) => (
              <li key={c.id}>
                <ChapterRow chapter={c} slug={slug} locked={!user} />
              </li>
            ))}
          </ul>
        )}
        {!user && (
          <p className="mt-2 text-xs text-gray-500">
            <Link to="/login" className="text-indigo-400 hover:text-indigo-300">
              Log in
            </Link>{" "}
            to read chapters.
          </p>
        )}
      </section>
    </div>
  );
}

function ChapterRow({
  chapter,
  slug,
  locked,
}: {
  chapter: ChapterLite;
  slug: string;
  locked: boolean;
}) {
  const url = `/manga/${slug}/chapter/${chapter.chapter_number}`;
  const label =
    chapter.title?.trim() ||
    `Chapter ${formatChapter(chapter.chapter_number)}`;

  const content = (
    <div className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-gray-700/40">
      <span className="truncate text-sm font-medium text-gray-100">
        {label}
      </span>
      <span className="ml-3 shrink-0 text-xs text-gray-500">
        {new Date(chapter.created_at).toLocaleDateString()}
      </span>
    </div>
  );

  if (locked) {
    return (
      <span
        className="block cursor-not-allowed opacity-60"
        title="Log in to read"
      >
        {content}
      </span>
    );
  }
  return (
    <Link to={url} className="block">
      {content}
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ongoing: "bg-emerald-500/20 text-emerald-300",
    completed: "bg-indigo-500/20 text-indigo-300",
    hiatus: "bg-amber-500/20 text-amber-300",
    cancelled: "bg-rose-500/20 text-rose-300",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
        map[status?.toLowerCase()] ?? "bg-gray-500/20 text-gray-300"
      }`}
    >
      {status}
    </span>
  );
}

function formatChapter(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
