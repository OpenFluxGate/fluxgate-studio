import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';

import { AuthProvider } from '@/components/providers/AuthProvider';
import { requestLocale } from '@/lib/serverLocale';

import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'FluxGate Studio',
  description: 'Rate limit monitoring and rule management',
  icons: { icon: '/brand/favicon' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#111217' },
    { media: '(prefers-color-scheme: light)', color: '#f4f5f5' },
  ],
};

// Applies the saved color mode before the first paint so a light choice never flashes dark.
const THEME_SCRIPT = `try{var m=localStorage.getItem('studio-color-mode');var r=document.documentElement;if(m==='light'){r.dataset.theme='light'}else if(m==='system'){delete r.dataset.theme}else{r.dataset.theme='dark'}}catch(e){}`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await requestLocale();
  return (
    <html lang={locale} data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${inter.variable} antialiased`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
