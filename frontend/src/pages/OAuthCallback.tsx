import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { setToken } from "../api/client.ts";
import * as authApi from "../api/auth.ts";
import { useAuth } from "../auth/AuthContext.tsx";
import { BrandLogo } from "../components/BrandLogo.tsx";

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
          void navigate("/", { replace: true });
        } catch (err) {
          if (!cancelled) {
            setError((err instanceof Error ? err.message : "") || "Connexion OAuth échouée");
          }
        }
      }
      void finish();
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
