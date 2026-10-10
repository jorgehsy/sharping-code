import Editor from '@monaco-editor/react';
import './monacoSetup.ts';

export function CodeEditor({ path, value, onChange }: { path: string; value: string; onChange: (v: string) => void }) {
  return (
    <Editor
      height="100%"
      language="typescript"
      path={`${path}.ts`}
      value={value}
      onChange={(v) => onChange(v ?? '')}
      theme="vs-dark"
      options={{ minimap: { enabled: false }, fontSize: 14, automaticLayout: true, scrollBeyondLastLine: false }}
    />
  );
}
