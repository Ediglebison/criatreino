import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Prisma client gerado fora de node_modules
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
};

export default withNextIntl(nextConfig);
