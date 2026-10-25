import { Link, useLocation } from 'react-router';
import { login } from '../api/auth.js';
import AuthCard from '../components/AuthCard.jsx';
import { Button } from '../components/Button.jsx';
import FormAlert from '../components/FormAlert.jsx';
import TextField from '../components/TextField.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useForm } from '../hooks/useForm.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { useToast } from '../hooks/useToast.js';
import { validateLogin } from '../lib/authValidation.js';

export default function LoginPage() {
  usePageTitle('Log in');
  const { signIn } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const { formRef, fieldProps, submit, submitting, formError } = useForm({ email: '', password: '' });
  const redirectedFrom = location.state?.from;

  function handleSubmit(event) {
    event.preventDefault();
    submit(validateLogin, async (values) => {
      const { user } = await login(values);
      toast.success(`Welcome back, ${user.name}.`);
      signIn(user); // the page then redirects to where you were heading
    });
  }

  return (
    <AuthCard
      title="Log in"
      subtitle={redirectedFrom ? 'Log in to continue to that page.' : 'Welcome back to Firebreak.'}
      footer={
        <>
          New to Firebreak?{' '}
          <Link to="/register" state={location.state} className="font-medium text-slate-900 underline underline-offset-2">
            Create an account
          </Link>
        </>
      }
    >
      <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-4">
        {formError && <FormAlert>{formError.message}</FormAlert>}
        <TextField label="Email" type="email" autoComplete="email" {...fieldProps('email')} />
        <TextField label="Password" type="password" autoComplete="current-password" {...fieldProps('password')} />
        <Button type="submit" loading={submitting} className="w-full">
          {submitting ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
    </AuthCard>
  );
}
