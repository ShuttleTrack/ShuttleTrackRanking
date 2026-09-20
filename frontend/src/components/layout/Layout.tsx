import Image from 'next/image';
import NavigationComponent from '../NavigationComponent';
import SiteFooter from './SiteFooter';

const BUILD_IDENTIFIER = process.env.NEXT_PUBLIC_BUILD_IDENTIFIER ?? 'local';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="relative min-h-screen flex flex-col bg-background">
      {/* Gray logo watermark — decorative, behind all content */}
      <div
        className="fixed inset-0 z-0 flex items-center justify-center pointer-events-none select-none"
        aria-hidden
      >
        <Image
          src="/dutch-lankan-shuttle-masters-logo-gray.png"
          alt=""
          width={980}
          height={980}
          className="w-[min(78vw,44rem)] h-auto opacity-[0.13]"
          priority={false}
          draggable={false}
        />
      </div>

      {/* All real page content sits above the watermark */}
      <div className="relative z-10 flex flex-col min-h-screen">
        <NavigationComponent />
        <main className="flex-grow pt-16 md:pt-20">{children}</main>
        <SiteFooter />

        <div className="fixed bottom-2 left-2 hidden sm:block z-50">
          <div className="text-xs text-on-surface-variant bg-surface-container px-2 py-1 rounded-md border border-white/5">
            Build: {BUILD_IDENTIFIER}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Layout;
