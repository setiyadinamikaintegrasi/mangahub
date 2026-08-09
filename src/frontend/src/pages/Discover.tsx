import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { endpoints, ApiError, type Manga } from "../lib/api";
import MangaCard from "../components/MangaCard";
import { ErrorState, FullPageSpinner, EmptyState } from "../components/Feedback";

// Curated genre chips. The API accepts any genre string; these are just quick filters.
// When data is loaded we also derive genres present in results and merge them in.
const FEATURED_GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Fantasy",
  "Horror",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Sports",
  "Supernatural",
  "Thriller",
];

const STATUSES = [
  { value: "", label: "All" },
  { value: "ongoing", label: "Ongoing" },
  { value: "completed", label: "Completed" },
];

const PAGE_SIZE = 24;

export default function Discover() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const genre = params.get("genre") ?? "";
  const status = params.get("status") ?? "";
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);

  const [searchInput, setSearchInput] = useState(q);
  const [mangas, setMangas] = useState<Manga[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep the search box in sync if q changes via URL (e.g. from navbar).
  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  // Debounce-friendly: re-fetch whenever filters change.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    endpoints
      .listMangas({ q, genre, status, page, limit: PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setMangas(res.mangas ?? []);
        setTotal(res.total ?? 0);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : "Failed to load manga.");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [q, genre, status, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Genres actually present in current results, merged with the featured list.
  const availableGenres = useMemo(() => {
    if (!mangas) return FEATURED_GENRES;
    const present = new Set<string>();
    mangas.forEach((m) => m.genres?.forEach((g) => present.add(g)));
    const merged = Array.from(new Set([...FEATURED_GENRES, ...present]));
    return merged.sort((a, b) => a.localeCompare(b));
  }, [mangas]);

  function updateParams(patch: Record<string, string | number | null>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "" || v === 0) next.delete(k);
      else next.set(k, String(v));
    }
    setParams(next, { replace: false });
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    updateParams({ q: searchInput.trim(), page: 1 });
  }

  function toggleGenre(g: string) {
    updateParams({ genre: genre === g ? "" : g, page: 1 });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Discover</h1>
        <p className="text-sm text-gray-400">
          Browse the catalog — search by title, filter by genre or status.
        </p>
      </div>

      {/* Mobile search */}
      <form onSubmit={onSearch} className="relative md:hidden">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search manga..."
          className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2.5 pl-9 pr-3 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
        <svg
          className="pointer-events-none absolute left-2.5 top-3 h-4 w-4 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </form>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Status:
          </span>
          {STATUSES.map((s) => (
            <button
              key={s.value || "all"}
              onClick={() => updateParams({ status: s.value, page: 1 })}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                status === s.value
                  ? "border-indigo-500 bg-indigo-500/15 text-indigo-300"
                  : "border-gray-700 text-gray-300 hover:border-gray-500"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Genres:
          </span>
          {availableGenres.map((g) => (
            <button
              key={g}
              onClick={() => toggleGenre(g)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                genre === g
                  ? "border-purple-500 bg-purple-500/15 text-purple-300"
                  : "border-gray-700 text-gray-300 hover:border-gray-500"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <FullPageSpinner label="Loading manga..." />
      ) : error ? (
        <ErrorState message={error} />
      ) : !mangas || mangas.length === 0 ? (
        <EmptyState
          title="No manga found"
          description="Try adjusting your search or filters."
          action={
            <Link
              to="/"
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600"
            >
              Reset filters
            </Link>
          }
        />
      ) : (
        <>
          <p className="text-sm text-gray-400">
            {total} result{total === 1 ? "" : "s"}
            {q ? ` for “${q}”` : ""}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {mangas.map((m) => (
              <MangaCard key={m.id} manga={m} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                disabled={page <= 1}
                onClick={() => updateParams({ page: page - 1 })}
                className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-200 enabled:hover:border-indigo-500 enabled:hover:text-indigo-300 disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="px-3 text-sm text-gray-400">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => updateParams({ page: page + 1 })}
                className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-200 enabled:hover:border-indigo-500 enabled:hover:text-indigo-300 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
