// Mirrors the server's rules so most mistakes are caught before a request is
// sent. The server still validates everything; these are only for speed.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkEmail(email) {
  if (!email.trim()) return 'Enter your email address';
  if (!EMAIL_PATTERN.test(email.trim())) return 'Enter a valid email address';
  return null;
}

export function validateLogin({ email, password }) {
  return withoutEmpty({
    email: checkEmail(email),
    password: password ? null : 'Enter your password',
  });
}

export function validateRegister({ name, email, password }) {
  let passwordError = null;
  if (!password) passwordError = 'Enter a password';
  else if (password.length < 8) passwordError = 'Use at least 8 characters';
  // bcrypt only reads the first 72 bytes, so the server rejects longer passwords.
  else if (new TextEncoder().encode(password).length > 72) passwordError = 'Use at most 72 characters';

  return withoutEmpty({
    name: !name.trim() ? 'Enter your name' : name.trim().length > 60 ? 'Use at most 60 characters' : null,
    email: checkEmail(email),
    password: passwordError,
  });
}

function withoutEmpty(errors) {
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message));
}
