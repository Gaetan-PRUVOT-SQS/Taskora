import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import * as invitesApi from "../api/invites.js";
import { BrandLogo } from "../components/BrandLogo.jsx";

export function InviteAccept() {
  const params = useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(
    function () {
      async function load() {
        try {
          const data = await invitesApi.getInvite(params.token);
          setMeta(data);
        } catch (err) {
          setError(err.message);
        }
        setLoading(false);
      }
      load();
    },
    [params.token]
  );

  async function handleAccept() {
    setError("");
    if (!auth.token) {
      navigate("/login");
      return;
    }
    try {
      const res = await invitesApi.acceptInvite(params.token);
      navigate("/boards/" + res.board_id);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page auth-page">
      <div className="auth-box">
        <div className="auth-brand">
          <BrandLogo variant="lockup" size="md" />
        </div>
        <h1 className="auth-heading">Invitation</h1>
        {loading ? <p>Chargement…</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {meta ? (
          <div>
            <p className="subtitle">
              Rejoindre le board <strong>{meta.board_title}</strong>
            </p>
            {auth.token ? (
              <button
                type="button"
                className="btn primary"
                onClick={handleAccept}
              >
                Accepter l&apos;invitation
              </button>
            ) : (
              <p className="hint">
                <Link to="/login">Connecte-toi</Link> ou{" "}
                <Link to="/register">crée un compte</Link> pour accepter.
              </p>
            )}
          </div>
        ) : null}
        <p className="auth-link">
          <Link to="/">Retour</Link>
        </p>
      </div>
    </div>
  );
}
