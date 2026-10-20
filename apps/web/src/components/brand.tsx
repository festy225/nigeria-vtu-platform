import Link from 'next/link';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/dashboard"
      className="inline-flex items-center gap-3"
      aria-label="CHIMZO home"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#08205B] shadow-sm">
        <svg
          aria-hidden="true"
          viewBox="0 0 40 40"
          className="h-7 w-7"
          fill="none"
        >
          <path
            d="M27.5 11.8A12 12 0 1 0 27.5 28.2"
            stroke="#00D4A3"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M22 20H33M28 15L33 20L28 25"
            stroke="#FFFFFF"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {!compact && (
        <span className="text-lg font-extrabold tracking-tight text-[#08205B]">
          CHIM<span className="text-[#00A982]">ZO</span>
        </span>
      )}
    </Link>
  );
}
