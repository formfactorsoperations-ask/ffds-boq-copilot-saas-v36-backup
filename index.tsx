
import React from 'react';
import ReactDOM from 'react-dom/client';

window.addEventListener('error', (e) => {
  console.log("Global error:", e.message);
  fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'error', message: e.message, filename: e.filename, lineno: e.lineno, stack: e.error?.stack }) });
});

import App from './App';
import { OrgProvider } from './contexts/OrgContext';

// Suppress Vite WebSocket connection errors in preview environment
const originalConsoleError = console.error;
console.error = (...args) => {
  if (
    typeof args[0] === 'string' && 
    (args[0].includes('[vite] failed to connect to websocket') || 
     args[0].includes('WebSocket closed without opened'))
  ) {
    return; // Suppress the specific Vite HMR error
  }
  originalConsoleError(...args);
};

window.addEventListener('unhandledrejection', (event) => {
  let reasonStr = '';
  if (event.reason instanceof Error) {
    reasonStr = event.reason.message;
  } else if (typeof event.reason === 'string') {
    reasonStr = event.reason;
  } else if (event.reason && typeof event.reason === 'object') {
    try { reasonStr = JSON.stringify(event.reason); } catch(e) {}
    if (event.reason.message) reasonStr += ' ' + event.reason.message;
  }
  
  if (reasonStr.includes('WebSocket') || reasonStr.includes('WebChannel') || reasonStr.includes('transport errored')) {
    event.preventDefault();
  }
});

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
    fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'boundary', message: error.message, stack: error.stack, componentStack: errorInfo.componentStack }) });
  }

  render() {
    if (this.state.hasError) {
      return <div style={{padding: '20px', background: '#ffebee', color: '#c62828'}}><h1>Something went wrong.</h1><pre>{this.state.error?.message}</pre></div>;
    }
    return (this as any).props.children;
  }
}

console.log("index.tsx starting");
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}
console.log("Found root element, creating root...");
const root = ReactDOM.createRoot(rootElement);
console.log("Root created, rendering...");
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <OrgProvider>
        <App />
      </OrgProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
