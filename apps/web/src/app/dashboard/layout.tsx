import { ProtectedRoute } from '@/components/protected-route';
import { Header } from '@/components/header';
import { Sidebar } from '@/components/sidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#F5F7FB] lg:flex">
        <div className="hidden shrink-0 lg:block">
          <Sidebar />
        </div>
        <div className="min-w-0 flex-1">
          <Header />
          <main className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
