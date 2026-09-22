'use client';

/**
 * Theme is locked to light across the product.
 * Kept as a presentational control so existing call sites don't break.
 */
export default function DarkModeToggle() {
  return (
    <div
      className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground"
      aria-label="Light mode"
      title="Light mode"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
        aria-hidden
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
    </div>
  );
}
