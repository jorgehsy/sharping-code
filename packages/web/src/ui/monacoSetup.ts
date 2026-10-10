import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

// Bundle Monaco locally (no CDN). monaco-editor >= 0.5x spawns its own workers through
// `new Worker(new URL('x.worker.js', import.meta.url))`, which Vite bundles natively:
// no MonacoEnvironment.getWorker mapping needed.
loader.config({ monaco });
