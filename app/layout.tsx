import type { Metadata, Viewport } from 'next';
import { Toaster } from 'react-hot-toast';
import './globals.css';

export const metadata: Metadata = {
  title: 'HomeKeeper',
  description: 'Home maintenance management for couples',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'HomeKeeper',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#FFFFFF',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="apple-touch-startup-image" href="/icons/icon-512.png" />
      </head>
      <body className="font-sans text-ink-primary min-h-screen">
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              borderRadius: '12px',
              background: '#1C1C1E',
              color: '#fff',
              fontSize: '14px',
              padding: '12px 16px',
            },
          }}
        />
      </body>
    </html>
  );
}
