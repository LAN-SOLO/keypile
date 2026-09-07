import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// Theme synchron VOR dem ersten Render setzen, damit der Unlock-Screen
// nicht kurz dunkel aufblitzt. App.tsx spiegelt die Einstellung hierher.
try {
  const cached = localStorage.getItem('theme');
  document.documentElement.dataset.theme = cached === 'light' ? 'light' : 'dark';
} catch {
  document.documentElement.dataset.theme = 'dark';
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
