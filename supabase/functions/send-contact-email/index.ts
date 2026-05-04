import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const MAX_REQUESTS_PER_WINDOW = 8;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const emailRequests = new Map<string, number[]>();

interface EmailRequest {
  to: string;
  from: string;
  subject: string;
  html: string;
  machineId?: string;
  messageId?: string;
}

interface ResendError {
  message?: string;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getAllowedOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS");
  if (!raw) {
    return [
      "https://minegrid-equipement.com",
      "http://localhost:5173",
      "http://localhost:4173",
    ];
  }
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function buildCorsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin") || "";
  const allowedOrigins = getAllowedOrigins();
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function extractClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const previous = emailRequests.get(ip) || [];
  const recent = previous.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    emailRequests.set(ip, recent);
    return true;
  }
  recent.push(now);
  emailRequests.set(ip, recent);
  return false;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Méthode non autorisée" }, 405);
  }

  const clientIp = extractClientIp(req);
  if (isRateLimited(clientIp)) {
    return jsonResponse(req, { error: "Trop de requêtes, veuillez réessayer plus tard." }, 429);
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const receiverEmail = Deno.env.get("CONTACT_RECEIVER_EMAIL");
  const senderEmail = Deno.env.get("CONTACT_SENDER_EMAIL") || "contact@minegrid-equipement.com";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!resendApiKey || !receiverEmail) {
    return jsonResponse(
      req,
      { error: "Configuration serveur incomplète (RESEND_API_KEY/CONTACT_RECEIVER_EMAIL)." },
      503
    );
  }

  try {
    const { to, from, subject, html, messageId }: EmailRequest = await req.json();

    if (!to || !from || !subject || !html) {
      return jsonResponse(req, { error: "Données manquantes" }, 400);
    }
    if (!isValidEmail(to) || !isValidEmail(from)) {
      return jsonResponse(req, { error: "Adresse email invalide" }, 400);
    }
    if (to.toLowerCase() !== receiverEmail.toLowerCase()) {
      return jsonResponse(req, { error: "Destinataire non autorisé" }, 403);
    }
    if (subject.length > 180 || html.length > 30000) {
      return jsonResponse(req, { error: "Contenu trop long" }, 400);
    }
    if (messageId && !UUID_REGEX.test(messageId)) {
      return jsonResponse(req, { error: "messageId invalide" }, 400);
    }

    const resendPayload = {
      from: senderEmail,
      to: [receiverEmail],
      subject,
      html,
      reply_to: from,
    };

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resendPayload),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as ResendError;
      const details = errorData.message || "Erreur Resend inconnue";
      console.error("send-contact-email: Resend error", details);
      return jsonResponse(req, { success: false, error: details }, 502);
    }

    if (messageId && supabaseUrl && supabaseServiceKey) {
      try {
        const updateResponse = await fetch(
          `${supabaseUrl}/rest/v1/contact_messages?id=eq.${messageId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseServiceKey}`,
              apikey: supabaseServiceKey,
            },
            body: JSON.stringify({
              status: "replied",
            }),
          }
        );
        if (!updateResponse.ok) {
          console.error(
            "send-contact-email: update contact_messages failed",
            await updateResponse.text()
          );
        }
      } catch (updateError) {
        console.error("send-contact-email: update status exception", updateError);
      }
    }

    return jsonResponse(req, {
      success: true,
      message: "Email envoyé avec succès",
      messageId,
      simulated: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    console.error("send-contact-email: unexpected error", message);
    return jsonResponse(req, { success: false, error: "Erreur interne du serveur" }, 500);
  }
});