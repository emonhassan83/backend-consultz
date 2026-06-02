import crypto from 'crypto';

export function generateReferralCode() {
  return crypto.randomBytes(4).toString('hex'); // e.g., '9f1c2b7a'
}
