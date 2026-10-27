import { createBrowserRouter } from 'react-router';
import AppLayout from './components/AppLayout.jsx';
import GuestOnly from './components/GuestOnly.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import NewProjectPage from './pages/NewProjectPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import AdminIncidentEditorPage from './pages/admin/AdminIncidentEditorPage.jsx';
import AdminIncidentsPage from './pages/admin/AdminIncidentsPage.jsx';
import RequireAdmin from './components/RequireAdmin.jsx';
import ProjectPage from './pages/ProjectPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import ResponsePage from './pages/ResponsePage.jsx';
import RouteErrorPage from './pages/RouteErrorPage.jsx';

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        // A crash inside a page renders here, inside the layout, so the
        // header and navigation keep working.
        errorElement: <RouteErrorPage />,
        children: [
          { index: true, element: <LandingPage /> },
          {
            element: <GuestOnly />,
            children: [
              { path: 'login', element: <LoginPage /> },
              { path: 'register', element: <RegisterPage /> },
            ],
          },
          {
            element: <RequireAuth />,
            children: [
              { path: 'dashboard', element: <DashboardPage /> },
              { path: 'projects/new', element: <NewProjectPage /> },
              { path: 'projects/:id', element: <ProjectPage /> },
              { path: 'notifications', element: <NotificationsPage /> },
              { path: 'responses/:id', element: <ResponsePage /> },
              {
                element: <RequireAdmin />,
                children: [
                  { path: 'admin/incidents', element: <AdminIncidentsPage /> },
                  { path: 'admin/incidents/new', element: <AdminIncidentEditorPage /> },
                  { path: 'admin/incidents/:id', element: <AdminIncidentEditorPage /> },
                ],
              },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
