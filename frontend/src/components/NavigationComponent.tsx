import { useEffect } from 'react';
import { Disclosure } from '@headlessui/react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/router';
import { usePlayers } from '@/hooks/usePlayers';
import { useLiveGames } from '@/hooks/useLiveGames';
import { NavLogo } from './nav/NavLogo';
import { ScoreboardNav } from './nav/ScoreboardNav';
import { LiveGamesControl, LiveGamesControlDesktop } from './nav/LiveGamesControl';
import { AccountMenu } from './nav/AccountMenu';
import { MobileScoreboardMenu } from './nav/MobileScoreboardMenu';

function useMobileMenuScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [locked]);
}

function NavShell({ open, close }: { open: boolean; close: () => void }) {
  const router = useRouter();
  const { players, isLoading: playersLoading } = usePlayers();
  const { liveGames, isLoading: liveGamesLoading } = useLiveGames();

  useMobileMenuScrollLock(open);

  useEffect(() => {
    const handleRoute = () => close();
    router.events.on('routeChangeStart', handleRoute);
    return () => router.events.off('routeChangeStart', handleRoute);
  }, [close, router.events]);

  return (
    <>
      <div className="h-0.5 w-full kinetic-gradient" aria-hidden />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 border-b border-white/5">
        <div className="grid grid-cols-3 items-stretch h-16 md:hidden">
          <div className="flex justify-start items-center">
            <Disclosure.Button className="inline-flex items-center justify-center p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/5 transition duration-150">
              <span className="sr-only">Open main menu</span>
              {open ? (
                <XMarkIcon className="h-6 w-6" aria-hidden />
              ) : (
                <Bars3Icon className="h-6 w-6" aria-hidden />
              )}
            </Disclosure.Button>
          </div>
          <div className="flex justify-center items-stretch">
            <NavLogo />
          </div>
          <div className="flex justify-end items-center gap-2">
            <LiveGamesControl liveGames={liveGames} isLoading={liveGamesLoading} />
            <AccountMenu />
          </div>
        </div>

        <div className="hidden md:block">
          <div className="grid grid-cols-3 h-20 items-stretch">
            <div className="flex items-stretch">
              <NavLogo />
            </div>
            <div className="flex justify-center items-center">
              <ScoreboardNav players={players} playersLoading={playersLoading} />
            </div>
            <div className="flex justify-end items-center gap-3 self-center">
              <LiveGamesControlDesktop liveGames={liveGames} isLoading={liveGamesLoading} />
              <AccountMenu />
            </div>
          </div>
        </div>
      </div>

      <Disclosure.Panel className="md:hidden fixed top-16 left-0 right-0 bottom-0 bg-surface-header border-t border-white/5 overflow-y-auto z-[90]">
        <MobileScoreboardMenu
          players={players}
          playersLoading={playersLoading}
          liveGames={liveGames}
          onClose={close}
        />
      </Disclosure.Panel>
    </>
  );
}

const NavigationComponent = () => (
  <Disclosure as="nav" className="fixed top-0 left-0 right-0 z-[100] bg-surface-header">
    {({ open, close }) => <NavShell open={open} close={close} />}
  </Disclosure>
);

export default NavigationComponent;
