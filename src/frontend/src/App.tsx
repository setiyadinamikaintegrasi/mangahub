import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Layout from "./components/Layout";
import RequireAuth from "./components/RequireAuth";
import Discover from "./pages/Discover";
import MangaDetail from "./pages/MangaDetail";
import Reader from "./pages/Reader";
import Library from "./pages/Library";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Profile from "./pages/Profile";
import ReadingLists from "./pages/ReadingLists";
import ReadingListDetail from "./pages/ReadingListDetail";

export default function App() {
  const location = useLocation();
  const isReader = location.pathname.includes("/chapter/");

  // Reader is full-bleed (no chrome); everything else is wrapped in Layout.
  if (isReader) {
    return (
      <Routes>
        <Route path="/manga/:slug/chapter/:num" element={<Reader />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Discover />} />
        <Route path="/manga/:slug" element={<MangaDetail />} />
        <Route
          path="/library"
          element={
            <RequireAuth>
              <Library />
            </RequireAuth>
          }
        />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <Profile />
            </RequireAuth>
          }
        />
        <Route path="/lists" element={<ReadingLists />} />
        <Route path="/lists/:slug" element={<ReadingListDetail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
