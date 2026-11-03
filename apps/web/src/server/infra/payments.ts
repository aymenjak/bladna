import { AppError } from '@bladna/types';
import { env } from '../env';

/**
 * Payments adapter (§97 — "no invented gateways").
 *
 * Real integrations shipped in this build (no third-party account needed):
 *  - `bank_transfer` (default): creates an intent with a unique reference the
 *    payer transfers manually; an admin confirms receipt
 *    (PENDING → PROCESSING → SUCCEEDED/FAILED/REFUNDED state machine).
 *  - `free`: zero-amount orders (free plans, grants).
 *
 * Commercial gateways are enabled by setting PAYMENT_PROVIDER + credentials.
 * Until credentials exist the API returns CONFIG_ERROR — never a fake
 * "payment successful".
 */

export type PaymentProviderId = 'bank_transfer' | 'free' | 'stripe' | 'paypal' | 'cib' | 'edahabia';

export interface CreateIntentInput {
  orderReference: string;
  amountMinor: number;
  currency: string;
  description: string;
  locale: string;
}

export interface PaymentIntent {
  provider: PaymentProviderId;
  reference: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  redirectUrl?: string;
  instructions?: string;
}

const KNOWN: PaymentProviderId[] = ['bank_transfer', 'free', 'stripe', 'paypal', 'cib', 'edahabia'];

export function currentProvider(): PaymentProviderId {
  const raw = env.paymentProvider || 'bank_transfer';
  return KNOWN.includes(raw as PaymentProviderId) ? (raw as PaymentProviderId) : 'bank_transfer';
}

export async function createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
  const provider = currentProvider();

  if (provider === 'free') {
    if (input.amountMinor !== 0) {
      throw AppError.validation('The free provider only supports zero-amount orders.');
    }
    return { provider, reference: input.orderReference, status: 'SUCCEEDED' };
  }

  if (provider === 'bank_transfer') {
    const reference = `BLD-${input.orderReference}`;
    return {
      provider,
      reference,
      status: 'PENDING',
      instructions:
        'Transfer the amount to the platform bank account quoting this reference. ' +
        'An administrator will confirm receipt and your order will be activated.',
    };
  }

  const hasCredentials =
    provider === 'stripe'
      ? Boolean(env.stripeSecretKey)
      : provider === 'paypal'
        ? Boolean(env.paypalClientId && env.paypalClientSecret)
        : false;

  if (!hasCredentials) {
    throw AppError.config(
      `PAYMENT_PROVIDER=${provider} requires its credentials to be configured. Set PAYMENT_PROVIDER=bank_transfer for manual confirmation flows.`,
    );
  }
  throw AppError.notImplemented(`Gateway ${provider} SDK integration is not wired in this build.`);
}

/**
 * Webhook signature verification. Bank transfers have no webhook — confirmation
 * is an authorized manual action. Gateways must implement HMAC verification
 * here before webhooks are enabled.
 */
export function verifyWebhook(_provider: string, _payload: string, _signature: string): boolean {
  return false;
}
