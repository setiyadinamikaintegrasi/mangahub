import { Link } from "react-router-dom";
import { proxyImg, type Manga } from "../lib/api";

const STATUS_STYLES: Record<string, string> = {
  ongoing: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  completed: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  hiatus: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  cancelled: "bg-rose-500/20 text-rose-300 border-rose-500/30",
};

export default function MangaCard({ manga }: { manga: Manga }) {
  const statusStyle =
    STATUS_STYLES[manga.status?.toLowerCase()] ??
    "bg-gray-500/20 text-gray-300 border-gray-500/30";

  return (
    <Link
      to={`/manga/${manga.slug}`}
      className="group block overflow-hidden rounded-xl bg-gray-800 shadow-lg transition-transform duration-200 hover:scale-105 hover:shadow-indigo-500/10"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-gray-700">
        {manga.cover_url ? (
          <img
            src={proxyImg(manga.cover_url)}
            alt={manga.title}
            loading="lazy"
            className="h-full w-full object-cover transition-opacity duration-300 group-hover:opacity-90"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = "0";
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-500">
            <svg
              className="h-10 w-10"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 6.25278v13m0-13C10.8321 5.47686 9.24649 5 7.5 5S4.16789 5.47686 3 6.25278v13C4.16789 18.4769 5.75351 18 7.5 18s3.3321.4769 4.5 1.2528m0-13C13.1679 5.47686 14.7535 5 16.5 5c1.7465 0 3.3321.47686 4.5 1.25278v13C19.8321 18.4769 18.2465 18 16.5 18c-1.7465 0-3.3321.4769-4.5 1.2528"
              />
            </svg>
          </div>
        )}
        <span
          className={`absolute left-2 top-2 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide backdrop-blur ${statusStyle}`}
        >
          {manga.status}
        </span>
      </div>
      <div className="p-2">
        <h3 className="clamp-2 text-sm font-medium leading-snug text-gray-100">
          {manga.title}
        </h3>
        {manga.author && (
          <p className="mt-0.5 truncate text-xs text-gray-400">{manga.author}</p>
        )}
      </div>
    </Link>
  );
}
