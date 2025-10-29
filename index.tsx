
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Add error handling for initialization
try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (error) {
  console.error('Failed to initialize app:', error);
  rootElement.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #030303; color: white; font-family: system-ui;">
      <div style="max-width: 600px; padding: 32px; text-align: center;">
        <h1 style="font-size: 24px; margin-bottom: 16px;">⚠️ App Initialization Error</h1>
        <p style="margin-bottom: 16px; color: #888;">The application failed to start. This is usually due to missing environment variables.</p>
        <pre style="background: #111; padding: 16px; border-radius: 8px; text-align: left; overflow-x: auto; font-size: 12px;">${error instanceof Error ? error.message : String(error)}</pre>
        <p style="margin-top: 16px; font-size: 14px; color: #666;">Check the browser console for more details.</p>
      </div>
    </div>
  `;
}
