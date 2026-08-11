import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { BrandLogo } from "../components/BrandLogo.jsx";

export function Register() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    try {
      await auth.register(name, email, password);
      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page auth-page">
      <form className="auth-box" onSubmit={handleSubmit}>
        <div className="auth-brand">
          <BrandLogo variant="lockup" size="md" />
        </div>
        <p className="subtitle">Inscription</p>
        {error ? <p className="error">{error}</p> : null}
        <label>
          Nom
          <input
            type="text"
            value={name}
            onChange={function (e) {
              setName(e.target.value);
            }}
            required
          />
        </label>
        <label>
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
        <label>
          Mot de passe
          <input
            type="password"
            value={password}
            onChange={function (e) {
              setPassword(e.target.value);
            }}
            minLength={6}
            required
          />
        </label>
        <button type="submit" className="btn primary">
          Créer mon compte
        </button>
        <p className="auth-link">
          Déjà inscrit ? <Link to="/login">Se connecter</Link>
        </p>
      </form>
    </div>
  );
}
