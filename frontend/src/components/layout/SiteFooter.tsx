const SiteFooter = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto w-full border-t border-white/5 bg-neutral-800/80 px-4 py-6 backdrop-blur-sm md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl text-center md:text-left">
        <div className="mb-2 hidden text-lg font-black italic tracking-tight text-white md:block">
          Dutch Lankan Shuttle Masters
        </div>
        <p className="font-body text-xs tracking-wide text-on-surface-variant md:text-sm">
          © {year} Dutch Lankan Shuttle Masters. All rights reserved.
        </p>
      </div>
    </footer>
  );
};

export default SiteFooter;
