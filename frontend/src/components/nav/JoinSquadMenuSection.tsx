import Link from 'next/link';
import { Menu } from '@headlessui/react';
import { UserPlusIcon } from '@heroicons/react/24/outline';
import { classNames } from './navUtils';

interface JoinSquadMenuSectionProps {
  variant: 'account-menu' | 'mobile';
  onNavigate?: () => void;
}

export function JoinSquadMenuSection({ variant, onNavigate }: JoinSquadMenuSectionProps) {
  const isDesktop = variant === 'account-menu';

  if (isDesktop) {
    return (
      <>
        <div className="my-1 border-t border-white/10" role="separator" />
        <Menu.Item>
          {({ active }) => (
            <Link
              href="/squads/browse"
              className={classNames(
                'flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 font-headline text-sm text-on-surface transition-colors',
                active ? 'bg-white/10' : 'hover:bg-white/5'
              )}
              onClick={onNavigate}
            >
              <UserPlusIcon className="h-5 w-5 shrink-0 text-on-surface-variant" aria-hidden />
              Join a squad
            </Link>
          )}
        </Menu.Item>
      </>
    );
  }

  return (
    <div className="pt-1 border-t border-white/10">
      <Link
        href="/squads/browse"
        className="flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 font-headline text-base text-white/90 transition-colors hover:bg-white/5"
        onClick={onNavigate}
      >
        <UserPlusIcon className="h-5 w-5 shrink-0 text-on-surface-variant" aria-hidden />
        Join a squad
      </Link>
    </div>
  );
}
