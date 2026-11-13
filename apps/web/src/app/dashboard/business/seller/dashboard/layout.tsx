import { Sora } from 'next/font/google';
import { SellerWorkspaceShell } from './SellerWorkspace';
import { ProtectedRoute } from '@/components/protected-route';

const sora = Sora({ subsets: ['latin'], variable: '--font-sora' });

export default function SellerDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute roles={['SELLER']}>
      <div className={`${sora.variable} [font-family:var(--font-sora),Arial,sans-serif]`}>
        <SellerWorkspaceShell>{children}</SellerWorkspaceShell>
      </div>
    </ProtectedRoute>
  );
}