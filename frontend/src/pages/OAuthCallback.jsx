import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as authApi from "../api/auth.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { BrandLogo } from "../components/BrandLogo.jsx";

export function OAuthCallback() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [error, setError] = useState("");

  useEffect(
    function () {
      async function finish() {
        // le serveur a posé les cookies de session, l'URL ne porte aucun jeton
        try {
          const profile = await authApi.me();
          if (auth && auth.applySession) {
            auth.applySession(profile);
          } else {
            window.location.href = "/";
            return;
          }
          // replace : l'URL de retour ne reste pas dans l'historique
          navigate("/", { replace: true });
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
