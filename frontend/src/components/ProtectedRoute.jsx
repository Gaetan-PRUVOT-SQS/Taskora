import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

export function ProtectedRoute(props) {
  const auth = useAuth();

  if (auth.loading) {
    return <div className="page">Chargement...</div>;
  }

  if (!auth.token) {
    return <Navigate to="/login" replace />;
  }

  return props.children;
}
