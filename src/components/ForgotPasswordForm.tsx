"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Alert, Button, Field, Input } from "@/components/ui";

/**
 * Pedido de recuperação de senha. A resposta do servidor é sempre genérica
 * (não revela se o email existe), então o sucesso mostra o mesmo aviso.
 */
export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          retryAfter?: number;
        };
        if (res.status === 429) {
          setError(tc("rateLimited", { seconds: data.retryAfter ?? 60 }));
          return;
        }
        setError(
          data.error === "invalidData"
            ? t("errors.invalidData")
            : tc("errorGeneric"),
        );
        return;
      }

      setSent(true);
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">{t("forgot.success")}</Alert>
        <Link
          href="/login"
          className="text-sm font-semibold text-indigo-600 hover:underline"
        >
          {t("forgot.backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}

      <Field label={t("fields.email")} htmlFor="email" required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>

      <Button type="submit" loading={loading} className="mt-1 w-full">
        {loading ? t("forgot.submitting") : t("forgot.submit")}
      </Button>

      <p className="text-center text-sm text-zinc-600">
        <Link
          href="/login"
          className="font-semibold text-indigo-600 hover:underline"
        >
          {t("forgot.backToLogin")}
        </Link>
      </p>
    </form>
  );
}
