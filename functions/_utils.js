// Utilitários compartilhados entre os Workers

export async function hashEmail(email) {
  const normalized = email.trim().toLowerCase();
  return sha256Hex(normalized);
}

export async function hashPhone(phone) {
  const normalized = phone.replace(/\D/g, '');
  return sha256Hex(normalized);
}

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function getClientIP(request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    '0.0.0.0'
  );
}

export function genEventId(prefix = 'evt') {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${ts}${rand}`;
}
