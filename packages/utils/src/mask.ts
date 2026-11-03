/** Masking helpers — private data is never exposed by default (spec §29, §101). */

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const head = local.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(local.length - 1, 2))}@${domain}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return '*'.repeat(digits.length);
  return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

export function maskName(firstName: string, lastName: string): string {
  const mask = (value: string) =>
    value.length <= 1 ? value : `${value[0]}${'*'.repeat(value.length - 1)}`;
  return `${mask(firstName)} ${mask(lastName)}`;
}
