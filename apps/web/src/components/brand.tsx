import Link from 'next/link';

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link href="/dashboard" className="flex items-center gap-3" aria-label="VTU Platform home"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500 text-lg font-black text-slate-950">V</span>{!compact && <span className="text-sm font-bold tracking-tight text-white">VTU<span className="text-brand-400">Pay</span></span>}</Link>;
}
