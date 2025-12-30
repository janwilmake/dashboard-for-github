/// <reference types="@cloudflare/workers-types" />
import Stripe from "stripe";

export interface StripeConfig {
  secretKey: string;
  webhookSigningSecret: string;
  paymentLinkId: string;
  paymentLinkUrl: string;
  onSubscribe: (
    username: string,
    email: string,
    customerId: string,
  ) => Promise<void>;
  onCancel: (email: string) => Promise<void>;
  getCustomerId: (request: Request) => Promise<string | null>;
}

async function streamToBuffer(
  readableStream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = readableStream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let position = 0;
  for (const chunk of chunks) {
    result.set(chunk, position);
    position += chunk.length;
  }
  return result;
}

async function handleWebhook(
  request: Request,
  config: StripeConfig,
): Promise<Response> {
  if (!request.body) {
    return new Response(JSON.stringify({ error: "No body" }), { status: 400 });
  }

  const stripe = new Stripe(config.secretKey, {
    apiVersion: "2025-12-15.clover",
  });

  const rawBody = await streamToBuffer(request.body);
  const rawBodyString = new TextDecoder().decode(rawBody);
  const stripeSignature = request.headers.get("stripe-signature");

  if (!stripeSignature) {
    return new Response(JSON.stringify({ error: "No signature" }), {
      status: 400,
    });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBodyString,
      stripeSignature,
      config.webhookSigningSecret,
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
    });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    console.log("SESSION COMPLETED", session);

    if (session.payment_link !== config.paymentLinkId) {
      return new Response(
        JSON.stringify({ received: true, message: "Incorrect payment link" }),
        { status: 200 },
      );
    }

    if (session.payment_status !== "paid" || !session.amount_total) {
      return new Response(JSON.stringify({ error: "Payment not completed" }), {
        status: 400,
      });
    }

    const { client_reference_id, customer_details, customer } = session;
    if (!client_reference_id || !customer_details?.email) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400 },
      );
    }

    await config.onSubscribe(
      client_reference_id,
      customer_details.email,
      customer as string,
    );

    return new Response(
      JSON.stringify({ received: true, message: "Payment processed" }),
      { status: 200 },
    );
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const customer = await stripe.customers.retrieve(
      subscription.customer as string,
    );

    if (customer.deleted) {
      return new Response(
        JSON.stringify({ received: true, message: "Customer already deleted" }),
        { status: 200 },
      );
    }

    await config.onCancel(customer.email || "");

    return new Response(
      JSON.stringify({ received: true, message: "Subscription removed" }),
      { status: 200 },
    );
  }

  return new Response(
    JSON.stringify({ received: true, message: "Event not handled" }),
    { status: 200 },
  );
}

async function createPortalSession(
  request: Request,
  config: StripeConfig,
): Promise<Response> {
  const customerId = await config.getCustomerId(request);

  if (!customerId) {
    return new Response(JSON.stringify({ error: "No subscription found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stripe = new Stripe(config.secretKey, {
    apiVersion: "2025-12-15.clover",
  });

  const url = new URL(request.url);
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${url.origin}/`,
  });

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { "Content-Type": "application/json" },
  });
}

export function createStripeMiddleware(config: StripeConfig) {
  return {
    handleWebhook: (request: Request) => handleWebhook(request, config),
    createPortalSession: (request: Request) =>
      createPortalSession(request, config),
    getPaymentLink: (username: string) =>
      `${config.paymentLinkUrl}?client_reference_id=${encodeURIComponent(
        username,
      )}`,
  };
}
