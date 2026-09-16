import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nigerian VTU Platform',
  description: 'Production-ready foundation for a Nigerian VTU and digital-services platform.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
