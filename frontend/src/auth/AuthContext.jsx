import { createContext, useContext, useEffect, useState } from "react";
import * as authApi from "../api/auth.js";

const AuthContext = createContext(null);

// La session est portée par des cookies HttpOnly : le contexte ne garde que
// le profil, jamais de jeton.
export function AuthProvider(props) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(function () {
    async function loadUser() {
      try {
        const profile = await authApi.me();
        setUser(profile);
      } catch (err) {
        setUser(null);
      }
      setLoading(false);
    }
    loadUser();
  }, []);

  async function login(email, password) {
    const result = await authApi.login(email, password);
    setUser(result.user);
    return result;
  }

  async function register(name, email, password) {
    const result = await authApi.register(name, email, password);
    setUser(result.user);
    return result;
  }

  async function logout() {
    try {
      await authApi.logout();
    } catch (err) {
      // session déjà invalide côté serveur, on nettoie quand même l'état local
    }
    setUser(null);
  }

  // session déjà ouverte côté serveur (ex. retour OAuth)
  function applySession(profile) {
    setUser(profile);
  }

  const value = {
    user: user,
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
