import { ButtonLink } from '../components/Button.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { usePageTitle } from '../hooks/usePageTitle.js';

const QUESTIONS = [
  {
    title: 'Is my app affected?',
    body: 'When an incident is published, Firebreak checks it against every project you track and tells you exactly why each one is or is not affected.',
  },
  {
    title: 'What is exposed?',
    body: 'See which secrets an incident puts at risk and what someone could do with each one, such as creating charges with your Stripe key.',
  },
  {
    title: 'What do I do first?',
    body: 'Follow an ordered checklist. New keys go live before old ones are revoked, so your app stays up, and the incident only closes once the fix is verified.',
  },
];

const PROMISES = [
  {
    title: 'Secret values never leave your browser',
    body: 'Paste your .env file and Firebreak keeps only the variable names. The values are discarded on your device before anything is sent.',
  },
  {
    title: 'No false calm, no false alarms',
    body: 'If we cannot know whether you are affected, we say so, explain why, and show you what would let us check.',
  },
  {
    title: 'Your projects stay yours',
    body: 'Only you can see your projects. Admins publish incidents and see totals, never your dependencies or secret names.',
  },
];

const STATUS_MEANINGS = [
  ['open', 'An incident affects this project and work has not started.'],
  ['in_progress', 'You are working through the checklist.'],
  ['resolved', 'Every step is done and the fix is verified.'],
  ['not_affected', 'This incident does not apply to this project.'],
  ['unknown', 'Information is missing, such as your lockfile, so we cannot decide yet.'],
];

export default function LandingPage() {
  usePageTitle();
  const { status } = useAuth();

  return (
    <>
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
          <p className="text-sm font-semibold tracking-wide text-orange-700 uppercase">
            Breach response for vibe-coded apps
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Know in minutes whether a security incident affects your app.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-pretty text-slate-600">
            Firebreak keeps an inventory of your app's dependencies and secret names. When a new
            vulnerability or breach is announced, it tells you if you are affected, what is exposed, and
            what to do first, in plain language.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {status === 'authenticated' ? (
              <ButtonLink to="/dashboard">Go to your dashboard</ButtonLink>
            ) : (
              <>
                <ButtonLink to="/register">Get started, it's free</ButtonLink>
                <ButtonLink to="/login" variant="secondary">
                  Log in
                </ButtonLink>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6" aria-labelledby="questions-heading">
        <h2 id="questions-heading" className="text-2xl font-semibold tracking-tight">
          The three questions that matter during an incident
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {QUESTIONS.map(({ title, body }) => (
            <article key={title} className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-slate-600">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white" aria-labelledby="promises-heading">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <h2 id="promises-heading" className="text-2xl font-semibold tracking-tight">
            Calm and correct, by design
          </h2>
          <dl className="mt-8 grid gap-8 sm:grid-cols-3">
            {PROMISES.map(({ title, body }) => (
              <div key={title}>
                <dt className="font-semibold">{title}</dt>
                <dd className="mt-2 text-sm text-slate-600">{body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6" aria-labelledby="status-heading">
        <h2 id="status-heading" className="text-2xl font-semibold tracking-tight">
          Every answer is one of these
        </h2>
        <p className="mt-2 max-w-2xl text-slate-600">
          "Needs info" is a real answer. We never show an all-clear we cannot back up.
        </p>
        <ul className="mt-8 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {STATUS_MEANINGS.map(([status, meaning]) => (
            <li key={status} className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:gap-6">
              <span className="sm:w-32">
                <StatusBadge status={status} />
              </span>
              <span className="text-sm text-slate-600">{meaning}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
