import { patchFileReaderForImageCompression } from './utils/imageCompression';
patchFileReaderForImageCompression();

import React from 'react';
import ReactDOM from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { FirebaseProvider } from './context/FirebaseContext';
import { OnlineProvider } from './context/OnlineContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <FirebaseProvider>
        <OnlineProvider>
          <App />
          <Analytics />
        </OnlineProvider>
      </FirebaseProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  });
}
