import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { PublicSigningApp } from './components/PublicSigningApp.tsx';
import './index.css';

const signingMatch = window.location.pathname.match(/^\/sign\/([^/]+)\/?$/);
const root = createRoot(document.getElementById('root')!);

root.render(
  <StrictMode>
    {signingMatch ? <PublicSigningApp token={decodeURIComponent(signingMatch[1])} /> : <App />}
  </StrictMode>,
);
