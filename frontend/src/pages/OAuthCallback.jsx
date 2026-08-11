import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { setToken } from "../api/client.js";
import * as authApi from "../api/auth.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { BrandLogo } from "../components/BrandLogo.jsx";

export function OAuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const [error, setError] = useState("");

  useEffect(
    function () {
      async function finish() {
        const token = params.get("token");
        if (!token) {
          setError("Token OAuth manquant");
          return;
        }
        try {
          setToken(token);
          const profile = await authApi.me();
          // met à jour le contexte sans re-login
          if (auth && auth.applySession) {
            auth.applySession(token, profile);
          } else {
            // fallback : reload pour recharger AuthProvider
            window.location.href = "/";
            return;
          }
          navigate("/");
        } catch (err) {
          setError(err.message || "Connexion OAuth échouée");
        }
      }
      finish();
    },
    []
  );

  return (
    <div className="page auth-page">
      <div className="auth-box">
        <div className="auth-brand">
          <BrandLogo variant="lockup" size="md" />
        </div>
        {error ? (
          <p className="error">{error}</p>
        ) : (
          <p className="subtitle">Connexion en cours…</p>
        )}
      </div>
    </div>
  );
}
