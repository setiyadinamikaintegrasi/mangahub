import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  ApiError,
  endpoints,
  type ReadingList,
} from "../lib/api";
import { ErrorState, FullPageSpinner, EmptyState } from "../components/Feedback";

export default function ReadingLists() {
  const { user } = useAuth();
  const [lists, setLists] = useState<ReadingList[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Create-list modal state
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await endpoints.listLists();
      setLists(res.lists ?? []);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Failed to load reading lists."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreateErr(null);
    if (!name.trim()) {
      setCreateErr("Please enter a list name.");
      return;
    }
    setCreating(true);
    try {
      await endpoints.createList({
        name: name.trim(),
        description: description.trim() || undefined,
        is_public: isPublic,
      });
      setShowCreate(false);
      setName("");
      setDescription("");
      setIsPublic(true);
      reload();
    } catch (e) {
      setCreateErr(
        e instanceof ApiError ? e.message : "Failed to create list."
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Reading Lists</h1>
          <p className="text-sm text-gray-400">
            Curated public collections from the community.
          </p>
        </div>
        {user && (
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-600"
          >
            + Create List
          </button>
        )}
      </div>

      {loading ? (
        <FullPageSpinner label="Loading lists..." />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !lists || lists.length === 0 ? (
        <EmptyState
          title="No public lists yet"
          description={
            user
              ? "Be the first to create a reading list."
              : "Log in to create the first reading list."
          }
          action={
            user ? (
              <button
                onClick={() => setShowCreate(true)}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600"
              >
                + Create List
              </button>
            ) : (
              <Link
                to="/login"
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600"
              >
                Log in
              </Link>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((list) => (
            <ListCard key={list.id} list={list} />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !creating && setShowCreate(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-gray-100">Create a list</h2>
            <form onSubmit={onCreate} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none"
                  placeholder="My favorites"
                  required
                  maxLength={100}
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">
                  Description (optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none"
                  placeholder="What's this list about?"
                  rows={3}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500"
                />
                Public (visible to everyone)
              </label>
              {createErr && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                  {createErr}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  disabled={creating}
                  className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 hover:border-gray-500 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-60"
                >
                  {creating ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ListCard({ list }: { list: ReadingList }) {
  return (
    <Link
      to={`/lists/${list.slug}`}
      className="group block overflow-hidden rounded-xl border border-gray-800 bg-gray-800/50 p-4 shadow-lg transition-all hover:border-indigo-500/50 hover:shadow-indigo-500/10"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="clamp-2 text-base font-semibold text-gray-100 group-hover:text-indigo-300">
          {list.name}
        </h3>
        <span className="shrink-0 rounded-full bg-indigo-500/15 px-2 py-0.5 text-xs font-semibold text-indigo-300">
          {list.item_count ?? 0}
        </span>
      </div>
      {list.description ? (
        <p className="clamp-2 mt-1.5 text-sm text-gray-400">
          {list.description}
        </p>
      ) : (
        <p className="mt-1.5 text-sm italic text-gray-600">No description</p>
      )}
      <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
        {list.is_public && (
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-medium text-emerald-300">
            Public
          </span>
        )}
        {list.author_name && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-4 w-4 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-center text-[9px] leading-4 text-white">
              {list.author_name.charAt(0).toUpperCase()}
            </span>
            {list.author_name}
          </span>
        )}
      </div>
    </Link>
  );
}
