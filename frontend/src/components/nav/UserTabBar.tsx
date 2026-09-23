import Link from 'next/link';
import { useRouter } from 'next/router';
import { useOptionalSquad } from '@/contexts/SquadContext';
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
import { useUpcomingGameDays } from '@/hooks/useUpcomingGameDays';
import { isUserTabBarRoute } from '@/utils/userTabBar';

type TabId = 'profile' | 'checkin' | 'matches';

function tabClass(active: boolean): string {
  return active
    ? 'text-primary'
    : 'text-on-surface-variant transition-colors hover:text-on-surface';
}

export function UserTabBar() {
  const router = useRouter();
  const squad = useOptionalSquad();
  const showBar = isUserTabBarRoute(router.pathname) && Boolean(squad?.isPlayerHere);
  // The nearest game day whose session has not ended yet - today's included after voting closes.
  const { gameDays } = useUpcomingGameDays(showBar);

  const slug = squad?.slug;
  const nearest = gameDays[0];
  const checkInHref = slug
    ? nearest
      ? `/s/${slug}/game-day/${nearest.gameDate}`
      : `/s/${slug}/user/profile`
    : '/squads';

  if (!showBar || !slug) return null;

  const activeTab: TabId =
    router.pathname === '/s/[squad]/user/profile'
      ? 'profile'
      : router.pathname === '/s/[squad]/user/matches'
        ? 'matches'
        : 'checkin';
  // With no game day open for check-in the tab falls back to the profile page, whose "Upcoming
  // sessions" list explains why - rather than linking at a date that has no game day.

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
      href: `/s/${slug}/user/profile`,
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
      href: `/s/${slug}/user/matches`,
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
