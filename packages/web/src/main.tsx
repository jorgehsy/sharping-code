import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createApp } from './app.ts';
import { App } from './ui/App.tsx';
import { AppContext } from './ui/context.ts';
import './ui/styles.css';

const root = createRoot(document.getElementById('root')!);
try {
  const app = createApp();
  app.controller.resume();
  root.render(
    <StrictMode>
      <AppContext.Provider value={app}>
        <App />
      </AppContext.Provider>
    </StrictMode>,
  );
} catch (e) {
  root.render(<pre className="fatal">{e instanceof Error ? e.message : String(e)}</pre>);
}
