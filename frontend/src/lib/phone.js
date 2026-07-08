/* Nigerian phone helpers — accept the many ways agents type a number and
   normalize to E.164 (+234…) for the API. */

export const E164_RE = /^\+[1-9]\d{7,14}$/;

/* Accepts: 08012345678 · 8012345678 · 2348012345678 · +2348012345678
   (spaces, dashes and brackets are ignored). Returns '' for empty input. */
export function normalizePhone(raw) {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  const plus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (plus)                     return '+' + digits;   // already international
  if (digits.startsWith('234')) return '+' + digits;
  if (digits.startsWith('0'))   return '+234' + digits.slice(1);
  if (digits.length === 10)     return '+234' + digits;   // 8012345678
  return '+' + digits;
}

export function isValidPhone(raw) {
  return E164_RE.test(normalizePhone(raw));
}
