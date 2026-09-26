import { Routes, Route, Navigate } from "react-router-dom";

import PublicLayout from "./layouts/PublicLayout";
import AdminLayout from "./layouts/AdminLayout";
import ParticipantLayout from "./layouts/ParticipantLayout";

import LandingPage from "./pages/public/LandingPage";
import RulesPage from "./pages/public/RulesPage";
import AuthPage from "./pages/public/AuthPage";

import QuizLobbyPage from "./pages/round1/QuizLobbyPage";
import QuizPage from "./pages/round1/QuizPage";

import TeamLobbyPage from "./pages/round2/TeamLobbyPage";
import CodingWorkspacePage from "./pages/round2/CodingWorkspacePage";

import AdminDashboardPage from "./pages/admin/DashboardPage";
import AdminQuestionsPage from "./pages/admin/QuestionsPage";
import AdminParticipantsPage from "./pages/admin/ParticipantsPage";
import AdminTeamsPage from "./pages/admin/TeamsPage";
import AdminLeaderboardPage from "./pages/admin/LeaderboardPage";
import AdminLiveMonitorPage from "./pages/admin/LiveMonitorPage";

import ProtectedRoute from "./components/ProtectedRoute";

export default function App() {
  return (
    <Routes>
      {/* Public site (navbar + footer) */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/auth" element={<AuthPage />} />
        {/* Old auth URLs now funnel into the single login/register page. */}
        <Route path="/login" element={<Navigate to="/auth" replace />} />
        <Route path="/register" element={<Navigate to="/auth" replace />} />
      </Route>

      {/* Round 1 — requires participant auth (server-side in non-demo mode) */}
      <Route element={<ProtectedRoute role="participant" />}>
        <Route element={<ParticipantLayout />}>
          <Route path="/quiz" element={<QuizLobbyPage />} />
          <Route path="/team" element={<TeamLobbyPage />} />
        </Route>
        <Route path="/quiz/attempt" element={<QuizPage />} />
        {/* Round 2 workspace — immersive full-screen IDE */}
        <Route path="/team/workspace" element={<CodingWorkspacePage />} />
      </Route>

      {/* Admin console */}
      <Route path="/admin/login" element={<Navigate to="/auth" replace />} />
      <Route element={<ProtectedRoute role="admin" />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="questions" element={<AdminQuestionsPage />} />
          <Route path="participants" element={<AdminParticipantsPage />} />
          <Route path="teams" element={<AdminTeamsPage />} />
          <Route path="leaderboard" element={<AdminLeaderboardPage />} />
          <Route path="live" element={<AdminLiveMonitorPage />} />
        </Route>
      </Route>
    </Routes>
  );
}