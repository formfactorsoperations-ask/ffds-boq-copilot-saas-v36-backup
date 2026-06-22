
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { OrgProvider } from './contexts/OrgContext';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <div style={{padding: '20px', background: '#ffebee', color: '#c62828'}}><h1>Something went wrong.</h1><pre>{this.state.error?.message}</pre></div>;
    }
    return (this as any).props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Unregister any old service workers that might be caching the Vite HMR client
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for(let registration of registrations) {
      registration.unregister();
    }
  }).catch(function(err) {
    console.log('Service Worker registration failed: ', err);
  });
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <OrgProvider>
        <App />
      </OrgProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
