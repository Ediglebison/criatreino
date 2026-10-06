"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
} from "@/components/ui";

export type StudentDTO = {
  id: string;
  name: string;
  email: string;
  createdAt: Date | string;
  _count: { workoutsOwned: number; assignments: number };
};

export function StudentManager({ students }: { students: StudentDTO[] }) {
  const t = useTranslations();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q),
    );
  }, [students, query]);

  return (
    <div className="flex flex-col gap-6">
      <AddStudentCard />

      <div className="flex items-center gap-3">
        <Input
          type="search"
          placeholder={t("students.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        <span className="text-sm text-zinc-500">
          {filtered.length} / {students.length}
        </span>
      </div>

      {students.length === 0 ? (
        <Card className="text-center">
          <p className="font-medium text-zinc-800">{t("students.empty")}</p>
          <p className="mt-1 text-sm text-zinc-500">{t("students.emptyHint")}</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <p className="text-sm text-zinc-600">{t("common.noResults")}</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3 font-medium">
                  {t("students.table.name")}
                </th>
                <th className="px-4 py-3 font-medium">
                  {t("students.table.email")}
                </th>
                <th className="px-4 py-3 font-medium">
                  {t("students.table.workouts")}
                </th>
                <th className="px-4 py-3 font-medium">
                  {t("students.table.joined")}
                </th>
                <th className="px-4 py-3 font-medium text-right">
                  {t("common.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const total =
                  s._count.workoutsOwned + s._count.assignments;
                return (
                  <tr
                    key={s.id}
                    className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50"
                  >
                    <td className="px-4 py-3 font-medium text-zinc-900">
                      {s.name}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{s.email}</td>
                    <td className="px-4 py-3">
                      <Badge tone={total > 0 ? "info" : "outline"}>{total}</Badge>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                      }).format(new Date(s.createdAt))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/workouts/new?student=${s.id}`}
                        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100"
                      >
                        {t("students.newWorkoutFor")}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function AddStudentCard() {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          data.error === "emailTaken"
            ? t("dashboard.newStudentDialog.emailTaken")
            : t("common.errorGeneric"),
        );
        return;
      }
      setSuccess(t("dashboard.newStudentDialog.success"));
      setName("");
      setEmail("");
      setPassword("");
      // Recarrega para atualizar a lista do servidor
      setTimeout(() => window.location.reload(), 600);
    } catch {
      setError(t("common.errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        + {t("dashboard.newStudent")}
      </Button>
    );
  }

  return (
    <Card>
      <div className="mb-4">
        <h3 className="font-semibold text-zinc-900">
          {t("dashboard.newStudentDialog.title")}
        </h3>
        <p className="mt-1 text-sm text-zinc-500">
          {t("dashboard.newStudentDialog.description")}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-3">
        {error && <Alert className="sm:col-span-3">{error}</Alert>}
        {success && (
          <Alert tone="success" className="sm:col-span-3">
            {success}
          </Alert>
        )}

        <Field label={t("wizard.athleteStep.newStudentName")} required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
          />
        </Field>
        <Field label={t("wizard.athleteStep.newStudentEmail")} required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label={t("wizard.athleteStep.newStudentPassword")} required>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </Field>

        <div className="flex gap-2 sm:col-span-3">
          <Button type="submit" loading={loading}>
            {t("dashboard.newStudentDialog.submit")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
          >
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
