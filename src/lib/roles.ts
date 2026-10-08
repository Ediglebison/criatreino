import type { Role } from "@/lib/types";

/**
 * Funções que "dão aula": professores e administradores.
 *
 * O ADMIN mantém todas as capacidades de professor (alunos, treinos,
 * geração, cota e assinatura do próprio conta) além do painel /admin —
 * assim a promoção de uma conta existente não quebra o uso atual dela.
 * Puro e importável de client e server.
 */
export function canTeach(role: Role): boolean {
  return role === "PROFESSOR" || role === "ADMIN";
}

/** Acesso exclusivo do painel administrativo. */
export function isAdmin(role: Role): boolean {
  return role === "ADMIN";
}
