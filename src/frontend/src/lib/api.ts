// ---- Types mirroring backend models/models.go JSON shapes ----

export interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  avatar_url?: string | null;
  created_at: string;
}

export interface Manga {
  id: string;
  source_id?: string | null;
  title: string;
  slug: string;
  cover_url?: string | null;
  description?: string | null;
  status: string;
  author?: string | null;
  artist?: string | null;
  genres: string[];
  last_scraped_at?: string | null;
  created_at: string;
}

// Chapter list item returned by GET /api/mangas/:slug (no pages)
export interface ChapterLite {
  id: string;
  manga_id: string;
  chapter_number: number;
  title?: string | null;
  created_at: string;
}

// Full chapter returned by GET /api/mangas/:slug/chapters/:num
export interface Chapter {
  id: string;
  manga_id: string;
  chapter_number: number;
  title?: string | null;
  pages: string[];
}

export interface MangaDetail {
  manga: Manga;
  chapters: ChapterLite[];
}

export interface MangaListResponse {
  mangas: Manga[];
  total: number;
  page: number;
  limit: number;
}

export type LibraryStatus =
  | "reading"
  | "completed"
  | "plan_to_read"
  | "dropped";

export interface LibraryEntry {
  id: string;
  user_id: string;
  manga_id: string;
  status: LibraryStatus;
  last_chapter_read?: number | null;
  created_at: string;
  manga?: Manga;
}

export interface ReadingHistory {
  id?: string;
  user_id?: string;
  chapter_id: string;
  page_index: number;
  read_mode: "vertical" | "paged";
  updated_at?: string;
}

export interface ReadingList {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  is_public: boolean;
  description?: string | null;
  created_at: string;
  author_name?: string | null;
  item_count?: number;
}

export interface ReadingListItem {
  id: string;
  list_id: string;
  manga_id: string;
  added_at: string;
  manga?: Manga;
}

export interface ReadingListDetail {
  list: ReadingList;
  items: ReadingListItem[];
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface ProgressResponse {
  chapter_num: number | null;
  page_index: number;
  read_mode: "vertical" | "paged";
}

// ---- Token storage ----

const TOKEN_KEY = "mangahub_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

// ---- Image proxy helper ----

export function proxyImg(url: string | null | undefined): string {
  if (!url) return "";
  return `/api/proxy/img?url=${encodeURIComponent(url)}`;
}

// ---- fetch wrapper ----

const BASE = "/api";

async function request<T>(
  method: string,
  path: string,
  opts: {
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined | null>;
    headers?: Record<string, string>;
    raw?: false;
  } = {}
): Promise<T> {
  const { body, query, headers } = opts;
  const url = new URL(`${BASE}${path}`, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }

  const finalHeaders: Record<string, string> = { ...headers };
  let payload: BodyInit | undefined;
  if (body !== undefined) {
    finalHeaders["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const token = getToken();
  if (token) finalHeaders["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method,
      headers: finalHeaders,
      body: payload,
    });
  } catch (e) {
    throw new ApiError("Network error", 0, e instanceof Error ? e.message : String(e));
  }

  if (res.status === 401) {
    clearToken();
    // Avoid redirect loop if already on /login.
    if (!window.location.pathname.startsWith("/login")) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?next=${next}`;
    }
    throw new ApiError("Unauthorized", 401);
  }

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    let detail: unknown;
    try {
      const data = await res.json();
      if (data && typeof data === "object" && "error" in data) {
        msg = String((data as { error: unknown }).error);
      }
      detail = data;
    } catch {
      try {
        detail = await res.text();
      } catch {
        /* ignore */
      }
    }
    throw new ApiError(msg, res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return undefined as T;
  return (await res.json()) as T;
}

export class ApiError extends Error {
  status: number;
  detail?: unknown;
  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export const api = {
  get: <T>(path: string, query?: Record<string, string | number | boolean | undefined | null>) =>
    request<T>("GET", path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, { body }),
  del: <T>(path: string) => request<T>("DELETE", path),
};

// ---- Typed endpoints (thin wrappers) ----

export const endpoints = {
  // Auth
  register: (username: string, email: string, password: string) =>
    api.post<AuthResponse>("/auth/register", { username, email, password }),
  login: (usernameOrEmail: string, password: string) =>
    api.post<AuthResponse>("/auth/login", {
      username_or_email: usernameOrEmail,
      password,
    }),
  me: () => api.get<{ user: User }>("/auth/me"),

  // Manga
  listMangas: (params: {
    q?: string;
    genre?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {}) => api.get<MangaListResponse>("/mangas", params),
  getManga: (slug: string) => api.get<MangaDetail>(`/mangas/${slug}`),
  getChapter: (slug: string, num: string | number) =>
    api.get<{ chapter: Chapter; pages: string[] }>(
      `/mangas/${slug}/chapters/${num}`
    ),

  // Reader progress
  saveProgress: (chapterId: string, pageIndex: number, readMode: "vertical" | "paged") =>
    api.post<{ ok: boolean }>("/reader/progress", {
      chapter_id: chapterId,
      page_index: pageIndex,
      read_mode: readMode,
    }),
  getProgress: (mangaSlug: string) =>
    api.get<ProgressResponse>(`/reader/progress/${mangaSlug}`),

  // Library
  listLibrary: () => api.get<{ entries: LibraryEntry[] }>("/library"),
  addLibrary: (mangaSlug: string, status: LibraryStatus = "reading") =>
    api.post<{ id: string; status: string }>("/library", {
      manga_slug: mangaSlug,
      status,
    }),
  updateLibrary: (
    mangaSlug: string,
    patch: { status?: LibraryStatus; last_chapter_read?: number }
  ) => api.put<{ status: string }>(`/library/${mangaSlug}`, patch),
  removeLibrary: (mangaSlug: string) => api.del<void>(`/library/${mangaSlug}`),

  // Reading lists
  listLists: (page = 1, limit = 20) =>
    api.get<{ lists: ReadingList[]; page: number; limit: number }>("/lists", {
      page,
      limit,
    }),
  getList: (slug: string) => api.get<ReadingListDetail>(`/lists/${slug}`),
  createList: (data: { name: string; description?: string; is_public?: boolean }) =>
    api.post<{ list: ReadingList }>("/lists", data),
  addListItem: (slug: string, mangaSlug: string) =>
    api.post<{ status: string }>(`/lists/${slug}/items`, { manga_slug: mangaSlug }),
  removeListItem: (slug: string, mangaSlug: string) =>
    api.del<void>(`/lists/${slug}/items/${mangaSlug}`),
};
