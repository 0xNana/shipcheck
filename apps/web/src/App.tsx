import { Navigate, Route, Routes } from "react-router-dom";

import { LandingPage } from "./pages/LandingPage.js";
import { ReportPage } from "./pages/ReportPage.js";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/reports/:receiptId" element={<ReportPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
