import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { ProtectedRoute } from "./components/ProtectedRoute.jsx";
import { Login } from "./pages/Login.jsx";
import { Register } from "./pages/Register.jsx";
import { Boards } from "./pages/Boards.jsx";
import { Board } from "./pages/Board.jsx";
import { InviteAccept } from "./pages/InviteAccept.jsx";
import { OAuthCallback } from "./pages/OAuthCallback.jsx";
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
