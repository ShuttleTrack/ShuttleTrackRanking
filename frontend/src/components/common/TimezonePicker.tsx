import React, { Fragment, useMemo, useState } from 'react';
import { Combobox, Transition } from '@headlessui/react';
import { CheckIcon, ChevronUpDownIcon, GlobeEuropeAfricaIcon } from '@heroicons/react/24/outline';
import {
  COMMON_TIMEZONES,
  allTimezones,
  searchTimezones,
  toTimezoneOption,
  type TimezoneOption,
} from '@/lib/timezones';

interface TimezonePickerProps {
  value: string;
  onChange: (zone: string) => void;
  label: string;
}

const optionClass = ({ active, selected }: { active: boolean; selected: boolean }) =>
  `relative flex cursor-pointer min-h-[44px] items-center gap-3 px-3 py-2 ${
    selected ? 'bg-primary/10 text-on-surface' : active ? 'bg-surface-container-high text-on-surface' : 'text-on-surface-variant'
  }`;

function OptionRow({ option, selected }: { option: TimezoneOption; selected: boolean }) {
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-headline text-sm font-semibold">{option.city}</span>
        {option.region ? <span className="block truncate text-xs text-on-surface-variant">{option.region}</span> : null}
      </span>
      <span className="shrink-0 font-numeric text-xs tabular-nums text-on-surface-variant">{option.offset}</span>
      {selected ? <CheckIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden /> : <span className="w-4 shrink-0" aria-hidden />}
    </>
  );
}

// Searchable IANA timezone picker - the browser knows ~400 zones, far too many for a <select>.
// Before typing it offers a short list of common zones (plus the current one); typing searches
// every zone by city, region or UTC offset ("amsterdam", "europe", "+05:30"). Same Combobox shape
// and tokens as SearchablePlayerPicker. Only ever emits a real zone id - free text is never saved.
export function TimezonePicker({ value, onChange, label }: TimezonePickerProps) {
  const [query, setQuery] = useState('');
  // Offsets are computed once per mount, for "now", so they show today's DST state.
  const options = useMemo(() => {
    const now = new Date();
    const zones = allTimezones();
    return (zones.includes(value) ? zones : [value, ...zones]).map((zone) => toTimezoneOption(zone, now));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const byZone = useMemo(() => new Map(options.map((o) => [o.zone, o])), [options]);

  const selected = byZone.get(value) ?? toTimezoneOption(value, new Date());
  const common = useMemo(() => {
    const zones = COMMON_TIMEZONES.includes(value) ? COMMON_TIMEZONES : [value, ...COMMON_TIMEZONES];
    return zones.map((z) => byZone.get(z)).filter((o): o is TimezoneOption => o !== undefined);
  }, [byZone, value]);
  const results = useMemo(() => (query.trim() ? searchTimezones(query, options) : common), [query, options, common]);

  return (
    <Combobox
      value={selected}
      by="zone"
      onChange={(option: TimezoneOption) => {
        onChange(option.zone);
        setQuery('');
      }}
    >
      <div className="relative">
        <div className="flex w-full min-h-[44px] items-center gap-2 rounded-xl border border-gray-600 bg-surface-container px-3 py-2.5 transition-colors hover:border-primary/40 focus-within:ring-1 focus-within:ring-primary/40 focus-within:border-primary">
          <GlobeEuropeAfricaIcon className="h-5 w-5 shrink-0 text-on-surface-variant" aria-hidden />
          <Combobox.Input
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-0"
            displayValue={(option: TimezoneOption) => option.zone.replace(/_/g, ' ')}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={(event) => event.target.select()}
            placeholder="Search city, region or UTC offset…"
            aria-label={label}
          />
          <span className="shrink-0 font-numeric text-xs tabular-nums text-on-surface-variant">{selected.offset}</span>
          <Combobox.Button className="flex shrink-0 items-center" aria-label={`Open ${label} options`}>
            <ChevronUpDownIcon className="h-5 w-5 text-on-surface-variant" aria-hidden />
          </Combobox.Button>
        </div>
        <Transition as={Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0" afterLeave={() => setQuery('')}>
          <Combobox.Options className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-white/5 bg-surface-container py-1 shadow-lg focus:outline-none">
            {!query.trim() ? (
              <p className="px-3 pb-1 pt-2 font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">
                Common · type to search all {options.length} zones
              </p>
            ) : null}
            {results.map((option) => (
              <Combobox.Option key={option.zone} value={option} className={optionClass}>
                {({ selected: isSelected }) => <OptionRow option={option} selected={isSelected} />}
              </Combobox.Option>
            ))}
            {results.length === 0 ? (
              <p className="px-3 py-2 text-sm text-on-surface-variant">No timezone matches &ldquo;{query}&rdquo;.</p>
            ) : null}
          </Combobox.Options>
        </Transition>
      </div>
    </Combobox>
  );
}
