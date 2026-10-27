import { hash, compare } from "bcryptjs";

const ROUNDS = 12;
const BCRYPT_PREFIX = /^\$2[ab]\$(\d{2})\$/;

function bcryptRounds(hashed: string): number | null {
  const match = BCRYPT_PREFIX.exec(hashed);
  return match ? Number(match[1]) : null;
}

// Par fixo só para gastar o custo bcrypt em ramos sem usuário.
// O hash tem o custo de ROUNDS.
const DUMMY_PASSWORD = "cria-treino-timing-equalizer-4f2a";
const DUMMY_HASH = "$2b$12$yZezbU2CP712KEub.G0vduW0pE06yy0.T2OyUZqCEEeRszMqosNEq";

if (bcryptRounds(DUMMY_HASH) !== ROUNDS) {
  throw new Error(`DummyHashRoundsMismatch: DUMMY_HASH must use ROUNDS=${ROUNDS}`);
}

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return compare(plain, hashed);
}

export function passwordNeedsRehash(hashed: string): boolean {
  const rounds = bcryptRounds(hashed);
  return rounds !== null && rounds !== ROUNDS;
}

export async function dummyPasswordCompare(): Promise<void> {
  // Gasta o mesmo custo de um login real. O resultado é descartado de
  // propósito: quem chama está em um ramo sem usuário e nunca autentica.
  await compare(DUMMY_PASSWORD, DUMMY_HASH);
}
