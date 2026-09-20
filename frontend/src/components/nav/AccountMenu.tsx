import React, { Fragment } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, Transition } from '@headlessui/react';
import {
  ArrowRightOnRectangleIcon,
  PencilSquareIcon,
  Squares2X2Icon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import { signOut, useSession } from 'next-auth/react';
import { classNames, menuTransitionProps, scoreboardSegmentClass } from './navUtils';

const accountMenuPanelClass =
  'absolute top-full right-0 z-[60] mt-3 w-56 origin-top-right rounded-xl border border-white/5 bg-surface-container p-1.5 shadow-xl focus:outline-none';

const accountMenuRowClass = (active: boolean) =>
  classNames(
    'flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 font-headline text-sm text-on-surface transition-colors',
    active ? 'bg-white/10' : 'hover:bg-white/5'
  );

const accountMenuSignOutClass = (active: boolean) =>
  classNames(
    'flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 font-headline text-sm text-red-400 transition-colors',
    active ? 'bg-red-950/30' : 'hover:bg-red-950/20'
  );

export function AccountMenu() {
  const { data: session } = useSession();

  if (!session) {
    return (
      <Link href="/login" className={scoreboardSegmentClass(false)}>
        Sign In
      </Link>
    );
  }

  const showUserLinks = session.user.accessLevel?.includes('USER');
  const showAdmin = session.user.accessLevel?.includes('ADMIN');
  const showAccountLinks = showUserLinks || showAdmin;

  return (
    <Menu as="div" className="relative">
      <Menu.Button
        className="flex items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        aria-label="Account menu"
      >
        {session.user?.image ? (
          <Image
            src={session.user.image}
            alt=""
            width={40}
            height={40}
            className="w-9 h-9 md:w-10 md:h-10 rounded-full object-cover ring-2 ring-primary/40"
          />
        ) : (
          <UserCircleIcon className="h-9 w-9 md:h-10 md:w-10 text-white/80 ring-2 ring-primary/30 rounded-full" />
        )}
      </Menu.Button>
      <Transition as={Fragment} {...menuTransitionProps}>
        <Menu.Items className={accountMenuPanelClass}>
          {showUserLinks && (
            <>
              <Menu.Item>
                {({ active }) => (
                  <Link href="/user/profile" className={accountMenuRowClass(active)}>
                    <UserCircleIcon
                      className="h-5 w-5 shrink-0 text-on-surface-variant"
                      aria-hidden
                    />
                    Profile
                  </Link>
                )}
              </Menu.Item>
              <Menu.Item>
                {({ active }) => (
                  <Link href="/user/matches" className={accountMenuRowClass(active)}>
                    <PencilSquareIcon
                      className="h-5 w-5 shrink-0 text-on-surface-variant"
                      aria-hidden
                    />
                    Matches
                  </Link>
                )}
              </Menu.Item>
            </>
          )}
          {showAdmin && (
            <Menu.Item>
              {({ active }) => (
                <Link href="/admin/dashboard" className={accountMenuRowClass(active)}>
                  <Squares2X2Icon
                    className="h-5 w-5 shrink-0 text-on-surface-variant"
                    aria-hidden
                  />
                  Admin Dashboard
                </Link>
              )}
            </Menu.Item>
          )}
          {showAccountLinks && (
            <div className="my-1 border-t border-white/10" role="separator" />
          )}
          <Menu.Item>
            {({ active }) => (
              <button
                type="button"
                onClick={() => signOut()}
                className={accountMenuSignOutClass(active)}
              >
                <ArrowRightOnRectangleIcon className="h-5 w-5 shrink-0" aria-hidden />
                Sign Out
              </button>
            )}
          </Menu.Item>
        </Menu.Items>
      </Transition>
    </Menu>
  );
}
