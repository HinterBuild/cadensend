"use client";

export function BrandLogo({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="Cadensend"
      className={`${className} rounded-lg object-contain`}
      width={32}
      height={32}
    />
  );
}

export function BrandWordmark({
  titleClassName = 'font-display text-2xl tracking-tight text-stone-900',
}: {
  titleClassName?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandLogo />
      <span className={titleClassName}>Cadensend</span>
    </div>
  );
}
