import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { ErrorBoundary } from './components/UI';
import ProtectedRoute from './components/ProtectedRoute';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Workspace from './pages/Workspace';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import { generateRoomId, addRecentRoom, getUserSession } from './utils/userSession';
import { createRoomApi } from './services/api';

/**
 * Route handler for direct /create-room or /launch links
 */
function DirectRoomLauncher() {
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    const launch = async () => {
      const newRoomId = generateRoomId();
      const user = getUserSession();
      try {
        await createRoomApi(newRoomId, user);
      } catch (e) {
        console.warn('Backend API room pre-creation note:', e.message);
      }
      if (isMounted) {
        addRecentRoom({ roomId: newRoomId, role: 'Creator' });
        navigate(`/room/${newRoomId}`, { replace: true });
      }
    };
    launch();
    return () => { isMounted = false; };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Creating real workspace...
        </p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<SignUp />} />

              {/* Protected Routes */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/join-room"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />

              {/* Room Workspaces */}
              <Route path="/room/:roomId" element={<Workspace />} />
              <Route path="/classroom/:roomId" element={<Workspace />} />
              <Route path="/create-room" element={<DirectRoomLauncher />} />
              <Route path="/launch" element={<DirectRoomLauncher />} />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
