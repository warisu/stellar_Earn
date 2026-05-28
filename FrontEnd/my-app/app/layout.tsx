import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { AppLayout } from '@/components/layout/AppLayout';
import './globals.css';
import { RootProviders } from '@/app/providers/RootProviders';
import { WalletConnectionModal } from '@/components/wallet/WalletConnectionModal';
import { SessionManager } from '@/components/auth/SessionManager';
import { ConsentBanner } from '@/components/analytics/ConsentBanner';
import { SkipToContent } from '@/components/a11y/SkipToContent';
import { A11yAnnouncerProvider } from '@/components/a11y/A11yAnnouncer';
import PerformanceMonitor from '@/components/ui/PerformanceMonitor';
import { EnvValidator } from '@/components/providers/EnvValidator';
import { SWRegister } from '@/components/SWRegister';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'StellarEarn - Quest-Based Earning Platform',
  description:
    'Complete quests, earn rewards, and build your on-chain reputation with Stellar',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const themeInitScript = `
    (function() {
      try {
        var stored = localStorage.getItem('stellar_earn_theme');
        var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        var theme = stored === 'dark' || stored === 'light' ? stored : (prefersDark ? 'dark' : 'light');
        var root = document.documentElement;
        root.classList.toggle('dark', theme === 'dark');
        root.setAttribute('data-theme', theme);
        root.style.colorScheme = theme;
      } catch (e) {}
    })();
  `;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <EnvValidator>
          <RootProviders>
            <SkipToContent />
            <SWRegister />
            {children}
            <PerformanceMonitor />
            <ConsentBanner />
            <WalletConnectionModal />
            <SessionManager />
          </RootProviders>
        </EnvValidator>
      </body>
    </html>
  );
}
