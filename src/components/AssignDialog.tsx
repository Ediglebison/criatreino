"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Alert, Button, Field, Select, Spinner, Textarea } from "@/components/ui";

type StudentOption = { id: string; name: string; email: string };

export function AssignDialog({ workoutId }: { workoutId: string }) {
  const t = useTranslations();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState<StudentOption[] | null>(null);
  const [studentId, setStudentId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function openDialog() {
    setOpen(true);
    setError(null);
    setSuccess(null);
    if (students !== null) return;
    setLoading(true);
    try {
      const res = await fetch("/api/students");
      const data = await res.json();
      if (!res.ok) throw new Error();
      setStudents(data.students as StudentOption[]);
    } catch {
      setError(t("common.errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/workouts/${workoutId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, note: note || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error === "alreadyAssigned"
            ? t("workout.assignDialog.already")
            : data.error === "studentNotFound"
              ? t("workout.assignDialog.notFound")
              : data.error === "alreadyOwner"
                ? t("workout.assignDialog.self")
                : t("common.errorGeneric"),
        );
        return;
      }
      const chosen = students?.find((s) => s.id === studentId);
      setSuccess(
        t("workout.assignDialog.success", { name: chosen?.name ?? "" }),
      );
      setNote("");
      router.refresh();
    } catch {
      setError(t("common.errorGeneric"));
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={openDialog}>
        📤 {t("workout.assign")}
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-xl">
        <div className="mb-1 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-zinc-900">
              {t("workout.assignDialog.title")}
            </h3>
            <p className="text-sm text-zinc-500">
              {t("workout.assignDialog.description")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            aria-label={t("common.close")}
          >
            ✕
          </button>
        </div>

        <form onSubmit={send} className="mt-4 flex flex-col gap-4">
          {error && <Alert>{error}</Alert>}
          {success && <Alert tone="success">{success}</Alert>}

          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-zinc-600">
              <Spinner className="size-4" /> {t("common.loading")}
            </div>
          ) : (
            <Field label={t("workout.assignDialog.student")} required>
              <Select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                required
              >
                <option value="">
                  {t("workout.assignDialog.searchStudent")}
                </option>
                {(students ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.email}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label={t("workout.assignDialog.note")}>
            <Textarea
              rows={2}
              value={note}
              placeholder={t("workout.assignDialog.notePlaceholder")}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              loading={sending}
              disabled={!studentId || loading}
            >
              {sending
                ? t("workout.assignDialog.sending")
                : t("workout.assignDialog.submit")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
