// AD-10: Timor-Leste numbers are +670 followed by 8 digits; mobile numbers start with 7, landlines with 3.
// Accepts local and international forms with spaces, dots, dashes or brackets, and returns E.164 (+670XXXXXXXX) or null.
const ALLOWED = /^\+?[0-9\s().-]+$/;

export function normalisePhone(input: string): string | null {
  const text = input.trim();
  if (!ALLOWED.test(text)) return null;
  const digits = text.replace(/\D/g, '');

  let local: string;
  if (text.startsWith('+')) {
    if (!digits.startsWith('670')) return null;
    local = digits.slice(3);
  } else if (digits.startsWith('00670')) {
    local = digits.slice(5);
  } else if (digits.startsWith('670') && digits.length === 11) {
    local = digits.slice(3);
  } else {
    local = digits;
  }
  return /^[37]\d{7}$/.test(local) ? `+670${local}` : null;
}
