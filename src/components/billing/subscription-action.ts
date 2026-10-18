/** Eco da rota após a ação. O conjunto de campos varia entre as rotas user/admin. */
export type SubscriptionAck = {
  status?: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: string | null;
};

/**
 * Resultado do POST. A rota devolve um código de erro cru quando `ok` é
 * `false`; a tela traduz o código para a mensagem i18n.
 */
export type SubscriptionActionResult =
  | { ok: true; subscription: SubscriptionAck }
  | { ok: false; error: string };

/** Código que nenhuma tela reconhece: vira a mensagem genérica de erro. */
const UNKNOWN_ERROR = "unknown";

/**
 * POST a uma rota de cancelamento/reativação de assinatura.
 * `extraBody` leva os campos próprios da rota (ex.: `userId` na rota admin).
 */
export async function postSubscriptionAction(
  endpoint: string,
  action: "cancel" | "reactivate",
  extraBody: Record<string, unknown> = {},
): Promise<SubscriptionActionResult> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...extraBody, action }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: unknown;
      subscription?: SubscriptionAck;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: typeof data.error === "string" ? data.error : UNKNOWN_ERROR,
      };
    }
    return { ok: true, subscription: data.subscription ?? {} };
  } catch {
    return { ok: false, error: UNKNOWN_ERROR };
  }
}
