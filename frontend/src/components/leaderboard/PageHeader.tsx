interface PageHeaderProps {
  title: string;
  subtitle?: string;
  className?: string;
}

const PageHeader = ({ title, subtitle, className }: PageHeaderProps) => (
  <section
    className={`max-w-7xl mx-auto px-8 sm:px-16 mt-6 sm:mt-8 mb-4 sm:mb-6${className ? ` ${className}` : ''}`}
  >
    <div>
      <h1 className="font-headline text-2xl sm:text-3xl font-extrabold tracking-tight text-on-surface">
        {title}
      </h1>
      <div className="mt-3 h-0.5 w-10 rounded-full bg-primary" aria-hidden />
      {subtitle ? (
        <p className="text-on-surface-variant font-medium text-sm sm:text-base max-w-2xl mt-2">
          {subtitle}
        </p>
      ) : null}
    </div>
  </section>
);

export default PageHeader;
