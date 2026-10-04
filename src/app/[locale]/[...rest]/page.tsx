import { notFound } from "next/navigation";

/**
 * Catch-all: qualquer URL que não corresponda a uma rota existente cai aqui
 * e renderiza `app/[locale]/not-found.tsx` (estilizado e localizado).
 *
 * O middleware i18n reescreve caminhos sem prefixo para o locale interno
 * (ex.: `/qualquer-coisa` → `/pt-BR/qualquer-coisa`), então este segmento
 * alcança tanto `/xxx` quanto `/en-US/xxx`.
 */
export default function CatchAll() {
  notFound();
}
