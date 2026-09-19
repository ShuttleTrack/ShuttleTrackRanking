import { Fragment } from 'react';
import { Disclosure, Menu, Transition } from '@headlessui/react';
import { Bars3Icon, XMarkIcon, ChevronDownIcon, UserCircleIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { capitalizeFirstLetter } from '@/utils/string';
import { useSession, signOut } from 'next-auth/react';
import { usePlayers } from '@/hooks/usePlayers';
import Image from 'next/image';
import { useLiveGames } from '@/hooks/useLiveGames';

const BUILD_IDENTIFIER = process.env.NEXT_PUBLIC_BUILD_IDENTIFIER;

const historyLinks = [
  { name: 'Ranking History', href: '/player-ranking-history' },
  { name: 'Encounter History', href: '/encounter-history' },
];

function classNames(...classes: (string | boolean)[]): string {
  return classes.filter(Boolean).join(' ');
}

const menuPanelClass =
  'absolute mt-2 rounded-xl bg-surface-container border border-white/5 shadow-xl focus:outline-none z-[60] py-1';

const menuItemClass = (active: boolean) =>
  classNames(
    'block px-4 py-2 text-sm text-on-surface transition-colors',
    active ? 'bg-white/10' : 'hover:bg-white/5'
  );

const mobileItemClass = (active: boolean) =>
  classNames(
    'block px-3 py-2 rounded-md text-base font-headline font-medium w-full text-left',
    active ? 'text-white bg-white/10' : 'text-white/80 hover:bg-white/5 hover:text-white'
  );

const NavigationComponent = () => {
  const router = useRouter();
  const { players, isLoading } = usePlayers();
  const { data: session } = useSession();
  const { liveGames, isLoading: liveGamesLoading } = useLiveGames();

  const isEncountersPage = () =>
    router.pathname.includes('/player') && router.pathname.includes('/encounters');

  const isHistoryPage = () =>
    historyLinks.some((link) => router.pathname === link.href);

  const navLinkClass = (active: boolean) =>
    classNames(
      'font-headline text-sm tracking-tight font-semibold transition-colors duration-300 inline-flex items-center',
      active
        ? 'border-b-2 border-primary pb-1 text-white'
        : 'text-white/80 hover:text-white'
    );

  const renderPlayersList = () => {
    if (isLoading) {
      return (
        <div className="px-4 py-3 text-sm text-on-surface-variant">Loading players…</div>
      );
    }

    return players
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((player) => (
        <Menu.Item key={player.id}>
          {({ active }) => (
            <Link
              href={`/player/${player.id}/encounters`}
              className={menuItemClass(active)}
            >
              {capitalizeFirstLetter(player.name)}
            </Link>
          )}
        </Menu.Item>
      ));
  };

  const renderLiveGameItems = (onNavigate?: () => void) => {
    if (liveGamesLoading) {
      return (
        <div className="px-4 py-3 flex justify-center">
          <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      );
    }
    if (liveGames.length === 0) {
      return (
        <div className="px-4 py-3 text-sm text-on-surface-variant text-center">
          No live games
        </div>
      );
    }
    return liveGames.map((game) => (
      <Menu.Item key={game.id}>
        {({ active, close }) => (
          <Link
            href={`/game-viewer?gameId=${game.id}`}
            className={classNames(menuItemClass(active), 'px-4 py-3')}
            onClick={() => {
              close();
              onNavigate?.();
            }}
          >
            <div className="flex justify-between items-center mb-1">
              <span>Game #{game.id.slice(-4)}</span>
              <span className="text-sm text-on-surface-variant">{game.progress}%</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-1.5">
              <div
                className="bg-primary h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${game.progress}%` }}
              />
            </div>
          </Link>
        )}
      </Menu.Item>
    ));
  };

  const logoLink = (
    <Link href="/" className="flex-shrink-0 inline-flex items-stretch self-stretch">
      <Image
        src={`/dutch-lankan-shuttle-masters-logo.jpeg?v=${BUILD_IDENTIFIER}`}
        alt="Dutch Lankan Shuttle Masters"
        width={64}
        height={64}
        className="h-16 w-auto md:h-20 object-cover"
        priority
      />
      <span className="sr-only">Dutch Lankan Shuttle Masters</span>
    </Link>
  );

  const userMenu = () => {
    if (session) {
      return (
        <Menu as="div" className="relative">
          <Menu.Button
            className="flex items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label="Account menu"
          >
            {session.user?.image ? (
              <Image
                src={session.user.image}
                alt=""
                width={40}
                height={40}
                className="w-9 h-9 md:w-10 md:h-10 rounded-full object-cover ring-2 ring-primary/20"
              />
            ) : (
              <UserCircleIcon className="h-9 w-9 md:h-10 md:w-10 text-white/80" />
            )}
          </Menu.Button>
          <Transition
            as={Fragment}
            enter="transition ease-out duration-100"
            enterFrom="transform opacity-0 scale-95"
            enterTo="transform opacity-100 scale-100"
            leave="transition ease-in duration-75"
            leaveFrom="transform opacity-100 scale-100"
            leaveTo="transform opacity-0 scale-95"
          >
            <Menu.Items className={classNames(menuPanelClass, 'w-48 right-0 origin-top-right')}>
              {session.user.accessLevel?.includes('USER') && (
                <Menu.Item>
                  {({ active }) => (
                    <Link href="/user/management" className={menuItemClass(active)}>
                      Management
                    </Link>
                  )}
                </Menu.Item>
              )}
              {session.user.accessLevel?.includes('ADMIN') && (
                <Menu.Item>
                  {({ active }) => (
                    <Link href="/admin/dashboard" className={menuItemClass(active)}>
                      Admin Dashboard
                    </Link>
                  )}
                </Menu.Item>
              )}
              <Menu.Item>
                {({ active }) => (
                  <button
                    type="button"
                    onClick={() => signOut()}
                    className={classNames(menuItemClass(active), 'w-full text-left')}
                  >
                    Sign Out
                  </button>
                )}
              </Menu.Item>
            </Menu.Items>
          </Transition>
        </Menu>
      );
    }
    return (
      <Link href="/login" className={navLinkClass(false)}>
        Sign In
      </Link>
    );
  };

  return (
    <Disclosure
      as="nav"
      className="fixed top-0 left-0 right-0 z-[100] bg-surface-header border-b border-white/10"
    >
      {({ open, close }) => (
        <>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {/* Mobile bar */}
            <div className="grid grid-cols-3 items-stretch h-16 md:hidden">
              <div className="flex justify-start items-center">
                <Disclosure.Button className="inline-flex items-center justify-center p-2 rounded-md text-white/70 hover:text-white hover:bg-white/5 transition duration-150">
                  <span className="sr-only">Open main menu</span>
                  {open ? (
                    <XMarkIcon className="h-6 w-6" aria-hidden />
                  ) : (
                    <Bars3Icon className="h-6 w-6" aria-hidden />
                  )}
                </Disclosure.Button>
              </div>
              <div className="flex justify-center items-stretch">{logoLink}</div>
              <div className="flex justify-end items-center gap-2">
                {liveGames.length > 0 && (
                  <span
                    className="animate-pulse bg-red-500 w-2 h-2 rounded-full"
                    aria-hidden
                  />
                )}
                {userMenu()}
              </div>
            </div>

            {/* Desktop three-zone bar */}
            <div className="hidden md:block">
              <div className="grid grid-cols-3 h-20 items-stretch">
                <div className="flex items-stretch">{logoLink}</div>

                <div className="flex justify-center items-center gap-8">
                <Link href="/" className={navLinkClass(router.pathname === '/')}>
                  Rankings
                </Link>

                <Menu as="div" className="relative">
                  <Menu.Button className={navLinkClass(isEncountersPage())}>
                    Encounters
                    <ChevronDownIcon className="ml-1 h-4 w-4" aria-hidden />
                  </Menu.Button>
                  <Transition
                    as={Fragment}
                    enter="transition ease-out duration-100"
                    enterFrom="transform opacity-0 scale-95"
                    enterTo="transform opacity-100 scale-100"
                    leave="transition ease-in duration-75"
                    leaveFrom="transform opacity-100 scale-100"
                    leaveTo="transform opacity-0 scale-95"
                  >
                    <Menu.Items
                      className={classNames(
                        menuPanelClass,
                        'left-1/2 -translate-x-1/2 w-56 max-h-96 overflow-y-auto origin-top'
                      )}
                    >
                      {renderPlayersList()}
                    </Menu.Items>
                  </Transition>
                </Menu>

                <Menu as="div" className="relative">
                  <Menu.Button className={navLinkClass(isHistoryPage())}>
                    History
                    <ChevronDownIcon className="ml-1 h-4 w-4" aria-hidden />
                  </Menu.Button>
                  <Transition
                    as={Fragment}
                    enter="transition ease-out duration-100"
                    enterFrom="transform opacity-0 scale-95"
                    enterTo="transform opacity-100 scale-100"
                    leave="transition ease-in duration-75"
                    leaveFrom="transform opacity-100 scale-100"
                    leaveTo="transform opacity-0 scale-95"
                  >
                    <Menu.Items
                      className={classNames(
                        menuPanelClass,
                        'left-1/2 -translate-x-1/2 w-52 origin-top'
                      )}
                    >
                      {historyLinks.map((link) => (
                        <Menu.Item key={link.href}>
                          {({ active }) => (
                            <Link href={link.href} className={menuItemClass(active)}>
                              {link.name}
                            </Link>
                          )}
                        </Menu.Item>
                      ))}
                    </Menu.Items>
                  </Transition>
                </Menu>
              </div>

              <div className="flex justify-end items-center gap-4 self-center">
                {liveGames.length > 0 && (
                  <Menu as="div" className="relative">
                    <Menu.Button
                      className={classNames(
                        navLinkClass(false),
                        'gap-2 rounded-lg px-2 py-1 bg-red-500/10'
                      )}
                    >
                      <span className="animate-pulse bg-red-500 w-2 h-2 rounded-full" />
                      Live
                      <ChevronDownIcon className="h-4 w-4" aria-hidden />
                    </Menu.Button>
                    <Transition
                      as={Fragment}
                      enter="transition ease-out duration-100"
                      enterFrom="transform opacity-0 scale-95"
                      enterTo="transform opacity-100 scale-100"
                      leave="transition ease-in duration-75"
                      leaveFrom="transform opacity-100 scale-100"
                      leaveTo="transform opacity-0 scale-95"
                    >
                      <Menu.Items
                        className={classNames(menuPanelClass, 'right-0 w-64 origin-top-right')}
                      >
                        {renderLiveGameItems()}
                      </Menu.Items>
                    </Transition>
                  </Menu>
                )}
                {userMenu()}
              </div>
              </div>
            </div>
          </div>

          {/* Mobile menu panel */}
          <Disclosure.Panel className="md:hidden fixed top-16 left-0 right-0 bottom-0 bg-surface-header border-t border-white/10 overflow-y-auto z-[90]">
            <div className="px-3 pt-3 pb-6 space-y-1">
              <Disclosure.Button
                as={Link}
                href="/"
                className={mobileItemClass(router.pathname === '/')}
                onClick={() => close()}
              >
                Rankings
              </Disclosure.Button>

              <Disclosure>
                {({ open: encountersOpen }) => (
                  <>
                    <Disclosure.Button className={mobileItemClass(isEncountersPage())}>
                      <span className="flex w-full justify-between items-center">
                        Encounters
                        <ChevronDownIcon
                          className={classNames(
                            'h-5 w-5 text-white/50 transition-transform',
                            encountersOpen && 'rotate-180'
                          )}
                        />
                      </span>
                    </Disclosure.Button>
                    <Disclosure.Panel className="pl-3 space-y-1 pb-2">
                      {players
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((player) => (
                          <Link
                            key={player.id}
                            href={`/player/${player.id}/encounters`}
                            className={mobileItemClass(false)}
                            onClick={() => close()}
                          >
                            {capitalizeFirstLetter(player.name)}
                          </Link>
                        ))}
                    </Disclosure.Panel>
                  </>
                )}
              </Disclosure>

              <Disclosure>
                {({ open: historyOpen }) => (
                  <>
                    <Disclosure.Button className={mobileItemClass(isHistoryPage())}>
                      <span className="flex w-full justify-between items-center">
                        History
                        <ChevronDownIcon
                          className={classNames(
                            'h-5 w-5 text-white/50 transition-transform',
                            historyOpen && 'rotate-180'
                          )}
                        />
                      </span>
                    </Disclosure.Button>
                    <Disclosure.Panel className="pl-3 space-y-1 pb-2">
                      {historyLinks.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          className={mobileItemClass(router.pathname === link.href)}
                          onClick={() => close()}
                        >
                          {link.name}
                        </Link>
                      ))}
                    </Disclosure.Panel>
                  </>
                )}
              </Disclosure>

              <Disclosure>
                {({ open: liveOpen }) => (
                  <>
                    <Disclosure.Button
                      className={classNames(
                        mobileItemClass(false),
                        liveGames.length > 0 && 'bg-red-500/10'
                      )}
                    >
                      <span className="flex w-full justify-between items-center">
                        <span className="flex items-center gap-2">
                          {liveGames.length > 0 && (
                            <span className="animate-pulse bg-red-500 w-2 h-2 rounded-full" />
                          )}
                          Live
                        </span>
                        <ChevronDownIcon
                          className={classNames(
                            'h-5 w-5 text-white/50 transition-transform',
                            liveOpen && 'rotate-180'
                          )}
                        />
                      </span>
                    </Disclosure.Button>
                    <Disclosure.Panel className="pl-3 space-y-2 pb-2">
                      {liveGamesLoading ? (
                        <div className="px-3 py-2 flex justify-center">
                          <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                        </div>
                      ) : liveGames.length > 0 ? (
                        liveGames.map((game) => (
                          <Link
                            key={game.id}
                            href={`/game-viewer?gameId=${game.id}`}
                            className={mobileItemClass(false)}
                            onClick={() => close()}
                          >
                            <div className="flex justify-between items-center mb-1">
                              <span>Game #{game.id.slice(-4)}</span>
                              <span className="text-sm text-on-surface-variant">
                                {game.progress}%
                              </span>
                            </div>
                            <div className="w-full bg-white/10 rounded-full h-1.5">
                              <div
                                className="bg-primary h-1.5 rounded-full"
                                style={{ width: `${game.progress}%` }}
                              />
                            </div>
                          </Link>
                        ))
                      ) : (
                        <p className="px-3 py-2 text-sm text-on-surface-variant">
                          No live games
                        </p>
                      )}
                    </Disclosure.Panel>
                  </>
                )}
              </Disclosure>

              {!session && (
                <Link
                  href="/login"
                  className={mobileItemClass(false)}
                  onClick={() => close()}
                >
                  Sign In
                </Link>
              )}

              {session && (
                <div className="border-t border-white/10 mt-4 pt-4 space-y-1">
                  <p className="px-3 py-1 text-xs text-on-surface-variant truncate">
                    {session.user?.name}
                  </p>
                  {session.user.accessLevel?.includes('USER') && (
                    <Link
                      href="/user/management"
                      className={mobileItemClass(false)}
                      onClick={() => close()}
                    >
                      Management
                    </Link>
                  )}
                  {session.user.accessLevel?.includes('ADMIN') && (
                    <Link
                      href="/admin/dashboard"
                      className={mobileItemClass(false)}
                      onClick={() => close()}
                    >
                      Admin Dashboard
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      signOut();
                      close();
                    }}
                    className={mobileItemClass(false)}
                  >
                    Sign Out
                  </button>
                </div>
              )}

              <div className="px-3 py-2 text-xs text-on-surface-variant">
                Build: {BUILD_IDENTIFIER}
              </div>
            </div>
          </Disclosure.Panel>
        </>
      )}
    </Disclosure>
  );
};

export default NavigationComponent;
