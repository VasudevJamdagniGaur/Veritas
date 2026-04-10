import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import FaceVerificationPage from "./pages/FaceVerificationPage";
import Dashboard from "./pages/Dashboard";
import InstructionsPage from "./pages/InstructionsPage";
import { AppProvider } from "./state/appState";

export default function App() {
  return (
    <AppProvider>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/verify" element={<FaceVerificationPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/instructions" element={<InstructionsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppProvider>
  );
}

