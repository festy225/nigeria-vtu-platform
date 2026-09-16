import { ProtectedRoute } from '@/components/protected-route';
import { Header } from '@/components/header';
import { Sidebar } from '@/components/sidebar';
export default function DashboardLayout({ children }: { children: React.ReactNode }) { return <ProtectedRoute><div className="min-h-screen bg-slate-950 lg:flex"><div className="hidden lg:block"><Sidebar /></div><div className="min-w-0 flex-1"><Header /><main className="mx-auto max-w-[1440px] p-5 lg:p-8">{children}</main></div></div></ProtectedRoute>; }
