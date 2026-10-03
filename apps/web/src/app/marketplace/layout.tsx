import type { Metadata } from 'next';
import { Sora } from 'next/font/google';

const sora = Sora({ subsets: ['latin'], variable: '--font-sora' });

export const metadata: Metadata = {
  title: 'Marketplace | CHIMZO',
  description: 'Browse marketplace products and manage your cart.',
};

export default function MarketplaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className={sora.variable}>{children}</div>;
}
