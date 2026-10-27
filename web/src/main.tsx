import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './api/queryClient';
import { AuthProvider } from './auth/AuthProvider';
import App from './App';
import './styles.css';
import { installDemo } from './demo/mock';

// Demo builds answer API calls in the browser and keep routes in memory (they are
// embedded in pages whose URL they don't control). Removed from normal builds.
const DEMO = import.meta.env.VITE_DEMO === '1';
if (DEMO) installDemo();
const Router = DEMO ? MemoryRouter : BrowserRouter;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    </Router>
  </StrictMode>,
);
