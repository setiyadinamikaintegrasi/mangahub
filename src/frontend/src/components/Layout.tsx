import { useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { proxyImg } from "../lib/api";

const NAV_LINKS = [
  { to: "/", label: "Discover", end: true, icon: IconDiscover },
  { to: "/library", label: "Library", end: false, icon: IconLibrary },
  { to: "/lists", label: "Lists", end: false, icon: IconLists },
  { to: "/profile", label: "Profile", end: false, icon: IconProfile },
];

function navLinkClass({ isActive }: { isActive: boolean }) {
  return `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive
      ? "bg-indigo-500/15 text-indigo-300"
      : "text-gray-300 hover:bg-gray-800 hover:text-white"
  }`;
}

function mobileNavClass({ isActive }: { isActive: boolean }) {
  return `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
    isActive ? "text-indigo-400" : "text-gray-400 hover:text-gray-200"
  }`;
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const q = search.trim();
    navigate(q ? `/?q=${encodeURIComponent(q)}` : "/");
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* Desktop top navbar */}
      <header className="sticky top-0 z-30 border-b border-gray-800 bg-gray-900/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.06.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z" />
              </svg>
            </span>
            <span className="hidden text-lg font-bold tracking-tight sm:inline">
              Manga<span className="text-indigo-400">Hub</span>
            </span>
          </Link>

          {/* Search bar (desktop) */}
          <form
            onSubmit={onSearch}
            className="relative mx-2 hidden flex-1 md:block"
          >
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search manga..."
              className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2 pl-9 pr-3 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <svg
              className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-500"
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

          <nav className="ml-auto hidden items-center gap-1 md:flex">
            {NAV_LINKS.slice(0, 3).map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={navLinkClass}>
                {l.label}
              </NavLink>
            ))}
            {user ? (
              <Link
                to="/profile"
                className="ml-1 flex items-center gap-2 rounded-full border border-gray-700 py-1 pl-1 pr-3 hover:border-indigo-500"
              >
                <Avatar user={user} size="sm" />
                <span className="max-w-[8rem] truncate text-sm">{user.username}</span>
              </Link>
            ) : (
              <Link
                to="/login"
                className="ml-1 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-600"
              >
                Login
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* Page content. pb-20 reserves space for the mobile bottom nav. */}
      <main className="mx-auto max-w-7xl px-4 pb-24 pt-4 md:pb-8">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-800 bg-gray-900/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md">
          {NAV_LINKS.map((l) => {
            const Icon = l.icon;
            return (
              <NavLink key={l.to} to={l.to} end={l.end} className={mobileNavClass}>
                <Icon className="h-5 w-5" />
                <span>{l.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function Avatar({
  user,
  size = "md",
}: {
  user: { username: string; avatar_url?: string | null };
  size?: "sm" | "md";
}) {
  const dims = size === "sm" ? "h-7 w-7 text-xs" : "h-20 w-20 text-2xl";
  if (user.avatar_url) {
    return (
      <img
        src={proxyImg(user.avatar_url)}
        alt={user.username}
        className={`${dims} rounded-full object-cover`}
      />
    );
  }
  const initial = user.username.charAt(0).toUpperCase() || "?";
  return (
    <span
      className={`${dims} flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 font-bold text-white`}
    >
      {initial}
    </span>
  );
}

// --- Inline nav icons (stroke-based, inherit currentColor) ---

function IconDiscover(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6h16M4 12h16M4 18h10"
      />
    </svg>
  );
}
function IconLibrary(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 5h14v14H5z M5 9h14 M9 5v14"
      />
    </svg>
  );
}
function IconLists(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
      />
    </svg>
  );
}
function IconProfile(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    </svg>
  );
}
