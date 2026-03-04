import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { UsageProvider } from './contexts/UsageContext';

const Home = React.lazy(() => import('./pages/Home'));
const Login = React.lazy(() => import('./pages/Login'));
const Register = React.lazy(() => import('./pages/Register'));
const ForgotPassword = React.lazy(() => import('./pages/ForgotPassword'));
const UpdatePassword = React.lazy(() => import('./pages/UpdatePassword'));

const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Generator = React.lazy(() => import('./pages/Generator'));
const DatabaseDesigner = React.lazy(() => import('./pages/DatabaseDesigner'));
const SourceControl = React.lazy(() => import('./pages/SourceControl'));
const SecurityDashboard = React.lazy(() => import('./pages/SecurityDashboard'));
const Settings = React.lazy(() => import('./pages/Settings'));
const Billing = React.lazy(() => import('./pages/Billing'));

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center text-slate-900 dark:text-white">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const RouteFallback = () => (
  <div className="min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center text-slate-900 dark:text-white">
    Loading...
  </div>
);

const withSuspense = (element: React.ReactNode) => (
  <React.Suspense fallback={<RouteFallback />}>
    {element}
  </React.Suspense>
);

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <UsageProvider>
          <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <div className="min-h-screen bg-background-light dark:bg-background-dark transition-colors duration-300">
              <Routes>
                <Route path="/" element={withSuspense(<Home />)} />
                <Route path="/login" element={withSuspense(<Login />)} />
                <Route path="/register" element={withSuspense(<Register />)} />
                <Route path="/forgot-password" element={withSuspense(<ForgotPassword />)} />
                <Route path="/update-password" element={withSuspense(<UpdatePassword />)} />
                <Route path="/dashboard" element={withSuspense(<ProtectedRoute><Dashboard /></ProtectedRoute>)} />
                <Route path="/generator" element={withSuspense(<ProtectedRoute><Generator /></ProtectedRoute>)} />
                <Route path="/database-designer" element={withSuspense(<ProtectedRoute><DatabaseDesigner /></ProtectedRoute>)} />
                <Route path="/source-control" element={withSuspense(<ProtectedRoute><SourceControl /></ProtectedRoute>)} />
                <Route path="/security" element={withSuspense(<ProtectedRoute><SecurityDashboard /></ProtectedRoute>)} />
                <Route path="/settings" element={withSuspense(<ProtectedRoute><Settings /></ProtectedRoute>)} />
                <Route path="/billing" element={withSuspense(<ProtectedRoute><Billing /></ProtectedRoute>)} />
              </Routes>
            </div>
          </Router>
        </UsageProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
