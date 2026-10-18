import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { BrandLogo } from "../components/BrandLogo.jsx";

export function Login() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [githubEnabled, setGithubEnabled] = useState(false);
  // erreur OAuth lue une fois, à l'arrivée sur la page
  const oauthErrorRef = useRef(params.get("oauth_error"));

  useEffect(function () {
    const oauthError = oauthErrorRef.current;
    if (oauthError === "not_linked") {
      // même message que l'adresse soit inscrite ou non
      setError(
        "Aucun compte Taskora n'est rattaché à ce compte GitHub. Si tu as déjà un compte, connecte-toi avec ton mot de passe, puis lie GitHub depuis tes boards."
      );
    } else if (oauthError) {
      setError("Connexion GitHub impossible (" + oauthError + ")");
    }
    async function loadOAuth() {
      try {
        const res = await fetch("/api/auth/oauth/status");
        if (res.ok) {
          const data = await res.json();
          setGithubEnabled(data.github === true);
        }
      } catch (err) {
        // ignore
      }
    }
    loadOAuth();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    try {
      await auth.login(email, password);
      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page flex min-h-screen items-center justify-center bg-white p-6">
      <form
        className="auth-box flex w-full max-w-[520px] flex-col gap-3.5 rounded-3xl border border-[#eeeeee] bg-white px-7 py-8 shadow-lg"
        onSubmit={handleSubmit}
      >
        <div className="flex items-center justify-center py-1">
          <BrandLogo variant="lockup" size="md" />
        </div>
        <p className="subtitle text-center text-[15px] font-medium text-[#6e6e73]">
          Connexion
        </p>
        {error ? <p className="error">{error}</p> : null}
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-black">
          Email
          <input
            type="email"
            value={email}
            onChange={function (e) {
              setEmail(e.target.value);
            }}
            required
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-black">
          Mot de passe
          <input
            type="password"
            value={password}
            onChange={function (e) {
              setPassword(e.target.value);
            }}
            required
          />
        </label>
        <button type="submit" className="btn primary">
          Se connecter
        </button>
        {githubEnabled ? (
          <a className="btn oauth-btn" href="/api/auth/oauth/github">
            Continuer avec GitHub
          </a>
        ) : null}
        <p className="auth-link text-center text-sm text-[#6e6e73]">
          Pas de compte ? <Link to="/register">S&apos;inscrire</Link>
        </p>
      </form>
    </div>
  );
}
