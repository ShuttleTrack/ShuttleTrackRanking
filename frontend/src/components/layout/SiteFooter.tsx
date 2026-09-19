import Link from 'next/link';

const SiteFooter = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="w-full py-6 px-4 md:py-12 md:px-8 bg-neutral-800/80 backdrop-blur-sm border-t border-white/5 mt-auto">
      <div className="flex flex-col md:flex-row justify-between items-center max-w-7xl mx-auto gap-3 md:gap-6">
        <div className="text-center md:text-left">
          <div className="hidden md:block text-lg font-black italic text-white mb-2 tracking-tight">
            Dutch Lankan Shuttle Masters
          </div>
          <p className="font-body text-xs md:text-sm tracking-wide text-on-surface-variant">
            © {year} Dutch Lankan Shuttle Masters. All rights reserved.
          </p>
        </div>
        <div className="flex flex-nowrap justify-center gap-4 md:gap-8">
          <Link
            href="/"
            className="font-body text-xs md:text-sm tracking-wide text-on-surface-variant hover:text-white transition-colors whitespace-nowrap"
          >
            Rankings
          </Link>
          <Link
            href="/encounter-history"
            className="font-body text-xs md:text-sm tracking-wide text-on-surface-variant hover:text-white transition-colors whitespace-nowrap"
          >
            Encounter History
          </Link>
          <Link
            href="/player-ranking-history"
            className="font-body text-xs md:text-sm tracking-wide text-on-surface-variant hover:text-white transition-colors whitespace-nowrap"
          >
            Ranking History
          </Link>
        </div>
      </div>
    </footer>
  );
};

export default SiteFooter;
