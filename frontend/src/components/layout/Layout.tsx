import NavigationComponent from '../NavigationComponent';
import SiteFooter from './SiteFooter';

const BUILD_IDENTIFIER = process.env.NEXT_PUBLIC_BUILD_IDENTIFIER;

interface LayoutProps {
  children: React.ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <NavigationComponent />
      <main className="flex-grow pt-16 md:pt-20">{children}</main>
      <SiteFooter />

      <div className="fixed bottom-2 left-2 hidden sm:block z-50">
        <div className="text-xs text-on-surface-variant bg-surface-container px-2 py-1 rounded-md border border-white/5">
          Build: {BUILD_IDENTIFIER}
        </div>
      </div>
    </div>
  );
};

export default Layout;
