import { Link } from "@/i18n/navigation";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 font-semibold tracking-tight text-zinc-900"
    >
      <span className="flex size-8 items-center justify-center rounded-lg gradient-brand text-ink">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="size-4.5"
          aria-hidden
        >
          <path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11" />
        </svg>
      </span>
      <span className="text-lg">
        CrIA <span className="text-indigo-600">Treino</span>
      </span>
    </Link>
  );
}
