import { audit, cleanString, getServiceClient, json, normalizeEmail, parseBody, rateLimit, validateEmail, validatePhone } from "../_shared/common.ts";

function bankDetails() {
  return {
    bankName: cleanString(Deno.env.get("DONATION_BANK_NAME"), 120),
    accountNumber: cleanString(Deno.env.get("DONATION_ACCOUNT_NUMBER"), 40),
    accountName: cleanString(Deno.env.get("DONATION_ACCOUNT_NAME"), 160),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(req, 204, {});
  if (req.method !== "POST") return json(req, 405, { success: false, message: "Method not allowed." });
  if (!rateLimit(req, "donation-submit", 20, 60 * 60 * 1000)) {
    return json(req, 429, { success: false, message: "Too many donation attempts. Please try again later." });
  }

  const bank = bankDetails();
  if (!bank.bankName || !bank.accountNumber || !bank.accountName) {
    return json(req, 503, { success: false, message: "Bank transfer details are not configured. Please contact the administrator." });
  }

  const body = await parseBody(req);
  const action = cleanString(body.action, 20) || "confirm";
  const fullName = cleanString(body.fullName ?? body.full_name, 255);
  const email = normalizeEmail(body.email);
  const phone = cleanString(body.phone, 30);
  const amount = Number(body.amount ?? body.amountNaira ?? 0);
  const category = cleanString(body.category ?? body.programArea, 255);
  const message = cleanString(body.message, 5000);
  const errors = [];
  if (fullName.length < 2) errors.push("Full name is required");
  if (!validateEmail(email)) errors.push("Valid email address is required");
  if (!validatePhone(phone)) errors.push("Valid phone number is required");
  if (!Number.isFinite(amount) || amount < 1000) errors.push("Donation amount must be at least 1000");
  if (!category) errors.push("Program area is required");
  if (errors.length) return json(req, 400, { success: false, errors });

  if (action === "prepare") {
    const reference = `WII-${Date.now()}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
    return json(req, 200, {
      success: true,
      reference,
      donation: { fullName, email, amountNaira: amount, programArea: category },
      bank,
    });
  }
  if (action !== "confirm") {
    return json(req, 400, { success: false, message: "Unsupported donation action." });
  }

  try {
    const client = getServiceClient();
    const reference = cleanString(body.reference, 80) || `WII-${Date.now()}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
    if (!/^WII-[A-Za-z0-9-]{8,72}$/.test(reference)) {
      return json(req, 400, { success: false, message: "Donation reference is invalid. Please restart the donation form." });
    }
    const { data, error } = await client.from("donations").insert({
      reference,
      full_name: fullName,
      email,
      phone,
      amount_kobo: Math.round(amount * 100),
      amount_naira: Math.round(amount),
      program_area: category,
      message: message || null,
      status: "pending",
      payment_provider: "bank_transfer",
      payment_status: "pending",
      idempotency_key: cleanString(body.idempotencyKey ?? body.idempotency_key, 255) || null,
    }).select("id").single();
    if (error) {
      // A retry after a lost response must not create a second record.
      const { data: existing } = await client.from("donations")
        .select("id, full_name, email, phone, amount_naira, program_area")
        .eq("reference", reference)
        .maybeSingle();
      if (
        existing &&
        existing.full_name === fullName &&
        existing.email === email &&
        existing.phone === phone &&
        Number(existing.amount_naira) === Math.round(amount) &&
        existing.program_area === category
      ) {
        return json(req, 200, {
          success: true,
          reference,
          donation: { fullName, email, amountNaira: amount, programArea: category },
          bank,
          donationId: existing.id,
          alreadySubmitted: true,
        });
      }
      throw error;
    }

    await Promise.allSettled([
      audit(req, client, {
        action: "donation.initiate",
        entityType: "donations",
        entityId: data.id,
        summary: `Bank transfer donation initiated for ${fullName}`,
        metadata: { programArea: category, amount },
      }),
    ]);

    return json(req, 201, {
      success: true,
      reference,
      donation: { fullName, email, amountNaira: amount, programArea: category },
      bank,
      donationId: data.id,
    });
  } catch {
    return json(req, 500, { success: false, message: "Could not record your donation. Please try again." });
  }
});
