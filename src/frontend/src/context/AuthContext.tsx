import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearToken,
  endpoints,
  getToken,
  setToken,
  type User,
} from "../lib/api";

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean; // true during initial /auth/me check
}

interface AuthContextValue extends AuthState {
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  register: (
    username: string,
    email: string,
    password: string
  ) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => ({
    user: null,
    token: getToken(),
    loading: !!getToken(),
  }));

  // On mount (and whenever a token appears): validate via /auth/me.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setState({ user: null, token: null, loading: false });
      return;
    }
    let cancelled = false;
    endpoints
      .me()
      .then(({ user }) => {
        if (!cancelled) setState({ user, token, loading: false });
      })
      .catch(() => {
        // token invalid/expired — clear and continue as anonymous.
        clearToken();
        if (!cancelled) setState({ user: null, token: null, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (usernameOrEmail: string, password: string) => {
    const { token, user } = await endpoints.login(usernameOrEmail, password);
    setToken(token);
    setState({ user, token, loading: false });
  }, []);

  const register = useCallback(
    async (username: string, email: string, password: string) => {
      const { token, user } = await endpoints.register(
        username,
        email,
        password
      );
      setToken(token);
      setState({ user, token, loading: false });
    },
    []
  );

  const logout = useCallback(() => {
    clearToken();
    setState({ user: null, token: null, loading: false });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, register, logout }),
    [state, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
