import { useEffect, useRef, useState } from 'react';

/**
 * State for a submit-once form: values, per-field errors, one form-level
 * error and a submitting flag. `submit(validateFn, sendFn)` validates locally,
 * then sends, and maps server field errors back onto the inputs. After a
 * failed submit, focus moves to the first field that needs fixing.
 */
export function useForm(initialValues) {
  const [values, setValues] = useState(initialValues);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [failedSubmits, setFailedSubmits] = useState(0);
  const formRef = useRef(null);

  // Only after a submit, never while typing, so focus is not pulled away.
  useEffect(() => {
    if (failedSubmits > 0) formRef.current?.querySelector('[aria-invalid="true"]')?.focus();
  }, [failedSubmits]);

  function fieldProps(name) {
    return {
      name,
      value: values[name],
      error: fieldErrors[name],
      onChange: (event) => {
        setValues((current) => ({ ...current, [name]: event.target.value }));
        if (fieldErrors[name]) setFieldErrors(({ [name]: _cleared, ...rest }) => rest);
      },
    };
  }

  async function submit(validateFn, sendFn) {
    const errors = validateFn(values);
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) {
      setFailedSubmits((count) => count + 1);
      return;
    }

    setSubmitting(true);
    try {
      await sendFn(values);
    } catch (error) {
      setFieldErrors(error.fields ?? {});
      // Field problems are shown on the fields; anything else gets one message.
      setFormError(error.code === 'VALIDATION_ERROR' ? null : error);
      setFailedSubmits((count) => count + 1);
      setSubmitting(false);
    }
  }

  return { formRef, fieldProps, submit, submitting, formError };
}
