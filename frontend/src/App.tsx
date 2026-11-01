import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { ProtectedRoute } from "./components/ProtectedRoute.tsx";
import { Login } from "./pages/Login.tsx";
import { Register } from "./pages/Register.tsx";
import { Boards } from "./pages/Boards.tsx";
import { Board } from "./pages/Board.tsx";
import { InviteAccept } from "./pages/InviteAccept.tsx";
import { OAuthCallback } from "./pages/OAuthCallback.tsx";
import "./styles/app.css";

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/oauth/callback" element={<OAuthCallback />} />
            <Route path="/invite/:token" element={<InviteAccept />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Boards />
                </ProtectedRoute>
              }
            />
            <Route
              path="/boards/:id"
              element={
                <ProtectedRoute>
                  <Board />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
