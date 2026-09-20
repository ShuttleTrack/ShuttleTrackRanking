import '../app/globals.css';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import Layout from '@/components/layout/Layout';
import React, { useEffect } from 'react';
import { SessionProvider } from 'next-auth/react';
import type { Session } from 'next-auth';
import { SquadProvider, type SquadSummary } from '@/contexts/SquadContext';
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

interface SquadPageProps {
  // Present on every page under pages/s/[squad]/** (set by its getServerSideProps) - absent on
  // non-squad-scoped pages (login, the squad picker, platform admin), which render with no
  // SquadProvider at all.
  squad?: SquadSummary;
  // Injected by next-auth when a page fetches the session server-side; unused by any page here
  // today, kept only because SessionProvider's initial-session prop expects this shape.
  session?: Session;
}

export default function App({ Component, pageProps: { session, squad, ...pageProps } }: AppProps<SquadPageProps>) {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'shuttletrack');
  }, []);

  const content = (
    <div
      className={`${inter.variable} ${manrope.variable} ${spaceGrotesk.variable} ${shareTechMono.variable} min-h-screen`}
    >
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </div>
  );

  return (
    <SessionProvider session={session}>
      <Head>
        <title>Dutch Lankan Shuttle Masters</title>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </Head>
      {squad ? <SquadProvider squad={squad}>{content}</SquadProvider> : content}
    </SessionProvider>
  );
}
