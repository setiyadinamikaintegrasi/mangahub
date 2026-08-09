import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  ApiError,
  endpoints,
  type Manga,
  type ReadingList,
  type ReadingListItem,
} from "../lib/api";
import MangaCard from "../components/MangaCard";
import { ErrorState, FullPageSpinner, EmptyState } from "../components/Feedback";

export default function ReadingListDetail() {
  const { slug = "" } = useParams<{ slug: string }>();
  const { user } = useAuth();

  const [list, setList] = useState<ReadingList | null>(null);
  const [items, setItems] = useState<ReadingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add-manga inline form (owner only)
  const [addSlug, setAddSlug] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addMsg, setAddMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await endpoints.getList(slug);
      setList(res.list);
      setItems(res.items ?? []);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.status === 404
            ? "List not found."
            : e.message
          : "Failed to load list."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    endpoints
      .getList(slug)
      .then((res) => {
        if (cancelled) return;
        setList(res.list);
        setItems(res.items ?? []);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          e instanceof ApiError
            ? e.status === 404
              ? "List not found."
              : e.message
            : "Failed to load list."
        );
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const isOwner = !!user && !!list && user.id === list.user_id;

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setAddMsg(null);
    if (!addSlug.trim()) {
      setAddMsg("Enter a manga slug.");
      return;
    }
    setAddBusy(true);
    try {
      await endpoints.addListItem(slug, addSlug.trim());
      setAddSlug("");
      setAddMsg("Added.");
      await load();
    } catch (e) {
      setAddMsg(
        e instanceof ApiError ? e.message : "Failed to add manga to list."
      );
    } finally {
      setAddBusy(false);
    }
  }

  async function onRemove(mangaSlug: string) {
    try {
      await endpoints.removeListItem(slug, mangaSlug);
      setItems((prev) => prev.filter((i) => i.manga?.slug !== mangaSlug));
    } catch (e) {
      setAddMsg(
        e instanceof ApiError ? e.message : "Failed to remove manga."
      );
    }
  }

  if (loading) return <FullPageSpinner label="Loading list..." />;
  if (error) return <ErrorState message={error} />;
  if (!list) return <ErrorState message="List not found." />;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Link to="/lists" className="hover:text-gray-300">
            ← Reading Lists
          </Link>
        </div>
        <h1 className="mt-2 text-2xl font-bold text-gray-100 sm:text-3xl">
          {list.name}
        </h1>
        {list.description && (
          <p className="mt-1 max-w-2xl text-sm text-gray-400">
            {list.description}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          {list.is_public && (
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-medium text-emerald-300">
              Public
            </span>
          )}
          {list.author_name && <span>by {list.author_name}</span>}
          <span>· {items.length} manga</span>
        </div>
      </div>

      {/* Owner controls */}
      {isOwner && (
        <div className="rounded-xl border border-gray-800 bg-gray-800/40 p-4">
          <h2 className="text-sm font-semibold text-gray-200">Manage list</h2>
          <form onSubmit={onAdd} className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={addSlug}
              onChange={(e) => setAddSlug(e.target.value)}
              placeholder="manga slug (e.g. one-piece)"
              className="min-w-[12rem] flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={addBusy}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-60"
            >
              {addBusy ? "Adding..." : "+ Add manga"}
            </button>
          </form>
          {addMsg && <p className="mt-2 text-xs text-gray-400">{addMsg}</p>}
          <p className="mt-2 text-xs text-gray-500">
            Tip: find a manga's slug in its URL — /manga/&lt;slug&gt;.
          </p>
        </div>
      )}

      {/* Manga grid */}
      {items.length === 0 ? (
        <EmptyState
          title="This list has no manga yet"
          description={
            isOwner
              ? "Add manga by their slug using the form above."
              : "Check back later."
          }
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
          {items.map((item) => {
            const manga: Manga | undefined = item.manga;
            if (!manga) return null;
            return (
              <div key={item.id} className="relative">
                <MangaCard manga={manga} />
                {isOwner && (
                  <button
                    onClick={() => onRemove(manga.slug)}
                    className="absolute right-2 top-2 z-10 rounded-full bg-rose-600/80 p-1.5 text-white backdrop-blur transition-colors hover:bg-rose-600"
                    title="Remove from list"
                    aria-label="Remove from list"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
