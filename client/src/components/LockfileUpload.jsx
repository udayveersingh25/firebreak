import { useId, useState } from 'react';
import { uploadLockfile } from '../api/projects.js';
import { useToast } from '../hooks/useToast.js';
import { Button } from './Button.jsx';
import FormAlert from './FormAlert.jsx';

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Picks package-lock.json and sends its text. The browser only checks the size;
 * the server does all parsing, so its messages explain anything else wrong.
 */
export default function LockfileUpload({ projectId, onUploaded, submitLabel = 'Upload lockfile', secondaryAction }) {
  const inputId = useId();
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!file) {
      setError('Choose your package-lock.json first.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('This file is larger than 5 MB. Make sure you picked package-lock.json and not a different file.');
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const { project } = await uploadLockfile(projectId, await file.text());
      toast.success(`Recorded ${project.lockfile.packageCount} packages from your lockfile.`);
      onUploaded(project);
    } catch (uploadError) {
      setError(uploadError.message);
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {error && <FormAlert>{error}</FormAlert>}
      <div>
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-800">
          package-lock.json
        </label>
        <input
          id={inputId}
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            setFile(event.target.files[0] ?? null);
            setError(null);
          }}
          className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-900 hover:file:bg-slate-200"
        />
        <p className="mt-1 text-sm text-slate-500">
          It is in the root of your project, next to package.json. npm 7 or newer, up to 5 MB.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={uploading}>
          {uploading ? 'Reading your lockfile…' : submitLabel}
        </Button>
        {secondaryAction}
      </div>
    </form>
  );
}
