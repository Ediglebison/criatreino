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

// Tokens do tema ember (globals.css) sobre papel claro.
const EMBER_LIGHT: [number, number, number] = [251, 191, 36];
const EMBER_MID: [number, number, number] = [245, 158, 11];
const EMBER_DEEP: [number, number, number] = [234, 88, 12];
const EMBER_MID_AT = 0.42;
const INK: [number, number, number] = [20, 16, 11];
const MUTED: [number, number, number] = [111, 96, 83];
const BORDER: [number, number, number] = [231, 221, 208];
const ROW_ALT: [number, number, number] = [246, 240, 231];
const DANGER: [number, number, number] = [192, 66, 58];
const MARGIN = 14;
const HEADER_HEIGHT = 26;

function fmtDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

function emberColorAt(position: number): [number, number, number] {
  const bounded = Math.min(Math.max(position, 0), 1);
  const isFirstSegment = bounded < EMBER_MID_AT;
  const segmentStartAt = isFirstSegment ? 0 : EMBER_MID_AT;
  const segmentEndAt = isFirstSegment ? EMBER_MID_AT : 1;
  const segmentFrom = isFirstSegment ? EMBER_LIGHT : EMBER_MID;
  const segmentTo = isFirstSegment ? EMBER_MID : EMBER_DEEP;
  const progress = (bounded - segmentStartAt) / (segmentEndAt - segmentStartAt);
  return [
    Math.round(segmentFrom[0] + (segmentTo[0] - segmentFrom[0]) * progress),
    Math.round(segmentFrom[1] + (segmentTo[1] - segmentFrom[1]) * progress),
    Math.round(segmentFrom[2] + (segmentTo[2] - segmentFrom[2]) * progress),
  ];
}

// jsPDF não tem preenchimento em gradiente; tiras verticais emulam os 135deg do site.
function fillEmberGradient(
  doc: jsPDF,
  left: number,
  top: number,
  width: number,
  height: number,
): void {
  const stripCount = 48;
  const stripWidth = width / stripCount;
  const gradientSpan = width + height;
  // A sobreposição cobre o fio de antialiasing entre retângulos vizinhos.
  const stripOverlap = 0.4;
  for (let stripIndex = 0; stripIndex < stripCount; stripIndex++) {
    const stripLeft = left + stripIndex * stripWidth;
    const stripRight = left + (stripIndex + 1) * stripWidth;
    const stripCenter = (stripLeft + stripRight) / 2 - left;
    const position = (stripCenter + height / 2) / gradientSpan;
    doc.setFillColor(...emberColorAt(position));
    doc.rect(stripLeft, top, stripRight - stripLeft + stripOverlap, height, "F");
  }
}

// Marca do logo: halter dos paths do Logo.tsx escalado para a caixa recebida.
function drawBrandMark(
  doc: jsPDF,
  left: number,
  top: number,
  size: number,
): void {
  const unit = size / 24;
  const point = (viewBoxX: number, viewBoxY: number): [number, number] => [
    left + viewBoxX * unit,
    top + viewBoxY * unit,
  ];
  const segments: Array<[[number, number], [number, number]]> = [
    [[6.5, 6.5], [6.5, 17.5]],
    [[3.5, 9], [3.5, 15]],
    [[17.5, 6.5], [17.5, 17.5]],
    [[20.5, 9], [20.5, 15]],
    [[6.5, 12], [17.5, 12]],
  ];
  doc.setDrawColor(...INK);
  doc.setLineWidth(2 * unit);
  doc.setLineCap("round");
  for (const segment of segments) {
    const [startX, startY] = point(segment[0][0], segment[0][1]);
    const [endX, endY] = point(segment[1][0], segment[1][1]);
    doc.line(startX, startY, endX, endY);
  }
}

export function buildWorkoutPdf(input: PdfInput): jsPDF {
  const t = getStaticMessages(input.locale);
  const m = t.pdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const label = (key: keyof typeof m) => m[key] as string;

  // ---------------- Cabeçalho ----------------
  fillEmberGradient(doc, 0, 0, pageWidth, HEADER_HEIGHT);
  const brandMarkSize = 10;
  drawBrandMark(
    doc,
    pageWidth - MARGIN - brandMarkSize,
    (HEADER_HEIGHT - brandMarkSize) / 2,
    brandMarkSize,
  );
  doc.setTextColor(...INK);
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
        lineColor: BORDER,
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: EMBER_LIGHT,
        textColor: INK,
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
    const dayChipLabel = day.label.split(" — ")[0];
    const dayChipWidth = doc.getTextWidth(dayChipLabel) + 6;
    fillEmberGradient(doc, MARGIN - 3, startY - 5, dayChipWidth, 7);
    doc.setTextColor(...INK);
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
      body: day.exercises.map((ex) => {
        const nameCell = `${ex.order}. ${ex.name}${ex.warning ? `\n(!) ${ex.warning}` : ""}`;
        return [
          ex.warning
            ? { content: nameCell, styles: { textColor: DANGER } }
            : nameCell,
          String(ex.sets),
          ex.reps,
          ex.restSeconds != null ? String(ex.restSeconds) : m.none,
          [ex.tempo, ex.notes].filter(Boolean).join(" · ") || m.none,
        ];
      }),
      theme: "striped",
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: 1.8,
        textColor: INK,
        lineColor: BORDER,
        lineWidth: 0.1,
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: EMBER_LIGHT,
        textColor: INK,
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: ROW_ALT },
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
