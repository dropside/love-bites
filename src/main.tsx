import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Ask the browser not to evict Ren's cookbook and lists under storage pressure.
void navigator.storage?.persist?.();

document.getElementById('boot')?.remove();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
