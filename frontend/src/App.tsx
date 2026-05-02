// src/App.tsx
import React from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/Dashboard";
import DataExplorerPage from "./pages/DataExplorer";
import ETLPage from "./pages/ETLJobs";
import PredictPage from "./pages/Predictions";
import PredictInfosPage from "./components/ModelInfo";



import { ThemeProvider } from "./context/ThemeContext";


function PrivateRoute({ children }: { children: JSX.Element }) {
  const { token } = useAuth();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function LoginPageWrapper() {
  const { login, token } = useAuth();
  const navigate = useNavigate();

  // ✅ Already logged in → redirect to dashboard
  if (token) {
    return <Navigate to="/" replace />;
  }

  const handleLoggedIn = (token: string, email: string) => {
    login(token, email);
    navigate("/");
  };

  return <LoginPage onLoggedIn={handleLoggedIn} />;
}

function RegisterPageWrapper() {
  const { login, token } = useAuth();
  const navigate = useNavigate();

  // ✅ Already logged in → redirect to dashboard
  if (token) {
    return <Navigate to="/" replace />;
  }

  const handleLoggedIn = (token: string, email: string) => {
    login(token, email);
    navigate("/");
  };

  return <RegisterPage onLoggedIn={handleLoggedIn} />;
}
function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPageWrapper />} />
      <Route path="/register" element={<RegisterPageWrapper />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="data" element={<DataExplorerPage />} />
        <Route path="etl" element={<ETLPage />} />
        <Route path="predict" element={<PredictPage />} />
        <Route path="predict-infos" element={<PredictInfosPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
         <ThemeProvider>

    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}