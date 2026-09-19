type StatTone = 'default' | 'win' | 'loss';

interface StatCardProps {
  label: string;
  value: string | number;
  tone?: StatTone;
}

const valueToneClass: Record<StatTone, string> = {
  default: 'text-on-surface',
  win: 'text-primary',
  loss: 'text-red-400',
};

const StatCard = ({ label, value, tone = 'default' }: StatCardProps) => (
  <div className="rounded-xl bg-surface-container/90 border border-gray-600 px-3 py-3 sm:px-4 sm:py-4">
    <p className="font-label text-[10px] sm:text-xs font-bold uppercase tracking-widest text-on-surface-variant opacity-60">
      {label}
    </p>
    <p className={`font-numeric tabular-nums text-lg sm:text-3xl mt-1 ${valueToneClass[tone]}`}>
      {value}
    </p>
  </div>
);

export default StatCard;
