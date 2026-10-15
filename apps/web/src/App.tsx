import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { Navbar } from './components/Navbar';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Upload } from './pages/Upload';
import { MappingValidation } from './pages/MappingValidation';
import { TemplateEditor } from './pages/TemplateEditor';
import { SamplePreview } from './pages/SamplePreview';
import { BatchProgress } from './pages/BatchProgress';
import { Results } from './pages/Results';
import { SettingsHelp } from './pages/SettingsHelp';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading, checkSession } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    checkSession();
  }, []);

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: '1.4rem', color: 'var(--ink)' }}>
            Loading Bulk Certificate Generator...
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Navbar />
        <main style={{ flex: 1 }}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/upload"
              element={
                <ProtectedRoute>
                  <Upload />
                </ProtectedRoute>
              }
            />
            <Route
              path="/mapping"
              element={
                <ProtectedRoute>
                  <MappingValidation />
                </ProtectedRoute>
              }
            />
            <Route
              path="/editor"
              element={
                <ProtectedRoute>
                  <TemplateEditor />
                </ProtectedRoute>
              }
            />
            <Route
              path="/preview"
              element={
                <ProtectedRoute>
                  <SamplePreview />
                </ProtectedRoute>
              }
            />
            <Route
              path="/progress"
              element={
                <ProtectedRoute>
                  <BatchProgress />
                </ProtectedRoute>
              }
            />
            <Route
              path="/results"
              element={
                <ProtectedRoute>
                  <Results />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <SettingsHelp />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
};
