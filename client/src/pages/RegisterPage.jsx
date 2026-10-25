import { Link, useLocation } from 'react-router';
import { register } from '../api/auth.js';
import AuthCard from '../components/AuthCard.jsx';
import { Button } from '../components/Button.jsx';
import FormAlert from '../components/FormAlert.jsx';
import TextField from '../components/TextField.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useForm } from '../hooks/useForm.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { useToast } from '../hooks/useToast.js';
import { validateRegister } from '../lib/authValidation.js';

export default function RegisterPage() {
  usePageTitle('Create an account');
  const { signIn } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const { formRef, fieldProps, submit, submitting, formError } = useForm({ name: '', email: '', password: '' });

  function handleSubmit(event) {
    event.preventDefault();
    submit(validateRegister, async (values) => {
      const { user } = await register(values);
      toast.success(`Welcome to Firebreak, ${user.name}.`);
      signIn(user);
    });
  }

  const loginLink = (
    <Link to="/login" state={location.state} className="font-medium underline underline-offset-2">
      Log in
    </Link>
  );

  return (
    <AuthCard
      title="Create your account"
      subtitle="Track your apps and know what to do when the next incident hits."
      footer={<>Already have an account? {loginLink}</>}
    >
      <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-4">
        {formError && (
          <FormAlert>
            {formError.message}
            {formError.code === 'EMAIL_TAKEN' && <> {loginLink}</>}
          </FormAlert>
        )}
        <TextField label="Name" autoComplete="name" {...fieldProps('name')} />
        <TextField label="Email" type="email" autoComplete="email" {...fieldProps('email')} />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters."
          {...fieldProps('password')}
        />
        <Button type="submit" loading={submitting} className="w-full">
          {submitting ? 'Creating your account…' : 'Create account'}
        </Button>
      </form>
    </AuthCard>
  );
}
