import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronDownIcon, UserCircleIcon, PencilSquareIcon, Squares2X2Icon, ArrowRightOnRectangleIcon, ArrowsRightLeftIcon } from '@heroicons/react/24/outline';
import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import type { Player } from '@/types/player';
import type { LiveGame } from '@/hooks/useLiveGames';
import { NavPlayerSearch } from './NavPlayerSearch';
import { LiveGameProgressCards } from './LiveGameProgressList';
import { classNames, buildHistoryLinks } from './navUtils';
import { useOptionalSquad } from '@/contexts/SquadContext';
import { useMySquads } from '@/hooks/useMySquads';
import { SquadSwitcherLinks } from './SquadSwitcherLinks';

const tileClass = (active: boolean) =>
  classNames(
    'flex min-h-[52px] flex-col justify-center rounded-xl border px-4 py-3 transition-colors',
    active
      ? 'border-primary/40 bg-primary/10 text-white'
      : 'border-white/10 bg-white/[0.03] text-white/90 hover:border-primary/25 hover:bg-white/[0.06]'
  );

const mobileRowClass = 'block px-3 py-2.5 rounded-lg font-headline text-base text-white/90 transition-colors hover:bg-white/5';

interface MobileScoreboardMenuProps {
  players: Player[];
  playersLoading: boolean;
  liveGames: LiveGame[];
  onClose: () => void;
}

export function MobileScoreboardMenu({
  players,
  playersLoading,
  liveGames,
  onClose,
}: MobileScoreboardMenuProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const squad = useOptionalSquad();
  const { squads: mySquads } = useMySquads();
  const [encountersOpen, setEncountersOpen] = useState(false);

  return (
    <div className="px-3 pt-4 pb-8 space-y-3">
      {squad && (
        <>
          {/* Rankings tile */}
          <Link
            href={`/s/${squad.slug}`}
            className={classNames(tileClass(router.pathname === '/s/[squad]'), 'text-lg font-headline font-bold')}
            onClick={onClose}
            aria-current={router.pathname === '/s/[squad]' ? 'page' : undefined}
          >
            Rankings
          </Link>

          {/* History tiles */}
          <div className="grid grid-cols-2 gap-2">
            {buildHistoryLinks(squad.slug).map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={tileClass(router.asPath === link.href)}
                onClick={onClose}
                aria-current={router.asPath === link.href ? 'page' : undefined}
              >
                <span className="font-headline text-sm font-semibold leading-tight">{link.name}</span>
                <span className="text-[11px] text-on-surface-variant mt-1 leading-snug">{link.hint}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Encounters tile */}
      {squad && (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <button
            type="button"
            className={classNames(
              'flex w-full min-h-[52px] items-center justify-between px-4 py-3 transition-colors font-headline font-semibold text-base',
              encountersOpen
                ? 'bg-white/[0.06] text-white border-b border-white/10'
                : 'bg-white/[0.03] text-white/90 hover:bg-white/[0.06]'
            )}
            onClick={() => setEncountersOpen((v) => !v)}
            aria-expanded={encountersOpen}
          >
            <span>Encounters</span>
            <ChevronDownIcon
              className={classNames(
                'h-5 w-5 text-white/50 transition-transform duration-200',
                encountersOpen && 'rotate-180'
              )}
              aria-hidden
            />
          </button>
          {encountersOpen && (
            <div className="px-3 py-3 bg-white/[0.02]">
              <NavPlayerSearch
                players={players}
                isLoading={playersLoading}
                variant="mobile-encounters"
                onNavigate={() => {
                  setEncountersOpen(false);
                  onClose();
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Live games (only when multiple) */}
      {liveGames.length > 1 ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] p-3">
          <p className="font-label text-xs uppercase tracking-wider text-red-400 mb-2">
            Live games
          </p>
          <LiveGameProgressCards games={liveGames} onNavigate={onClose} />
        </div>
      ) : null}

      {/* Auth block */}
      {!session ? (
        <Link
          href="/login"
          className={tileClass(router.pathname === '/login')}
          onClick={onClose}
          aria-current={router.pathname === '/login' ? 'page' : undefined}
        >
          Sign In
        </Link>
      ) : (
        <div className="border-t border-white/10 pt-4 space-y-1">
          {/* Identity header */}
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            {session.user?.image ? (
              <Image
                src={session.user.image}
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-primary/30"
              />
            ) : (
              <UserCircleIcon className="h-9 w-9 shrink-0 text-white/60 ring-1 ring-primary/30 rounded-full" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-headline text-base font-semibold text-on-surface leading-tight">
                {session.user?.name ?? 'Account'}
              </p>
              <p className="truncate text-xs text-on-surface-variant leading-tight mt-0.5">
                {session.user?.email}
              </p>
            </div>
          </div>

          {/* Squad-scoped links */}
          {squad?.isPlayerHere && (
            <>
              <Link href={`/s/${squad.slug}/user/profile`} className={mobileRowClass} onClick={onClose}>
                <span className="flex items-center gap-3">
                  <UserCircleIcon className="h-5 w-5 text-on-surface-variant" aria-hidden />
                  Profile
                </span>
              </Link>
              <Link href={`/s/${squad.slug}/user/matches`} className={mobileRowClass} onClick={onClose}>
                <span className="flex items-center gap-3">
                  <PencilSquareIcon className="h-5 w-5 text-on-surface-variant" aria-hidden />
                  Matches
                </span>
              </Link>
              <Link href={`/s/${squad.slug}/user/replacement`} className={mobileRowClass} onClick={onClose}>
                <span className="flex items-center gap-3">
                  <ArrowsRightLeftIcon className="h-5 w-5 text-on-surface-variant" aria-hidden />
                  Replacement
                </span>
              </Link>
            </>
          )}
          {squad?.isSquadAdmin && (
            <Link href={`/s/${squad.slug}/admin/dashboard`} className={mobileRowClass} onClick={onClose}>
              <span className="flex items-center gap-3">
                <Squares2X2Icon className="h-5 w-5 text-on-surface-variant" aria-hidden />
                Admin Dashboard
              </span>
            </Link>
          )}

          {/* Squad switcher */}
          <div className="pt-1 border-t border-white/10">
            <SquadSwitcherLinks
              squads={mySquads}
              currentSlug={squad?.slug}
              variant="mobile"
              onNavigate={onClose}
            />
          </div>

          {/* Sign out */}
          <div className="pt-1 border-t border-white/10">
            <button
              type="button"
              onClick={() => {
                signOut();
                onClose();
              }}
              className="flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-lg font-headline text-base text-red-400 hover:bg-red-950/20"
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5 shrink-0" aria-hidden />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
