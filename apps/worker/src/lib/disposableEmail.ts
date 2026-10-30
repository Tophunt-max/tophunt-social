/**
 * Throwaway-mailbox domains. Refused at signup and on email change, and a hard
 * "no signup bonus" rule (lib/verificationReward.ts) for any address that got
 * past those (e.g. stored before the list grew).
 */
export const DISPOSABLE_DOMAINS = new Set([
  "yopmail.com", "mailinator.com", "temp-mail.org", "10minutemail.com",
  "guerrillamail.com", "sharklasers.com", "maildrop.cc", "getnada.com",
  "dispostable.com", "tempmail.com", "throwawaymail.com", "mail.tm",
  "temp-mail.io", "yopmail.net", "cool.fr.nf", "jetable.org", "temporarily.de",
  "tempmailo.com", "smailpro.com", "trashmail.com", "luxusmail.org",
  "guerrillamail.net", "guerrillamail.org", "grr.la", "mailnesia.com", "moakt.com",
  "emailondeck.com", "fakeinbox.com", "mintemail.com", "mohmal.com", "tempail.com",
  "spamgourmet.com", "trashmail.de", "burnermail.io", "inboxkitten.com", "1secmail.com",
]);

export function isDisposableEmail(email: string | null | undefined): boolean {
  const domain = String(email ?? "").split("@")[1];
  return domain ? DISPOSABLE_DOMAINS.has(domain.trim().toLowerCase()) : false;
}
