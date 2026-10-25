import { HttpError } from '../utils/httpError.js';

/**
 * Validates request parts with zod schemas, e.g. validate({ body: registerBody }).
 * Valid, cleaned data is stored on req.validated (Express 5 makes req.query
 * read-only). Unknown keys are dropped, so a body can never smuggle in fields
 * such as `role`. Errors map each field to one plain-language message.
 */
export function validate(schemas) {
  return (req, res, next) => {
    const validated = {};
    const fields = {};

    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part] ?? {});
      if (result.success) {
        validated[part] = result.data;
        continue;
      }
      for (const issue of result.error.issues) {
        fields[issue.path.join('.') || part] ??= issue.message;
      }
    }

    if (Object.keys(fields).length > 0) {
      next(new HttpError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields.', { fields }));
      return;
    }
    req.validated = validated;
    next();
  };
}
