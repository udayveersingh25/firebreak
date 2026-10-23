import { createBrowserRouter } from 'react-router';
import AppLayout from './components/AppLayout.jsx';
import LandingPage from './pages/LandingPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
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
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
