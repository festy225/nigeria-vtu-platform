import { Sora } from 'next/font/google';
import { SellerWorkspaceShell } from './SellerWorkspace';

const sora = Sora({ subsets: ['latin'], variable: '--font-sora' });

export default function SellerDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${sora.variable} [font-family:var(--font-sora),Arial,sans-serif]`}>
      <SellerWorkspaceShell>{children}</SellerWorkspaceShell>
    </div>
  );
}