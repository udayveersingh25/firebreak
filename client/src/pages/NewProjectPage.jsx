import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { createProject } from '../api/projects.js';
import { Button } from '../components/Button.jsx';
import EnvNamesInput from '../components/EnvNamesInput.jsx';
import FormAlert from '../components/FormAlert.jsx';
import LockfileUpload from '../components/LockfileUpload.jsx';
import TextField from '../components/TextField.jsx';
import { useForm } from '../hooks/useForm.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { useToast } from '../hooks/useToast.js';
import { HOSTING_PROVIDERS } from '../lib/labels.js';

const STEPS = ['Name and hosting', 'Dependencies', 'Secret names'];

/**
 * Three steps. The project is created at step 1, so the lockfile and the
 * secret names are checked by the server as soon as you add them and any
 * problem shows up on the step that caused it.
 */
export default function NewProjectPage() {
  usePageTitle('Add a project');
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [project, setProject] = useState(null);

  const finish = () => navigate(`/projects/${project.id}`);
  const skip = (label, onClick) => (
    <Button variant="ghost" onClick={onClick}>
      {label}
    </Button>
  );

  return (
    <section className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Add a project</h1>
      <ol className="mt-6 grid grid-cols-3 gap-2 text-xs sm:text-sm" aria-label="Progress">
        {STEPS.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? 'step' : undefined}
            className={`border-t-4 pt-2 ${index <= step ? 'border-slate-900 text-slate-900' : 'border-slate-200 text-slate-500'}`}
          >
            <span className="font-medium">Step {index + 1}</span>
            <span className="block">{label}</span>
          </li>
        ))}
      </ol>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        {step === 0 && (
          <DetailsStep
            onCreated={(created) => {
              setProject(created);
              setStep(1);
            }}
          />
        )}

        {step === 1 && (
          <>
            <h2 className="text-lg font-semibold">Upload your package-lock.json</h2>
            <p className="mt-2 text-sm text-slate-600">
              This tells us exactly which package versions your app installs, so we can check them against
              known vulnerabilities. It is optional, but without it every dependency check will say
              "Needs info".
            </p>
            <div className="mt-6">
              <LockfileUpload
                projectId={project.id}
                submitLabel="Upload and continue"
                onUploaded={(updated) => {
                  setProject(updated);
                  setStep(2);
                }}
                secondaryAction={skip('Skip for now', () => setStep(2))}
              />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-lg font-semibold">Add your secret names</h2>
            <p className="mt-2 text-sm text-slate-600">
              We use the names of your environment variables to work out which services you depend on and
              which keys would be exposed in a breach. We never need, and never receive, the values.
            </p>
            <div className="mt-6">
              <EnvNamesInput
                projectId={project.id}
                submitLabel="Send names and finish"
                onSaved={finish}
                secondaryAction={skip('Skip for now', finish)}
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function DetailsStep({ onCreated }) {
  const toast = useToast();
  const selectId = useId();
  const { formRef, fieldProps, submit, submitting, formError } = useForm({ name: '', hostingProvider: '' });
  const hosting = fieldProps('hostingProvider');

  function handleSubmit(event) {
    event.preventDefault();
    submit(
      ({ name, hostingProvider }) => ({
        ...(name.trim() ? {} : { name: 'Enter a project name' }),
        ...(name.trim().length > 60 ? { name: 'Use at most 60 characters' } : {}),
        ...(hostingProvider ? {} : { hostingProvider: 'Choose where this app is hosted' }),
      }),
      async (values) => {
        const { project } = await createProject(values);
        toast.success(`Created ${project.name}.`);
        onCreated(project);
      },
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-4">
      <h2 className="text-lg font-semibold">Which app is this?</h2>
      {formError && <FormAlert>{formError.message}</FormAlert>}
      <TextField label="Project name" hint="For example, the name of your app or repository." {...fieldProps('name')} />
      <div>
        <label htmlFor={selectId} className="block text-sm font-medium text-slate-800">
          Where is it hosted?
        </label>
        <select
          id={selectId}
          name={hosting.name}
          value={hosting.value}
          onChange={hosting.onChange}
          aria-invalid={hosting.error ? true : undefined}
          aria-describedby={hosting.error ? `${selectId}-error` : `${selectId}-hint`}
          className={`mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-xs focus:ring-2 focus:outline-none ${
            hosting.error ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:ring-slate-200'
          }`}
        >
          <option value="">Choose a hosting provider</option>
          {HOSTING_PROVIDERS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {hosting.error ? (
          <p id={`${selectId}-error`} className="mt-1 text-sm text-red-700">
            {hosting.error}
          </p>
        ) : (
          <p id={`${selectId}-hint`} className="mt-1 text-sm text-slate-500">
            If your host has a breach, everything in its environment settings could be exposed.
          </p>
        )}
      </div>
      <Button type="submit" loading={submitting}>
        {submitting ? 'Creating…' : 'Create and continue'}
      </Button>
    </form>
  );
}
