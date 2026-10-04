import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { getStaticMessages } from "@/lib/i18n-static";

type ProfileInfo = {
  goal: string;
  goalNotes: string | null;
  daysPerWeek: number;
  sessionMinutes: number;
  experience: string;
  limitations: string[];
  limitationNotes: string | null;
  equipment: string[];
  weightKg: number | null;
  heightCm: number | null;
} | null;

type DayRow = {
  label: string;
  focus: string | null;
  exercises: Array<{
    order: number;
    name: string;
    warning: string | null;
    sets: number;
    reps: string;
    restSeconds: number | null;
    tempo: string | null;
    notes: string | null;
  }>;
};

export type PdfInput = {
  title: string;
  createdAt: Date;
  athleteName: string;
  createdByName: string;
  locale: string;
  profile: ProfileInfo;
  days: DayRow[];
};

const INDIGO: [number, number, number] = [79, 70, 229];
const INK: [number, number, number] = [30, 30, 35];
const MUTED: [number, number, number] = [113, 113, 122];
const MARGIN = 14;

function fmtDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

export function buildWorkoutPdf(input: PdfInput): jsPDF {
  const t = getStaticMessages(input.locale);
  const m = t.pdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const label = (key: keyof typeof m) => m[key] as string;

  // ---------------- Cabeçalho ----------------
  doc.setFillColor(...INDIGO);
  doc.rect(0, 0, pageWidth, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(t.common.appName, MARGIN, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(t.common.tagline, MARGIN, 19);

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(input.title, MARGIN, 40, { maxWidth: pageWidth - 2 * MARGIN });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  const meta = `${label("generatedAt")}: ${fmtDate(input.createdAt, input.locale)}  ·  ${
    t.workout.athlete
  }: ${input.athleteName}  ·  ${t.workout.createdBy}: ${input.createdByName}`;
  doc.text(meta, MARGIN, 47, { maxWidth: pageWidth - 2 * MARGIN });

  let startY = 54;

  // ---------------- Resumo do atleta ----------------
  if (input.profile) {
    const p = input.profile;
    const value = (v: string | number | null | undefined) =>
      v === null || v === undefined || v === ""
        ? m.none
        : String(v);

    const goalLabel =
      t.goals[p.goal as keyof typeof t.goals] ?? p.goal;
    const expLabel =
      t.experience[p.experience as keyof typeof t.experience] ?? p.experience;
    const limitationLabels = p.limitations.map(
      (l) => t.limitations[l as keyof typeof t.limitations] ?? l,
    );
    const equipmentLabels = p.equipment.map(
      (e) => t.equipment[e as keyof typeof t.equipment] ?? e,
    );

    autoTable(doc, {
      startY,
      head: [[m.summary, ""]],
      body: [
        [m.goal, `${goalLabel}${p.goalNotes ? ` — ${p.goalNotes}` : ""}`],
        [
          m.daysPerWeek,
          `${p.daysPerWeek} · ${p.sessionMinutes} ${t.profile.minutes}`,
        ],
        [m.experience, expLabel],
        [
          m.limitations,
          limitationLabels.length
            ? `${limitationLabels.join(", ")}${p.limitationNotes ? ` — ${p.limitationNotes}` : ""}`
            : m.none,
        ],
        [m.equipment, equipmentLabels.length ? equipmentLabels.join(", ") : m.none],
        [
          m.weight,
          value(p.weightKg),
        ],
        [m.height, value(p.heightCm)],
      ],
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: 1.8,
        textColor: INK,
        lineColor: [228, 228, 231],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: INDIGO,
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      columnStyles: {
        0: { cellWidth: 42, fontStyle: "bold", textColor: MUTED },
      },
      margin: { left: MARGIN, right: MARGIN },
    });

    startY = ((doc as unknown as { lastAutoTable: { finalY: number } })
      .lastAutoTable?.finalY ?? startY) + 8;
  }

  // ---------------- Dias ----------------
  input.days.forEach((day) => {
    const tableHeight = 12 + day.exercises.length * 8;
    if (startY + tableHeight > pageHeight - 24) {
      doc.addPage();
      startY = MARGIN + 4;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...INDIGO);
    doc.text(day.label, MARGIN, startY);
    if (day.focus) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text(day.focus, MARGIN, startY + 5);
    }
    startY += day.focus ? 10 : 7;

    autoTable(doc, {
      startY,
      head: [
        [
          m.exercise,
          m.sets,
          m.reps,
          m.rest,
          t.workout.table.notes,
        ],
      ],
      body: day.exercises.map((ex) => [
        `${ex.order}. ${ex.name}${ex.warning ? `\n(!) ${ex.warning}` : ""}`,
        String(ex.sets),
        ex.reps,
        ex.restSeconds != null ? String(ex.restSeconds) : m.none,
        [ex.tempo, ex.notes].filter(Boolean).join(" · ") || m.none,
      ]),
      theme: "striped",
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: 1.8,
        textColor: INK,
        lineColor: [228, 228, 231],
        lineWidth: 0.1,
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: INDIGO,
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [248, 248, 250] },
      columnStyles: {
        0: { cellWidth: 78 },
        1: { cellWidth: 14, halign: "center" },
        2: { cellWidth: 24, halign: "center" },
        3: { cellWidth: 20, halign: "center" },
      },
      margin: { left: MARGIN, right: MARGIN },
    });

    startY =
      ((doc as unknown as { lastAutoTable: { finalY: number } })
        .lastAutoTable?.finalY ?? startY) + 12;
  });

  // ---------------- Aviso + paginação ----------------
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const y = pageHeight - 10;
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(
      `${m.disclaimer}`,
      MARGIN,
      y,
      { maxWidth: pageWidth - 2 * MARGIN - 24 },
    );
    doc.text(
      `${i} / ${totalPages}`,
      pageWidth - MARGIN,
      y,
      { align: "right" },
    );
  }

  return doc;
}

export function pdfFilename(title: string, locale: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  const prefix = locale === "en-US" ? "workout" : "treino";
  return `${prefix}-${base || "plano"}.pdf`;
}
