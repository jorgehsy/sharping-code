import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createApp } from './app.ts';
import { fetchRuntimeConfig, withRuntimeConfig } from './config.ts';
import { App } from './ui/App.tsx';
import { AppContext } from './ui/context.ts';
import './ui/styles.css';

const root = createRoot(document.getElementById('root')!);
const runtime = await fetchRuntimeConfig();
try {
  const app = createApp(withRuntimeConfig(import.meta.env, runtime));
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
