import type { Metadata } from 'next';
import { AuthProvider } from '@/components/providers/auth-provider';
import './globals.css';

export const metadata: Metadata = { title: 'VTUPay', description: 'Digital services and wallet platform.' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body><AuthProvider>{children}</AuthProvider></body></html>; }
