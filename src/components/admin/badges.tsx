import type { Plan } from "@/lib/billing/limits";
import type { Role } from "@/lib/types";

/** Mesmos tons aceitos por <Badge> (src/components/ui.tsx). */
export type BadgeTone = "default" | "success" | "warning" | "info" | "danger" | "outline";

/** Tom do badge para um plano (usado nas telas do painel). */
export function planTone(plan: Plan | string): BadgeTone {
  switch (plan) {
    case "BASIC":
      return "info";
    case "PRO":
      return "success";
    case "ULTIMATE":
      return "warning";
    default:
      return "outline";
  }
}

/** Tom do badge para uma função. */
export function roleTone(role: Role | string): BadgeTone {
  switch (role) {
    case "ADMIN":
      return "danger";
    case "PROFESSOR":
      return "info";
    default:
      return "outline";
  }
}
