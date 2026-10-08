"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Alert, Button, Field, Input } from "@/components/ui";

/**
 * Definição da nova senha a partir do token do e-mail.
 * Sem token (acesso direto à URL) mostra o estado "link inválido".
 */
export function ResetPasswordForm({ token }: { token?: string }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError(t("reset.mismatch"));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
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
          data.error === "invalidToken"
            ? t("reset.invalidToken")
            : data.error === "invalidData"
              ? t("errors.invalidData")
              : tc("errorGeneric"),
        );
        return;
      }

      // Sucesso: leva para o login já com o aviso "senha redefinida".
      router.replace("/login?reset=ok");
      router.refresh();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <Alert>{t("reset.invalidToken")}</Alert>
        <p className="text-sm text-zinc-500">{t("reset.invalidTokenHint")}</p>
        <Link
          href="/forgot-password"
          className="text-sm font-semibold text-indigo-600 hover:underline"
        >
          {t("forgot.submit")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}

      <Field label={t("reset.password")} htmlFor="password" required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={200}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>

      <Field label={t("reset.confirm")} htmlFor="confirm" required>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={200}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>

      <Button type="submit" loading={loading} className="mt-1 w-full">
        {loading ? t("reset.submitting") : t("reset.submit")}
      </Button>
    </form>
  );
}
