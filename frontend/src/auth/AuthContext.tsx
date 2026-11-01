import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import * as authApi from "../api/auth.ts";
import { clearToken, getToken, setToken } from "../api/client.ts";
import type { AuthSession, User } from "../types.ts";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthSession>;
  register: (name: string, email: string, password: string) => Promise<AuthSession>;
  logout: () => void;
  applySession: (newToken: string, profile: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider(props: { children?: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(getToken());
  const [loading, setLoading] = useState(true);

  useEffect(function () {
    async function loadUser() {
      const saved = getToken();
      if (!saved) {
        setLoading(false);
        return;
      }
      try {
        const profile = await authApi.me();
        setUser(profile);
        setTokenState(saved);
      } catch {
        clearToken();
        setUser(null);
        setTokenState(null);
      }
      setLoading(false);
    }
    void loadUser();
  }, []);

  async function login(email: string, password: string) {
    const result = await authApi.login(email, password);
    setToken(result.token);
    setTokenState(result.token);
    setUser(result.user);
    return result;
  }

  async function register(name: string, email: string, password: string) {
    const result = await authApi.register(name, email, password);
    setToken(result.token);
    setTokenState(result.token);
    setUser(result.user);
    return result;
  }

  function logout() {
    clearToken();
    setTokenState(null);
    setUser(null);
  }

  // session déjà obtenue (ex. OAuth callback)
  const applySession = useCallback(function (newToken: string, profile: User) {
    setToken(newToken);
    setTokenState(newToken);
    setUser(profile);
  }, []);

  const value = {
    user: user,
    token: token,
    loading: loading,
    login: login,
    register: register,
    logout: logout,
    applySession: applySession,
  };

  return (
    <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth doit être utilisé dans AuthProvider");
  }
  return value;
}
