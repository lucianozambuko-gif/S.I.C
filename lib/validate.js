export class ValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.field = field;
    this.status = 400;
  }
}

/** Trimmed text field with a length cap. */
export function text(value, key, label, { required = false, max = 200 } = {}) {
  const s = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
  if (required && !s) throw new ValidationError(key, `${label} is required.`);
  if (s.length > max) throw new ValidationError(key, `${label} must be ${max} characters or fewer.`);
  return s;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function email(value, key = 'email', label = 'Email', required = true) {
  const s = text(value, key, label, { required, max: 160 }).toLowerCase();
  if (s && !EMAIL_RE.test(s)) throw new ValidationError(key, `Enter a full email address, like name@domain.co.za.`);
  return s;
}

/** Value must be one of a fixed list (or empty when optional). */
export function oneOf(value, key, label, options, required = false) {
  const s = text(value, key, label, { required, max: 120 });
  if (s && !options.includes(s)) throw new ValidationError(key, `Choose a valid option for ${label.toLowerCase()}.`);
  return s;
}
