import { Geist, Newsreader } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
});

const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-newsreader',
  style: ['normal', 'italic'],
});

export const metadata = {
  title: 'Cadensend - AI Newsletter Series Platform',
  description: 'Turn learning goals into grounded, scheduled email courses — delivered exactly once.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geist.variable} ${newsreader.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <AuthProvider>
          <a href="#main-content" className="skip-link">
            Skip to main content
          </a>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
