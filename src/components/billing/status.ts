/** Tom do badge para o status da assinatura Stripe. */
export function statusTone(status: string) {
  switch (status) {
    case "active":
    case "trialing":
      return "success";
    case "past_due":
    case "incomplete":
    case "incomplete_expired":
      return "warning";
    case "canceled":
    case "unpaid":
      return "danger";
    default:
      return "outline";
  }
}

/** Primeira letra maiúscula nas demais minúsculas (monta a chave i18n do plano). */
export function capitalize(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
