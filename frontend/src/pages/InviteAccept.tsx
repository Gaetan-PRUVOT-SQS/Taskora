import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.tsx";
import * as invitesApi from "../api/invites.ts";
import { BrandLogo } from "../components/BrandLogo.tsx";
import type { InviteMeta } from "../types.ts";

export function InviteAccept() {
  const params = useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const [meta, setMeta] = useState<InviteMeta | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(
    function () {
      async function load() {
        try {
          const data = await invitesApi.getInvite(params.token);
          setMeta(data);
        } catch (err) {
          setError((err instanceof Error ? err.message : ""));
        }
        setLoading(false);
      }
      void load();
    },
    [params.token]
  );

  async function handleAccept() {
    setError("");
    if (!auth.token) {
      void navigate("/login");
      return;
    }
    try {
      const res = await invitesApi.acceptInvite(params.token);
      void navigate("/boards/" + res.board_id);
    } catch (err) {
      setError((err instanceof Error ? err.message : ""));
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
                onClick={function () {
                  void handleAccept();
                }}
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
