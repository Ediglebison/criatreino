import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Navegação consciente de idioma (Link, useRouter, redirect, getPathname)
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
