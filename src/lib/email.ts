import { Resend } from "resend";

/**
 * Envio de e-mails transacionais.
 *
 * - Com `RESEND_API_KEY`: entrega real via Resend (indicado na Vercel;
 *   free tier cobre o volume de recuperação de senha).
 * - Sem chave: imprime o conteúdo no log do servidor (`[email:console]`),
 *   então o fluxo inteiro funciona em dev/local — o link aparece no console.
 *
 * Remetente: `EMAIL_FROM` ou o endereço de onboarding do Resend (que só
 * entrega para o próprio dono da conta — ok para testar).
 */

export type EmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type EmailResult = {
  transport: "resend" | "console";
  delivered: boolean;
};

/** Envia um e-mail. Lança em falha do provedor — o chamador decide o tratamento. */
export async function sendEmail(input: EmailInput): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(
      `[email:console] para=${input.to}\nassunto=${input.subject}\n${input.text}`,
    );
    return { transport: "console", delivered: false };
  }

  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM || "CrIA Treino <onboarding@resend.dev>";
  const { error } = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
  if (error) {
    throw new Error(`resend: ${error.name}: ${error.message}`);
  }
  return { transport: "resend", delivered: true };
}

const RETRY_DELAY_MS = 1000;

/**
 * Envia com uma única repetição após falha transitória do provedor.
 * A falha final é relançada — quem chama decide o tratamento.
 */
export async function sendEmailWithRetry(
  input: EmailInput,
): Promise<EmailResult> {
  try {
    return await sendEmail(input);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return sendEmail(input);
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

type EmailLocale = "pt-BR" | "en-US";

const COPY: Record<
  EmailLocale,
  { subject: string; heading: string; button: string }
> = {
  "pt-BR": {
    subject: "Redefina sua senha — CrIA Treino",
    heading: "Redefina a sua senha",
    button: "Redefinir senha",
  },
  "en-US": {
    subject: "Reset your password — CrIA Treino",
    heading: "Reset your password",
    button: "Reset password",
  },
};

function bodyCopy(locale: EmailLocale, name: string): string {
  if (locale === "en-US") {
    return `${name}, we received a request to reset your CrIA Treino account password. Click the button below to choose a new password:`;
  }
  return `${name}, recebemos um pedido para redefinir a senha da sua conta CrIA Treino. Clique no botão abaixo para escolher uma nova senha:`;
}

function footerCopy(locale: EmailLocale, minutes: number): string {
  if (locale === "en-US") {
    return `The link expires in ${minutes} minutes and can only be used once. If you didn't request this, ignore this email — your password stays the same.`;
  }
  return `O link expira em ${minutes} minutos e só pode ser usado uma vez. Se você não pediu isso, ignore este e-mail — sua senha continua a mesma.`;
}

/** Template do e-mail de redefinição de senha (pt-BR / en-US). */
export function passwordResetEmail(opts: {
  to: string;
  name: string;
  url: string;
  expiresAt: Date;
  locale: EmailLocale;
}): EmailInput {
  const locale: EmailLocale = opts.locale === "en-US" ? "en-US" : "pt-BR";
  const copy = COPY[locale];
  const minutes = Math.max(
    1,
    Math.round((opts.expiresAt.getTime() - Date.now()) / 60000),
  );

  const html = [
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px">`,
    `<h1 style="font-size:20px;color:#18181b;margin:0 0 12px">${copy.heading}</h1>`,
    `<p style="font-size:14px;color:#3f3f46;margin:0 0 24px">${escapeHtml(bodyCopy(locale, opts.name))}</p>`,
    `<p style="text-align:center;margin:0 0 28px">`,
    `<a href="${escapeHtml(opts.url)}" style="background:#4f46e5;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${copy.button}</a>`,
    `</p>`,
    `<p style="font-size:12px;color:#71717a;margin:0">${footerCopy(locale, minutes)}</p>`,
    `</div>`,
  ].join("");

  const text = [
    copy.heading,
    "",
    bodyCopy(locale, opts.name),
    "",
    `${copy.button}: ${opts.url}`,
    "",
    footerCopy(locale, minutes),
  ].join("\n");

  return { to: opts.to, subject: copy.subject, html, text };
}
