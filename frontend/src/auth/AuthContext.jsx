import { createContext, useCallback, useContext, useEffect, useState } from "react";
import * as authApi from "../api/auth.js";
import { clearToken, getToken, setToken } from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider(props) {
  const [user, setUser] = useState(null);
  const [token, setTokenState] = useState(getToken());
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
      } catch (err) {
        clearToken();
        setUser(null);
        setTokenState(null);
      }
      setLoading(false);
    }
    loadUser();
  }, []);

  async function login(email, password) {
    const result = await authApi.login(email, password);
    setToken(result.token);
    setTokenState(result.token);
    setUser(result.user);
    return result;
  }

  async function register(name, email, password) {
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
  const applySession = useCallback(function (newToken, profile) {
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

export function useAuth() {
  return useContext(AuthContext);
}
