import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isProd = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  // Só em produção: HSTS em localhost atrapalha o dev (HTTP).
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // Não divulga o framework nos cabeçalhos da resposta.
  poweredByHeader: false,
  // Prisma client gerado fora de node_modules
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  // Cabeçalhos em TODA resposta (páginas, /api e assets) — o proxy do
  // Next 16 não cobre /api, então aqui é a fonte única.
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
