import { format } from 'date-fns';

export const DashboardHeader = () => {
  const currentTime = new Date();

  return (
    <section className="mb-6 sm:mb-8">
      <h1 className="font-headline text-3xl sm:text-4xl font-extrabold tracking-tight text-on-surface">
        Admin Dashboard
      </h1>
      <div className="mt-3 h-0.5 w-10 rounded-full bg-primary" aria-hidden />
      <p className="text-on-surface-variant font-medium text-sm sm:text-base mt-2">
        {format(currentTime, 'EEEE, MMMM d, yyyy')}
      </p>
    </section>
  );
};
