import localFont from 'next/font/local';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';

const geist = localFont({
  src: './fonts/geist-latin.woff2',
  variable: '--font-geist',
  weight: '100 900',
  display: 'swap',
});

const newsreader = localFont({
  src: [
    { path: './fonts/newsreader-latin.woff2', weight: '200 800', style: 'normal' },
    { path: './fonts/newsreader-latin-italic.woff2', weight: '200 800', style: 'italic' },
  ],
  variable: '--font-newsreader',
  display: 'swap',
});

export const metadata = {
  title: 'Cadensend — Email series platform',
  description: 'Plan, write, and send email series on a schedule.',
  icons: {
    icon: [
      { url: '/logo.svg', type: 'image/svg+xml' },
      { url: '/logo.png', type: 'image/png' },
    ],
    apple: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geist.variable} ${newsreader.variable}`}>
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
