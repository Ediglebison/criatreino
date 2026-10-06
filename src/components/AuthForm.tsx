"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Alert, Button, Field, Input } from "@/components/ui";
import { safeNextPath } from "@/lib/safe-redirect";

type Mode = "login" | "register";

export function AuthForm({ mode, next }: { mode: Mode; next?: string }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"PROFESSOR" | "ALUNO">("PROFESSOR");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "register"
            ? { name, email, password, role }
            : { email, password },
        ),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          retryAfter?: number;
        };
        if (res.status === 429) {
          const seconds = data.retryAfter ?? 60;
          setError(tc("rateLimited", { seconds }));
          return;
        }
        setError(
          data.error === "emailTaken"
            ? t("errors.emailTaken")
            : data.error === "invalidCredentials"
              ? t("errors.invalidCredentials")
              : data.error === "weakPassword"
                ? t("errors.weakPassword")
                : t("errors.invalidData"),
        );
        return;
      }

      const target = safeNextPath(next, "/dashboard");
      router.replace(target);
      router.refresh();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}

      {mode === "register" && (
        <Field label={t("fields.name")} htmlFor="name" required>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
      )}

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

      <Field
        label={t("fields.password")}
        htmlFor="password"
        required
        hint={mode === "register" ? t("fields.passwordHint") : undefined}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          required
          minLength={mode === "register" ? 8 : 1}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>

      {mode === "register" && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-zinc-700">
            {t("fields.role")}
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["PROFESSOR", "ALUNO"] as const).map((r) => (
              <label
                key={r}
                className={`flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 transition-colors ${
                  role === r
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-zinc-300 bg-white hover:bg-zinc-50"
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    checked={role === r}
                    onChange={() => setRole(r)}
                    className="accent-indigo-600"
                  />
                  {r === "PROFESSOR"
                    ? t("fields.roleProfessor")
                    : t("fields.roleAluno")}
                </span>
                <span className="pl-6 text-xs text-zinc-500">
                  {r === "PROFESSOR"
                    ? t("fields.roleProfessorHint")
                    : t("fields.roleAlunoHint")}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <Button type="submit" loading={loading} className="mt-1 w-full">
        {loading
          ? mode === "register"
            ? t("register.submitting")
            : t("login.submitting")
          : mode === "register"
            ? t("register.submit")
            : t("login.submit")}
      </Button>

      <p className="text-center text-sm text-zinc-600">
        {mode === "register" ? (
          <>
            {t("register.haveAccount")}{" "}
            <Link href="/login" className="font-semibold text-indigo-600 hover:underline">
              {t("register.login")}
            </Link>
          </>
        ) : (
          <>
            {t("login.noAccount")}{" "}
            <Link href="/register" className="font-semibold text-indigo-600 hover:underline">
              {t("login.createOne")}
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
