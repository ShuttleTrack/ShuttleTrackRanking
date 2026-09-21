import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  CalendarDaysIcon,
  PencilSquareIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import {
  CalendarDaysIcon as CalendarDaysIconSolid,
  PencilSquareIcon as PencilSquareIconSolid,
  UserCircleIcon as UserCircleIconSolid,
} from '@heroicons/react/24/solid';
import { nextUpcomingSession } from '@/lib/check-in/schedule';
import { isUserTabBarRoute } from '@/utils/userTabBar';

type TabId = 'profile' | 'checkin' | 'matches';

function tabClass(active: boolean): string {
  return active
    ? 'text-primary'
    : 'text-on-surface-variant transition-colors hover:text-on-surface';
}

export function UserTabBar() {
  const router = useRouter();
  const { data: session } = useSession();
  const [now, setNow] = useState(() => new Date());

  const showBar =
    isUserTabBarRoute(router.pathname) && session?.user?.accessLevel?.includes('USER');

  useEffect(() => {
    if (!showBar) return;
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, [showBar]);

  const checkInHref = useMemo(() => {
    const sessionDay = nextUpcomingSession(now);
    return `/game-day/${sessionDay.id}`;
  }, [now]);

  if (!showBar) return null;

  const activeTab: TabId =
    router.pathname === '/user/profile'
      ? 'profile'
      : router.pathname === '/user/matches'
        ? 'matches'
        : 'checkin';

  const tabs: {
    id: TabId;
    label: string;
    href: string;
    Icon: typeof UserCircleIcon;
    IconActive: typeof UserCircleIconSolid;
  }[] = [
    {
      id: 'profile',
      label: 'Profile',
      href: '/user/profile',
      Icon: UserCircleIcon,
      IconActive: UserCircleIconSolid,
    },
    {
      id: 'checkin',
      label: 'Check-in',
      href: checkInHref,
      Icon: CalendarDaysIcon,
      IconActive: CalendarDaysIconSolid,
    },
    {
      id: 'matches',
      label: 'Matches',
      href: '/user/matches',
      Icon: PencilSquareIcon,
      IconActive: PencilSquareIconSolid,
    },
  ];

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 border-t border-white/5 bg-surface-header pb-[env(safe-area-inset-bottom)]"
      aria-label="Player navigation"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {tabs.map(({ id, label, href, Icon, IconActive }) => {
          const active = activeTab === id;
          const IconComponent = active ? IconActive : Icon;
          return (
            <li key={id} className="flex-1">
              <Link
                href={href}
                className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 px-2 py-2 font-label text-[10px] font-bold uppercase tracking-widest ${tabClass(active)}`}
                aria-current={active ? 'page' : undefined}
              >
                <IconComponent className="h-6 w-6 shrink-0" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
