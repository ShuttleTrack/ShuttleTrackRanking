import '../app/globals.css';
import type { AppProps } from 'next/app';
import Layout from '@/components/layout/Layout';
import React, { useEffect } from 'react';
import { SessionProvider } from 'next-auth/react';
import { Inter, Manrope, Space_Grotesk } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-headline',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-label',
});

export default function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'shuttletrack');
  }, []);

  return (
    <SessionProvider session={session}>
      <div className={`${inter.variable} ${manrope.variable} ${spaceGrotesk.variable} min-h-screen`}>
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </div>
    </SessionProvider>
  );
}
