import { useId, useState } from 'react';
import { replaceSecretNames } from '../api/projects.js';
import { useToast } from '../hooks/useToast.js';
import { extractEnvNames } from '../lib/envNameExtractor.js';
import { Button } from './Button.jsx';
import FormAlert from './FormAlert.jsx';

/**
 * Paste a .env or pick the file. Names are extracted here in the browser and
 * the text (with its values) is thrown away straight after. The user sees the
 * exact list of names before anything is sent.
 */
export default function EnvNamesInput({ projectId, onSaved, submitLabel = 'Send these names', secondaryAction }) {
  const textareaId = useId();
  const fileId = useId();
  const toast = useToast();
  const [text, setText] = useState('');
  const [names, setNames] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function showPreview(sourceText) {
    const found = extractEnvNames(sourceText);
    setText(''); // discard the pasted values immediately
    setError(found.length === 0 ? 'We did not find any variable names. Each line should look like NAME=value.' : null);
    setNames(found.length === 0 ? null : found);
  }

  async function handleFile(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (file) showPreview(await file.text());
  }

  async function handleSend() {
    setSaving(true);
    setError(null);
    try {
      const { project } = await replaceSecretNames(projectId, names);
      toast.success(`Saved ${names.length} variable names.`);
      onSaved(project);
    } catch (saveError) {
      setError(saveError.message);
      setSaving(false);
    }
  }

  if (names) {
    return (
      <div className="space-y-4">
        {error && <FormAlert>{error}</FormAlert>}
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          We found {names.length} variable {names.length === 1 ? 'name' : 'names'}. Values were discarded in
          your browser and will never be sent.
        </div>
        <ul className="flex flex-wrap gap-2" aria-label="Variable names that will be sent">
          {names.map((name) => (
            <li key={name} className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-800">
              {name}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3">
          <Button onClick={handleSend} loading={saving}>
            {saving ? 'Sending names…' : submitLabel}
          </Button>
          <Button variant="secondary" onClick={() => setNames(null)} disabled={saving}>
            Start over
          </Button>
          {secondaryAction}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <FormAlert>{error}</FormAlert>}
      <div>
        <label htmlFor={textareaId} className="block text-sm font-medium text-slate-800">
          Paste your .env or .env.example
        </label>
        <textarea
          id={textareaId}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={7}
          spellCheck={false}
          autoComplete="off"
          placeholder={'STRIPE_SECRET_KEY=sk_live_...\nVITE_OPENAI_API_KEY=sk-...'}
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm shadow-xs placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200 focus:outline-none"
        />
        <p className="mt-1 text-sm text-slate-500">
          Only the names before each "=" are kept. Values are discarded in your browser.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => showPreview(text)} disabled={!text.trim()}>
          Find variable names
        </Button>
        <label
          htmlFor={fileId}
          className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 ring-inset hover:bg-slate-50 focus-within:outline-2 focus-within:outline-slate-900"
        >
          Or choose a .env file
          <input id={fileId} type="file" className="sr-only" onChange={handleFile} />
        </label>
        {secondaryAction}
      </div>
    </div>
  );
}
