import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const MAX_REQUESTS_PER_WINDOW = 8;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const emailRequests = new Map<string, number[]>();

/** Corps attendu depuis le SPA : `to` facultatif si routage automatique réussi. */
interface EmailRequestBody {
  to?: string;
  from: string;
  subject: string;
  html: string;
  machineId?: string;
  messageId?: string;
  /** Sécuriser les réponses messagerie : doit correspondre à `messages.sender_email` pour ce message */
  verifiedReplyToOriginalMessageId?: string;
}

interface ResendError {
  message?: string;
}

/** RFC 4122 / Postgres : toutes variantes (évite de rejeter UUID v7 ou autres). */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuidLike(value: string): boolean {
  const t = value.trim();
  return t.length > 0 && UUID_REGEX.test(t);
}

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
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
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

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isPlaceholderSellerUuid(uuid: string): boolean {
  const u = uuid.trim().toLowerCase();
  return (
    u === "00000000-0000-0000-0000-000000000000" ||
    u === "00000000-0000-0000-0000-000000000001"
  );
}

function pickSellerUserIdFromMachineRow(
  row: Record<string, unknown>,
): string | null {
  const keyOrder = [
    "seller_id",
    "sellerid",
    "user_id",
    "owner_id",
    "sellerId",
    "SellerId",
  ];
  for (const k of keyOrder) {
    const v = row[k];
    let t = "";
    if (typeof v === "string") t = v.trim();
    else if (typeof v === "number") t = String(v);
    else if (v !== null && v !== undefined) t = String(v).trim();
    if (!isUuidLike(t)) continue;
    if (isPlaceholderSellerUuid(t)) continue;
    return t.trim();
  }
  return null;
}

/** `select=*` évite l’erreur PostgREST si une colonne nommée dans un select partiel n’existe pas en prod. */
async function fetchMachineSellerUserId(
  supabaseUrl: string,
  serviceKey: string,
  machineId: string,
): Promise<string | null> {
  const url =
    `${supabaseUrl}/rest/v1/machines?id=eq.${encodeURIComponent(machineId)}&select=*&limit=1`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      Accept: "application/json",
    },
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    console.error(
      "send-contact-email: lecture machines HTTP",
      r.status,
      errText.slice(0, 500),
    );
    return null;
  }
  const rows = (await r.json().catch(() => [])) as Array<
    Record<string, unknown>
  >;
  const row = rows?.[0];
  if (!row) {
    console.warn("send-contact-email: aucune ligne machines pour id", machineId);
    return null;
  }
  const uid = pickSellerUserIdFromMachineRow(row);
  if (!uid) {
    console.warn(
      "send-contact-email: machine sans seller résolvable (colonnes présentes :",
      Object.keys(row).slice(0, 40).join(","),
      ")",
    );
  }
  return uid;
}

function extractEmailFromAuthAdminPayload(raw: Record<string, unknown>): string | null {
  const direct = raw.email;
  if (typeof direct === "string" && isValidEmail(direct.trim())) return direct.trim();

  const nestedUser = raw.user as Record<string, unknown> | undefined;
  if (nestedUser && typeof nestedUser.email === "string" && isValidEmail(nestedUser.email.trim())) {
    return nestedUser.email.trim();
  }

  const usersArr = raw.users as unknown;
  if (Array.isArray(usersArr) && usersArr.length > 0) {
    const first = usersArr[0] as { email?: string };
    if (typeof first?.email === "string" && isValidEmail(first.email.trim())) {
      return first.email.trim();
    }
  }

  const identities = (nestedUser?.identities ?? raw.identities) as unknown;
  if (Array.isArray(identities)) {
    for (const id of identities) {
      const idObj = id as { identity_data?: { email?: string } };
      const em = idObj?.identity_data?.email;
      if (typeof em === "string" && isValidEmail(em.trim())) return em.trim();
    }
  }

  return null;
}

async function fetchAuthUserEmailById(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
): Promise<string | null> {
  const r = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
  });
  if (!r.ok) {
    console.warn("send-contact-email: auth admin utilisateur HTTP", r.status);
    return null;
  }
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return extractEmailFromAuthAdminPayload(j);
}

/** Repli si la table exposée par PostgREST (souvent `users`) copie l’email. */
async function fetchPublicUsersEmail(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
): Promise<string | null> {
  const sel = encodeURIComponent("email");
  const url =
    `${supabaseUrl}/rest/v1/users?id=eq.${userId}&select=${sel}&limit=1`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      Accept: "application/json",
    },
  });
  if (!r.ok) return null;
  const rows = (await r.json().catch(() => [])) as Array<{ email?: string | null }>;
  const email = rows?.[0]?.email;
  const t = typeof email === "string" ? email.trim() : "";
  return t && isValidEmail(t) ? t : null;
}

async function fetchProClientsEmail(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
): Promise<string | null> {
  const sel = encodeURIComponent("email");
  const url =
    `${supabaseUrl}/rest/v1/pro_clients?user_id=eq.${encodeURIComponent(userId)}&select=${sel}&limit=1`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      Accept: "application/json",
    },
  });
  if (!r.ok) return null;
  const rows = (await r.json().catch(() => [])) as Array<{ email?: string | null }>;
  const email = rows?.[0]?.email;
  const t = typeof email === "string" ? email.trim() : "";
  return t && isValidEmail(t) ? t : null;
}

async function fetchProfilesEmail(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
): Promise<string | null> {
  const sel = encodeURIComponent("email");
  const url =
    `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=${sel}&limit=1`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      Accept: "application/json",
    },
  });
  if (!r.ok) return null;
  const rows = (await r.json().catch(() => [])) as Array<{ email?: string | null }>;
  const email = rows?.[0]?.email;
  const t = typeof email === "string" ? email.trim() : "";
  return t && isValidEmail(t) ? t : null;
}

async function validateMessageReplyRecipient(
  supabaseUrl: string,
  serviceKey: string,
  originalMessageId: string,
  declaredTo: string,
): Promise<boolean> {
  const sel = encodeURIComponent("sender_email");
  const url =
    `${supabaseUrl}/rest/v1/messages?id=eq.${originalMessageId}&select=${sel}&limit=1`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      Accept: "application/json",
    },
  });
  if (!r.ok) return false;
  const rows = (await r.json().catch(() => [])) as Array<
    { sender_email?: string | null }
  >;
  const sender = rows?.[0]?.sender_email;
  if (!sender || !isValidEmail(declaredTo)) return false;
  return normalizeEmail(sender) === normalizeEmail(declaredTo);
}

async function resolveDeliverTo(opts: {
  body: EmailRequestBody;
  receiverEmail: string;
  supabaseUrl: string | null;
  serviceKey: string | null;
}): Promise<{ email: string; routing: string } | null> {
  const { body, receiverEmail, supabaseUrl, serviceKey } = opts;
  const clientToRaw = typeof body.to === "string" ? body.to.trim() : "";
  const clientTo = clientToRaw && isValidEmail(clientToRaw) ? clientToRaw : "";

  const replyId = body.verifiedReplyToOriginalMessageId?.trim();

  let deliverTo = "";
  let routing = "";

  if (
    replyId &&
    isUuidLike(replyId) &&
    clientTo &&
    supabaseUrl &&
    serviceKey
  ) {
    const ok = await validateMessageReplyRecipient(
      supabaseUrl,
      serviceKey,
      replyId,
      clientTo,
    );
    if (ok) {
      return { email: clientTo, routing: "verified_reply" };
    }
  }

  const mid =
    typeof body.machineId === "string" ? body.machineId.trim() : "";
  if (mid && isUuidLike(mid) && supabaseUrl && serviceKey) {
    const ownerUid = await fetchMachineSellerUserId(
      supabaseUrl,
      serviceKey,
      mid,
    );
    if (ownerUid) {
      let email = await fetchAuthUserEmailById(
        supabaseUrl,
        serviceKey,
        ownerUid,
      );
      if (!email) {
        email = await fetchPublicUsersEmail(
          supabaseUrl,
          serviceKey,
          ownerUid,
        );
      }
      if (!email) {
        email = await fetchProClientsEmail(
          supabaseUrl,
          serviceKey,
          ownerUid,
        );
      }
      if (!email) {
        email = await fetchProfilesEmail(
          supabaseUrl,
          serviceKey,
          ownerUid,
        );
      }
      if (email) {
        return { email, routing: "machine_owner" };
      }
      console.warn(
        "send-contact-email: vendeur/loueur résolu mais email introuvable",
        { machineId: mid, ownerUid },
      );
    }
  } else if (mid && !isUuidLike(mid)) {
    console.warn("send-contact-email: machineId ignoré (pas un UUID)", mid);
  } else if (mid && (!supabaseUrl || !serviceKey)) {
    console.error(
      "send-contact-email: machineId fourni mais SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant sur la fonction",
    );
  }

  if (clientTo && normalizeEmail(clientTo) === normalizeEmail(receiverEmail)) {
    deliverTo = receiverEmail;
    routing = "fallback_inbox";
  }

  if (deliverTo) return { email: deliverTo, routing };

  return null;
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
    return jsonResponse(
      req,
      { error: "Trop de requêtes, veuillez réessayer plus tard." },
      429,
    );
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const receiverEmail = Deno.env.get("CONTACT_RECEIVER_EMAIL");
  const senderEmail =
    Deno.env.get("CONTACT_SENDER_EMAIL") || "contact@minegrid-equipment.com";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? null;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null;
  const inquiryBccRaw = Deno.env.get("CONTACT_INQUIRY_BCC_EMAIL")?.trim() ?? "";

  if (!resendApiKey || !receiverEmail || !isValidEmail(receiverEmail)) {
    return jsonResponse(
      req,
      { error: "Configuration serveur incomplète (RESEND_API_KEY/CONTACT_RECEIVER_EMAIL)." },
      503,
    );
  }

  try {
    const body = (await req.json()) as EmailRequestBody;
    const { from, subject, html, messageId } = body;

    if (!from || !subject || !html) {
      return jsonResponse(req, { error: "Données manquantes" }, 400);
    }

    const resolved = await resolveDeliverTo({
      body,
      receiverEmail,
      supabaseUrl,
      serviceKey: supabaseServiceKey,
    });

    if (!resolved) {
      return jsonResponse(
        req,
        {
          error:
            "Destinataire non autorisé : fournissez un machineId d’annonce valide (UUID), ou une réponse vérifiée (verifiedReplyToOriginalMessageId + to = expéditeur du message), ou to = CONTACT_RECEIVER_EMAIL.",
        },
        403,
      );
    }

    const deliverTo = resolved.email;

    if (!isValidEmail(from)) {
      return jsonResponse(req, { error: "Adresse expediteur invalide" }, 400);
    }
    if (!isValidEmail(deliverTo)) {
      return jsonResponse(req, { error: "Adresse destinataire invalide" }, 400);
    }
    if (subject.length > 180 || html.length > 30000) {
      return jsonResponse(req, { error: "Contenu trop long" }, 400);
    }
    if (messageId && !isUuidLike(messageId)) {
      return jsonResponse(req, { error: "messageId invalide" }, 400);
    }

    const payload: Record<string, unknown> = {
      from: senderEmail,
      to: [deliverTo],
      subject,
      html,
      reply_to: from,
    };

    /** Toujours prévenir CONTACT_RECEIVER_EMAIL en copie si le vendeur est la cible principale (trace + secours si spam filtre). */
    const bccRecipients: string[] = [];
    const addBcc = (addr: string) => {
      const n = normalizeEmail(addr);
      if (!isValidEmail(addr)) return;
      if (normalizeEmail(deliverTo) === n) return;
      if (!bccRecipients.some((x) => normalizeEmail(x) === n)) bccRecipients.push(addr.trim());
    };
    if (inquiryBccRaw && isValidEmail(inquiryBccRaw)) addBcc(inquiryBccRaw);
    if (
      resolved.routing === "machine_owner" &&
      isValidEmail(receiverEmail) &&
      normalizeEmail(deliverTo) !== normalizeEmail(receiverEmail)
    ) {
      addBcc(receiverEmail);
    }
    if (bccRecipients.length > 0) {
      payload["bcc"] = bccRecipients;
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
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
          },
        );
        if (!updateResponse.ok) {
          console.error(
            "send-contact-email: update contact_messages failed",
            await updateResponse.text(),
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
      routing: resolved.routing,
      receiverNotifiedCopy:
        resolved.routing === "machine_owner" &&
        normalizeEmail(deliverTo) !== normalizeEmail(receiverEmail),
      simulated: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    console.error("send-contact-email: unexpected error", message);
    return jsonResponse(req, { success: false, error: "Erreur interne du serveur" }, 500);
  }
});
