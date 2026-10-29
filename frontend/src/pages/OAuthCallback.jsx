import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { setToken } from "../api/client.js";
import * as authApi from "../api/auth.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { BrandLogo } from "../components/BrandLogo.jsx";

export function OAuthCallback() {
  const navigate = useNavigate();
  const auth = useAuth();
  const applySession = auth && auth.applySession;
  const [error, setError] = useState("");

  useEffect(
    function () {
      let cancelled = false;
      async function finish() {
        const hash = window.location.hash || "";
        const token = new URLSearchParams(hash.replace(/^#/, "")).get("token");
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search
        );
        if (!token) {
          if (!cancelled) {
            setError("Token OAuth manquant");
          }
          return;
        }
        try {
          setToken(token);
          const profile = await authApi.me();
          if (cancelled) {
            return;
          }
          if (applySession) {
            applySession(token, profile);
          } else {
            window.location.href = "/";
            return;
          }
          navigate("/", { replace: true });
        } catch (err) {
          if (!cancelled) {
            setError(err.message || "Connexion OAuth échouée");
          }
        }
      }
      finish();
      return function () {
        cancelled = true;
      };
    },
    [applySession, navigate]
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
