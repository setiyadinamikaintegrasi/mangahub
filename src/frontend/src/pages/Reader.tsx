import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ApiError,
  endpoints,
  proxyImg,
  type ChapterLite,
} from "../lib/api";
import { ErrorState, FullPageSpinner } from "../components/Feedback";

type ReadMode = "vertical" | "paged";

export default function Reader() {
  const { slug = "", num = "" } = useParams<{ slug: string; num: string }>();
  const navigate = useNavigate();

  const [chapter, setChapter] = useState<{
    id: string;
    pages: string[];
    chapter_number: number;
    title?: string | null;
  } | null>(null);
  const [chapters, setChapters] = useState<ChapterLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<ReadMode>("vertical");
  const [pageIndex, setPageIndex] = useState(0);

  // Refs used to capture latest values inside the unmount effect without
  // re-running that effect on every state change.
  const chapterRef = useRef(chapter);
  const modeRef = useRef(mode);
  const pageRef = useRef(pageIndex);
  chapterRef.current = chapter;
  modeRef.current = mode;
  pageRef.current = pageIndex;
  const slugRef = useRef(slug);
  slugRef.current = slug;

  // Fetch the chapter pages (requires JWT).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setChapter(null);
    setPageIndex(0);
    window.scrollTo({ top: 0 });

    endpoints
      .getChapter(slug, num)
      .then((res) => {
        if (cancelled) return;
        const ch = res.chapter;
        setChapter({
          id: ch.id,
          pages: res.pages?.length ? res.pages : ch.pages ?? [],
          chapter_number: ch.chapter_number,
          title: ch.title,
        });
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          // api layer already redirected; show a friendly message in the meantime.
          setError("Please log in to read this chapter.");
        } else {
          setError(
            e instanceof ApiError
              ? e.status === 404
                ? "Chapter not found."
                : e.message
              : "Failed to load chapter."
          );
        }
      })
      .finally(() => !cancelled && setLoading(false));

    // Fetch chapter list for prev/next navigation.
    endpoints
      .getManga(slug)
      .then((res) => {
        if (cancelled) return;
        setChapters(res.chapters ?? []);
      })
      .catch(() => {
        /* non-fatal */
      });

    return () => {
      cancelled = true;
    };
  }, [slug, num]);

  // Restore last read mode from localStorage (preference, no API needed).
  useEffect(() => {
    try {
      const saved = localStorage.getItem("mangahub_readmode");
      if (saved === "vertical" || saved === "paged") setMode(saved);
    } catch {
      /* ignore */
    }
  }, []);

  // Persist read mode preference.
  useEffect(() => {
    try {
      localStorage.setItem("mangahub_readmode", mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  // Clamp page index when pages load or change.
  useEffect(() => {
    setPageIndex((i) => Math.min(i, Math.max(0, (chapter?.pages.length ?? 1) - 1)));
  }, [chapter]);

  // Track deepest visible page in vertical mode.
  const verticalContainerRef = useRef<HTMLDivElement | null>(null);
  const onVerticalScroll = useCallback(() => {
    const container = verticalContainerRef.current;
    if (!container || !chapter) return;
    const imgs = Array.from(
      container.querySelectorAll<HTMLImageElement>("img[data-page]")
    );
    const midline = window.scrollY + window.innerHeight * 0.5;
    let deepest = 0;
    for (const img of imgs) {
      const top = img.offsetTop;
      if (top <= midline) {
        deepest = Number(img.dataset.page ?? "0");
      } else {
        break;
      }
    }
    setPageIndex(deepest);
  }, [chapter]);

  useEffect(() => {
    if (mode !== "vertical" || !chapter) return;
    window.addEventListener("scroll", onVerticalScroll, { passive: true });
    return () => window.removeEventListener("scroll", onVerticalScroll);
  }, [mode, chapter, onVerticalScroll]);

  // Save progress on unmount or when navigating away.
  useEffect(() => {
    return () => {
      const ch = chapterRef.current;
      if (!ch) return;
      // Fire-and-forget; the API layer attaches the JWT.
      endpoints
        .saveProgress(ch.id, pageRef.current, modeRef.current)
        .catch(() => {
          /* ignore — progress saving is best-effort */
        });
    };
    // Intentionally empty deps: we only want this to run on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prev / next chapter derived from the chapter list (sorted desc).
  const { prevChapter, nextChapter } = useMemo(() => {
    const sorted = [...chapters].sort(
      (a, b) => b.chapter_number - a.chapter_number
    );
    const idx = sorted.findIndex((c) => c.chapter_number === Number(num));
    if (idx === -1) return { prevChapter: null, nextChapter: null };
    // In desc order, "next" chapter (newer) is at idx-1, "prev" (older) idx+1.
    return {
      nextChapter: idx > 0 ? sorted[idx - 1] : null,
      prevChapter: idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null,
    };
  }, [chapters, num]);

  function goToChapter(c: ChapterLite | null) {
    if (!c) return;
    navigate(`/manga/${slug}/chapter/${c.chapter_number}`);
  }

  function pagedNext() {
    if (!chapter) return;
    if (pageIndex < chapter.pages.length - 1) {
      setPageIndex(pageIndex + 1);
      window.scrollTo({ top: 0 });
    } else if (nextChapter) {
      goToChapter(nextChapter);
    }
  }
  function pagedPrev() {
    if (!chapter) return;
    if (pageIndex > 0) {
      setPageIndex(pageIndex - 1);
      window.scrollTo({ top: 0 });
    } else if (prevChapter) {
      goToChapter(prevChapter);
    }
  }

  // Keyboard navigation (paged mode + arrow keys).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (mode !== "paged" || !chapter) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        pagedPrev();
      } else if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        pagedNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, chapter, pageIndex, prevChapter, nextChapter]);

  if (loading) return <FullPageSpinner label="Loading chapter..." />;
  if (error) return <ErrorState message={error} />;
  if (!chapter || chapter.pages.length === 0)
    return <ErrorState message="This chapter has no pages." />;

  const totalPages = chapter.pages.length;
  const progressPct = Math.round(((pageIndex + 1) / totalPages) * 100);

  return (
    <div className="min-h-screen bg-black text-gray-100">
      {/* Top progress / control bar (fixed) */}
      <div className="fixed inset-x-0 top-0 z-40 bg-black/85 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-5xl items-center gap-3 px-3">
          <Link
            to={`/manga/${slug}`}
            className="flex items-center gap-1 text-sm text-gray-300 hover:text-white"
            title="Back to manga"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            <span className="hidden sm:inline">Back</span>
          </Link>
          <div className="min-w-0 flex-1">
            <div className="truncate text-center text-xs text-gray-300">
              Chapter {formatNum(chapter.chapter_number)}
              {chapter.title ? ` — ${chapter.title}` : ""} ·{" "}
              <span className="text-gray-400">
                {pageIndex + 1}/{totalPages}
              </span>
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-gray-700">
              <div
                className="h-full bg-indigo-500 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          <button
            onClick={() => setMode(mode === "vertical" ? "paged" : "vertical")}
            className="flex items-center gap-1 rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs font-medium text-gray-200 hover:border-indigo-500 hover:text-indigo-300"
            title={`Switch to ${
              mode === "vertical" ? "paged" : "vertical scroll"
            } mode`}
          >
            {mode === "vertical" ? (
              <>
                <PagedIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Paged</span>
              </>
            ) : (
              <>
                <ScrollIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Scroll</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Page area */}
      {mode === "vertical" ? (
        <div
          ref={verticalContainerRef}
          className="mx-auto max-w-[800px] px-2 pb-24 pt-16"
        >
          {chapter.pages.map((src, i) => (
            <img
              key={`${chapter.id}-${i}`}
              src={proxyImg(src)}
              alt={`Page ${i + 1}`}
              loading="lazy"
              data-page={i}
              className="mb-2 w-full select-none rounded"
              draggable={false}
            />
          ))}
        </div>
      ) : (
        <div className="flex min-h-screen flex-col items-center justify-start px-2 pb-24 pt-16">
          <div className="relative flex w-full max-w-[800px] items-center justify-center">
            <img
              key={`${chapter.id}-${pageIndex}`}
              src={proxyImg(chapter.pages[pageIndex])}
              alt={`Page ${pageIndex + 1}`}
              className="max-h-[88vh] w-auto max-w-full select-none rounded object-contain"
              draggable={false}
            />
            {/* Tap zones */}
            <button
              onClick={pagedPrev}
              aria-label="Previous page"
              className="absolute inset-y-0 left-0 w-1/4 cursor-w-resize focus:outline-none"
            />
            <button
              onClick={pagedNext}
              aria-label="Next page"
              className="absolute inset-y-0 right-0 w-1/4 cursor-e-resize focus:outline-none"
            />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={pagedPrev}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-200 enabled:hover:border-indigo-500 disabled:opacity-40"
              disabled={pageIndex === 0 && !prevChapter}
            >
              ← Prev
            </button>
            <span className="px-2 text-xs text-gray-400">
              {pageIndex + 1} / {totalPages}
            </span>
            <button
              onClick={pagedNext}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-200 enabled:hover:border-indigo-500 disabled:opacity-40"
              disabled={
                pageIndex === totalPages - 1 && !nextChapter
              }
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Chapter navigation */}
      <div className="mx-auto max-w-[800px] px-3 pb-28 pt-2">
        <div className="flex items-center justify-between gap-3 border-t border-gray-800 pt-4">
          <button
            onClick={() => goToChapter(prevChapter)}
            disabled={!prevChapter}
            className="flex-1 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-200 transition-colors enabled:hover:border-indigo-500 enabled:hover:text-indigo-300 disabled:opacity-40"
          >
            ← {prevChapter ? `Ch. ${formatNum(prevChapter.chapter_number)}` : "First chapter"}
          </button>
          <Link
            to={`/manga/${slug}`}
            className="rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:border-indigo-500 hover:text-indigo-300"
          >
            All chapters
          </Link>
          <button
            onClick={() => goToChapter(nextChapter)}
            disabled={!nextChapter}
            className="flex-1 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-200 transition-colors enabled:hover:border-indigo-500 enabled:hover:text-indigo-300 disabled:opacity-40"
          >
            {nextChapter ? `Ch. ${formatNum(nextChapter.chapter_number)}` : "Latest chapter"} →
          </button>
        </div>
      </div>
    </div>
  );
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function PagedIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h2M16 4h2a2 2 0 012 2v12a2 2 0 01-2 2h-2"
      />
    </svg>
  );
}
function ScrollIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 10l7-7m0 0l7 7m-7-7v18"
      />
    </svg>
  );
}
