import ptBR from "../../messages/pt-BR.json";
import enUS from "../../messages/en-US.json";
import type { Locale } from "@/lib/types";

type Messages = typeof ptBR;

const MESSAGES: Record<Locale, Messages> = {
  "pt-BR": ptBR as Messages,
  "en-US": enUS as unknown as Messages,
};

/**
 * Mensagens fora do React (gerador de IA, PDF, etc).
 * Em runtime de servidor o JSON é resolvido uma vez e reutilizado.
 */
export function getStaticMessages(locale: string): Messages {
  return (MESSAGES[locale as Locale] ?? MESSAGES["pt-BR"]) as Messages;
}
