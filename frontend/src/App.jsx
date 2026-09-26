import { Navigate, Route, Routes } from "react-router-dom";
import { AdminPage } from "./features/admin/AdminPage";
import { FolderInvitePage, Landing, Login, QuizInvitePage, ResetPassword } from "./features/auth/pages";
import { Dashboard } from "./features/library/Dashboard";
import { HostPage } from "./features/live/HostPage";
import { JoinPage, PlayerPage } from "./features/live/StudentPages";
import { QuizEditor, QuizPreview } from "./features/quiz/pages";
import { ResultsPage } from "./features/results/ResultsPage";
import { Protected } from "./shared/ui";

export default function App() {
  return <Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/login" element={<Login />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/folder-invite/:token" element={<FolderInvitePage />} />
    <Route path="/quiz-invite/:token" element={<QuizInvitePage />} />
    <Route path="/join" element={<JoinPage />} />
    <Route path="/play/:sessionId" element={<PlayerPage />} />
    <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
    <Route path="/admin" element={<Protected><AdminPage /></Protected>} />
    <Route path="/quizzes/:quizId/preview" element={<Protected><QuizPreview /></Protected>} />
    <Route path="/quizzes/:quizId" element={<Protected><QuizEditor /></Protected>} />
    <Route path="/host/:sessionId" element={<Protected><HostPage /></Protected>} />
    <Route path="/results/:sessionId" element={<Protected><ResultsPage /></Protected>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
