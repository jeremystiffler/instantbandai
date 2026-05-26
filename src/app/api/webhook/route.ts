import { prisma } from "@/lib/prisma";
import { stripe, PLANS } from "@/lib/stripe";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Stripe sends raw body — must disable body parsing
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";
  const secret = process.env.STRIPE_WEBHOOK_SECRET!;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let event: any;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, secret);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Stripe webhook signature verification failed:", msg);
    return NextResponse.json({ error: `Webhook Error: ${msg}` }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.metadata?.userId;
      const plan = session.metadata?.plan as keyof typeof PLANS | undefined;
      if (!userId || !plan || !PLANS[plan]) break;

      const planConfig = PLANS[plan];
      const isSubscription = plan === "creator" || plan === "pro";

      await prisma.user.update({
        where: { id: userId },
        data: {
          credits: { increment: planConfig.credits },
          plan: isSubscription ? plan : undefined,
          planExpiresAt: isSubscription
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            : undefined,
        },
      });
      console.log(`✅ Payment complete: user=${userId} plan=${plan} credits+=${planConfig.credits}`);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const customer = await stripe.customers.retrieve(sub.customer as string);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userId = (customer as any).metadata?.userId;
      if (userId) {
        await prisma.user.update({
          where: { id: userId },
          data: { plan: "free", planExpiresAt: null },
        });
        console.log(`⚠️ Subscription cancelled: user=${userId}`);
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      console.warn(`💳 Payment failed for customer ${invoice.customer}`);
      break;
    }

    default:
      // Unhandled event type — that's fine
      break;
  }

  return NextResponse.json({ received: true });
}
