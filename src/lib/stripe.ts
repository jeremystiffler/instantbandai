// eslint-disable-next-line @typescript-eslint/no-require-imports
const StripeLib = require("stripe");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const StripeConstructor = StripeLib.default ?? StripeLib;

// Lazy singleton — avoids build-time crash when STRIPE_SECRET_KEY is absent
let _stripe: ReturnType<typeof StripeConstructor> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getStripe(): any {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new StripeConstructor(key, { apiVersion: "2025-04-30.basil" });
  }
  return _stripe;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const stripe: any = new Proxy({} as any, {
  get(_t, prop) { return getStripe()[prop]; },
});

export const PLANS = {
  pay_per_track: {
    name: "Pay Per Track",
    priceId: process.env.STRIPE_PRICE_PAY_PER_TRACK!,
    credits: 1,
    amount: 499, // $4.99
  },
  creator: {
    name: "Creator",
    priceId: process.env.STRIPE_PRICE_CREATOR!,
    credits: 5,
    amount: 1900, // $19/mo
  },
  pro: {
    name: "Pro",
    priceId: process.env.STRIPE_PRICE_PRO!,
    credits: 999, // unlimited
    amount: 4900, // $49/mo
  },
} as const;

export type PlanKey = keyof typeof PLANS;
