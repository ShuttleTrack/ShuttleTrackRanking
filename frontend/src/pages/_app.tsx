import '../app/globals.css';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import Layout from '@/components/layout/Layout';
import React, { useEffect } from 'react';
import { SessionProvider } from 'next-auth/react';
import { Inter, Manrope, Share_Tech_Mono, Space_Grotesk } from 'next/font/google';

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

const shareTechMono = Share_Tech_Mono({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-numeric',
});

export default function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'shuttletrack');
  }, []);

  return (
    <SessionProvider session={session}>
      <Head>
        <title>Dutch Lankan Shuttle Masters</title>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </Head>
      <div
        className={`${inter.variable} ${manrope.variable} ${spaceGrotesk.variable} ${shareTechMono.variable} min-h-screen`}
      >
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </div>
    </SessionProvider>
  );
}
