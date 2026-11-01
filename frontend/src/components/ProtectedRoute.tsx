import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.tsx";

export function ProtectedRoute(props: { children?: ReactNode }) {
  const auth = useAuth();

  if (auth.loading) {
    return <div className="page">Chargement...</div>;
  }

  if (!auth.token) {
    return <Navigate to="/login" replace />;
  }

  return props.children;
}
