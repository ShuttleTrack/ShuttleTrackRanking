import { Fragment, useId, useMemo, type ReactNode } from 'react';
import { useRouter } from 'next/router';
import { Listbox, Transition } from '@headlessui/react';
import { CheckIcon } from '@heroicons/react/24/outline';
import { ChevronDownIcon } from '@heroicons/react/24/solid';
import { useSession } from 'next-auth/react';
import { useMySquads } from '@/hooks/useMySquads';
import { useOptionalSquad } from '@/contexts/SquadContext';
import { classNames } from '@/components/nav/navUtils';

export const PUBLIC_BOARD_VALUE = 'public';

const squadLabelClass =
  'flex shrink-0 items-center px-2.5 sm:px-3 font-label text-[10px] font-bold uppercase tracking-widest text-on-surface bg-surface-container-high border-r border-gray-600';

const controlShellClass =
  'flex w-full items-stretch overflow-hidden rounded-lg border border-primary/50 bg-surface-container shadow-[inset_0_0_0_1px_rgb(238_138_51_/_0.35)] sm:inline-flex sm:w-auto';

const triggerClass =
  'relative flex min-h-[36px] min-w-0 flex-1 items-center justify-center rounded-r-lg bg-surface-container-highest py-1.5 pl-4 pr-9 text-center font-headline text-sm font-bold text-primary transition-colors hover:bg-surface-container-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset sm:min-w-[9.5rem] md:min-w-[18rem] md:justify-start md:text-left';

const optionRowClass = (active: boolean, selected: boolean) =>
  classNames(
    'relative flex cursor-pointer min-h-[44px] items-center justify-center gap-3 rounded-lg px-8 py-2 text-center transition-colors',
    selected
      ? 'bg-surface-container-highest text-primary'
      : active
        ? 'bg-surface-container-high text-on-surface'
        : 'text-on-surface hover:bg-surface-container-high'
  );

export function SelectorBand({
  children,
  scrim = false,
}: {
  children?: ReactNode;
  scrim?: boolean;
}) {
  return (
    <div className="relative border-y border-white/5 bg-black/30 mb-2 sm:mb-3">
      <div className="pointer-events-none absolute inset-0 form-strip" aria-hidden />
      {scrim && (
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(26,26,26,0.85),transparent_70%)]"
          aria-hidden
        />
      )}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-8 py-1.5 sm:py-2">{children}</div>
      <div className="h-px w-full kinetic-gradient" aria-hidden />
    </div>
  );
}

interface SquadBoardSelectorProps {
  currentSlug?: string | null;
}

export function SquadBoardSelector({ currentSlug }: SquadBoardSelectorProps) {
  const router = useRouter();
  const labelId = useId();
  const { data: session } = useSession();
  const { squads: mySquads } = useMySquads();
  const optionalSquad = useOptionalSquad();

  const hasSquads = session && mySquads.length > 0;
  const selectedValue = currentSlug ?? PUBLIC_BOARD_VALUE;

  const squadOptions = useMemo(() => {
    if (
      optionalSquad &&
      !mySquads.some((s) => s.slug === optionalSquad.slug)
    ) {
      return [
        { id: optionalSquad.id, name: optionalSquad.name, slug: optionalSquad.slug },
        ...mySquads,
      ];
    }
    return mySquads;
  }, [mySquads, optionalSquad]);

  const displayLabel = useMemo(() => {
    if (selectedValue === PUBLIC_BOARD_VALUE) return 'Public';
    const fromList = squadOptions.find((s) => s.slug === selectedValue);
    if (fromList) return fromList.name;
    if (optionalSquad?.slug === selectedValue) return optionalSquad.name;
    return selectedValue;
  }, [selectedValue, squadOptions, optionalSquad]);

  const handleChange = (value: string) => {
    if (value === selectedValue) return;
    if (value === PUBLIC_BOARD_VALUE) {
      void router.push('/');
      return;
    }
    void router.push(`/s/${value}`);
  };

  if (!hasSquads) {
    return null;
  }

  return (
    <SelectorBand>
      <div className="flex min-h-[36px] w-full items-center justify-center md:justify-start">
        <Listbox value={selectedValue} onChange={handleChange}>
          <div className="relative w-[90%] sm:w-auto">
            <div className={controlShellClass}>
              <span className={squadLabelClass} id={labelId}>Squad</span>
              <Listbox.Button
                className={triggerClass}
                aria-label="Select squad"
                aria-labelledby={labelId}
              >
                <span className="truncate font-bold">{displayLabel}</span>
                <ChevronDownIcon
                  className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary"
                  aria-hidden
                />
              </Listbox.Button>
            </div>
            <Transition
              as={Fragment}
              leave="transition ease-in duration-100"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <Listbox.Options
                className="absolute left-0 right-0 z-20 mt-1.5 max-h-72 w-full min-w-[12rem] overflow-auto rounded-xl border border-white/5 bg-surface-container p-1.5 shadow-xl focus:outline-none"
              >
                <Listbox.Option value={PUBLIC_BOARD_VALUE}>
                  {({ active, selected }) => (
                    <div className={optionRowClass(active, selected)}>
                      <span
                        className={classNames(
                          'min-w-0 font-headline text-sm truncate',
                          selected ? 'font-bold' : 'font-semibold'
                        )}
                      >
                        Public
                      </span>
                      {selected ? (
                        <CheckIcon
                          className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary"
                          aria-hidden
                        />
                      ) : null}
                    </div>
                  )}
                </Listbox.Option>
                {squadOptions.map((squad) => (
                  <Listbox.Option key={squad.id} value={squad.slug}>
                    {({ active, selected }) => (
                      <div className={optionRowClass(active, selected)}>
                        <span
                          className={classNames(
                            'min-w-0 font-headline text-sm truncate',
                            selected ? 'font-bold' : 'font-semibold'
                          )}
                        >
                          {squad.name}
                        </span>
                        {selected ? (
                          <CheckIcon
                            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary"
                            aria-hidden
                          />
                        ) : null}
                      </div>
                    )}
                  </Listbox.Option>
                ))}
              </Listbox.Options>
            </Transition>
          </div>
        </Listbox>
      </div>
    </SelectorBand>
  );
}
