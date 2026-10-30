import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { AuthLayout } from './components/layout/AuthLayout';
import { ProtectedRoute, PublicRoute, RoleRoute } from './components/layout/ProtectedRoute';
import { Spinner } from './components/ui/Feedback';
import { useAuthStore } from './store/authStore';

// --- Public pages -----------------------------------------------------------
const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));

// --- Authenticated pages ----------------------------------------------------
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Projects = lazy(() => import('./pages/projects/Projects'));
const ProjectDetail = lazy(() => import('./pages/projects/ProjectDetail'));
const Tasks = lazy(() => import('./pages/tasks/Tasks'));
const Kanban = lazy(() => import('./pages/tasks/Kanban'));
const Gantt = lazy(() => import('./pages/tasks/Gantt'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Reports = lazy(() => import('./pages/Reports'));
const Team = lazy(() => import('./pages/Team'));
const Notifications = lazy(() => import('./pages/Notifications'));
const ActivityLog = lazy(() => import('./pages/ActivityLog'));
const Profile = lazy(() => import('./pages/Profile'));
const UserManagement = lazy(() => import('./pages/settings/UserManagement'));
const NotFound = lazy(() => import('./pages/NotFound'));

/**
 * Suspense fallback shown while a page chunk loads.
 */
function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}

/**
 * Redirects legacy `/tasks/:id` links to the drawer-based task view.
 */
function LegacyTaskRedirect() {
  const { id } = useParams();
  return <Navigate to={`/tasks?task=${encodeURIComponent(id)}`} replace />;
}

/**
 * Redirects `/project/:id` or `/project/:id/:tab` (singular) to `/projects/...`
 */
function LegacyProjectRedirect() {
  const { id, tab } = useParams();
  const target = tab
    ? `/projects/${encodeURIComponent(id)}?tab=${encodeURIComponent(tab)}`
    : `/projects/${encodeURIComponent(id)}`;
  return <Navigate to={target} replace />;
}

/**
 * Application root: restores the session and declares every route.
 */
export default function App() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Auth */}
        <Route element={<AuthLayout />}>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <Register />
              </PublicRoute>
            }
          />
        </Route>

        {/* Application */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/projects/:id/:tab" element={<ProjectDetail />} />
          <Route path="/project" element={<Navigate to="/projects" replace />} />
          <Route path="/project/:id" element={<LegacyProjectRedirect />} />
          <Route path="/project/:id/:tab" element={<LegacyProjectRedirect />} />
          <Route path="/tasks" element={<Tasks />} />
          {/* Legacy deep link: task details live in a drawer, not a route. */}
          <Route path="/tasks/:id" element={<LegacyTaskRedirect />} />
          <Route path="/kanban" element={<Kanban />} />
          <Route path="/gantt" element={<Gantt />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/team" element={<Team />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/activity" element={<ActivityLog />} />
          <Route path="/profile" element={<Profile />} />
          <Route
            path="/settings/users"
            element={
              <RoleRoute roles={['admin']}>
                <UserManagement />
              </RoleRoute>
            }
          />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
