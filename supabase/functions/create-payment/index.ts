import Stripe from 'npm:stripe@14.14.0';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);
const MAX_REQUESTS_PER_WINDOW = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const paymentRequests = new Map<string, number[]>();

function getAllowedOrigins(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS');
  if (!raw) {
    return ['https://minegrid-equipement.com', 'http://localhost:5173', 'http://localhost:4173'];
  }
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function buildCorsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get('origin') || '';
  const allowedOrigins = getAllowedOrigins();
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...buildCorsHeaders(req),
    },
  });
}

function extractClientIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const previous = paymentRequests.get(ip) || [];
  const recent = previous.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    paymentRequests.set(ip, recent);
    return true;
  }
  recent.push(now);
  paymentRequests.set(ip, recent);
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'Méthode non autorisée' }, 405);
  }

  const contentType = req.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return jsonResponse(req, { error: 'Content-Type invalide' }, 415);
  }

  const clientIp = extractClientIp(req);
  if (isRateLimited(clientIp)) {
    return jsonResponse(req, { error: 'Trop de requêtes, veuillez réessayer plus tard.' }, 429);
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse(req, { error: 'Authentification requise' }, 401);
  }
  const jwt = authHeader.replace('Bearer ', '').trim();

  const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !userData.user) {
    return jsonResponse(req, { error: 'Token invalide' }, 401);
  }

  try {
    const { planId } = await req.json();
    if (!isValidPlanId(planId)) {
      return jsonResponse(req, { error: 'Plan invalide' }, 400);
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: getPlanAmount(planId),
      currency: 'eur',
      payment_method_types: ['card'],
      metadata: {
        planId,
        userId: userData.user.id,
      },
    }, {
      idempotencyKey: `${userData.user.id}:${planId}`,
    });

    return jsonResponse(req, { clientSecret: paymentIntent.client_secret });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    return jsonResponse(req, { error: message }, 500);
  }
});

function getPlanAmount(planId: string): number {
  const prices = {
    basic: 2999,    // 29.99€
    pro: 4999,      // 49.99€
    enterprise: 9999 // 99.99€
  };
  return prices[planId as keyof typeof prices] || 4999;
}

function isValidPlanId(planId: unknown): planId is 'basic' | 'pro' | 'enterprise' {
  return planId === 'basic' || planId === 'pro' || planId === 'enterprise';
}