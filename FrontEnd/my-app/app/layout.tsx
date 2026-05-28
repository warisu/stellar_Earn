import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { AppLayout } from '@/components/layout/AppLayout';
import './globals.css';
import { ToastProvider } from '@/components/notifications/Toast';
import { ThemeProvider } from '@/app/providers/ThemeProvider';
import { AuthProvider } from '@/app/providers/AuthProvider';
import { WalletConnectionModal } from '@/components/wallet/WalletConnectionModal';
import { WalletProvider } from '@/context/WalletContext';
import { SessionManager } from '@/components/auth/SessionManager';
import { AnalyticsProvider } from '@/app/providers/AnalyticsProvider';
import { ConsentBanner } from '@/components/analytics/ConsentBanner';
import { SkipToContent } from '@/components/a11y/SkipToContent';
import { A11yAnnouncerProvider } from '@/components/a11y/A11yAnnouncer';
import PerformanceMonitor from '@/components/ui/PerformanceMonitor';
import { AppErrorBoundary } from '@/components/error/ErrorBoundary';
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
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Render-blocking script prevents flash of unstyled theme on first paint */}
        <script src="/theme-init.js" />
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
          <ThemeProvider>
            <A11yAnnouncerProvider>
              <WalletProvider>
                <AuthProvider>
                  <AnalyticsProvider>
                    <ToastProvider>
                      <AppErrorBoundary>
                        <SkipToContent />
                        <SWRegister />
                        {children}
                        <PerformanceMonitor />
                        <ConsentBanner />
                        <WalletConnectionModal />
                        <SessionManager />
                      </AppErrorBoundary>
                    </ToastProvider>
                  </AnalyticsProvider>
                </AuthProvider>
              </WalletProvider>
            </A11yAnnouncerProvider>
          </ThemeProvider>
        </EnvValidator>
      </body>
    </html>
  );
}
