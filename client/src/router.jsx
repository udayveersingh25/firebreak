import { createBrowserRouter } from 'react-router';
import AppLayout from './components/AppLayout.jsx';
import GuestOnly from './components/GuestOnly.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
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
            children: [{ path: 'dashboard', element: <DashboardPage /> }],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
