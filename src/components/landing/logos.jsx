"use client";

/** Monochrome brand marks for social-proof bar */

const wrap = "h-5 w-auto opacity-50 grayscale transition hover:opacity-90";

export function LogoLangGraph({ className = wrap }) {
  return (
    <svg className={className} viewBox="0 0 120 24" fill="currentColor" aria-label="LangGraph">
      <circle cx="10" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="28" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 12h6" stroke="currentColor" strokeWidth="1.5" />
      <text x="40" y="16" fontSize="12" fontFamily="system-ui,sans-serif" fontWeight="600">LangGraph</text>
    </svg>
  );
}

export function LogoDeepSeek({ className = wrap }) {
  return (
    <svg className={className} viewBox="0 0 110 24" fill="currentColor" aria-label="DeepSeek">
      <path d="M4 6h8l4 12H4L8 6z" opacity="0.9" />
      <path d="M14 6h6l-4 12h-6l4-12z" opacity="0.5" />
      <text x="28" y="16" fontSize="12" fontFamily="system-ui,sans-serif" fontWeight="600">DeepSeek</text>
    </svg>
  );
}

export function LogoEduChain({ className = wrap }) {
  return (
    <svg className={className} viewBox="0 0 110 24" fill="currentColor" aria-label="EduChain">
      <rect x="3" y="6" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13 11h6" stroke="currentColor" strokeWidth="1.5" />
      <rect x="19" y="6" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text x="36" y="16" fontSize="12" fontFamily="system-ui,sans-serif" fontWeight="600">EduChain</text>
    </svg>
  );
}

export function LogoTypeSafe({ className = wrap }) {
  return (
    <svg className={className} viewBox="0 0 130 24" fill="currentColor" aria-label="TypeSafe Jev">
      <path d="M4 18V6h3v4.5h5V6h3v12h-3v-4.5H7V18H4z" />
      <text x="22" y="16" fontSize="12" fontFamily="system-ui,sans-serif" fontWeight="600">TypeSafe Jev</text>
    </svg>
  );
}

export function LogoMongoDB({ className = wrap }) {
  return (
    <svg className={className} viewBox="0 0 110 24" fill="currentColor" aria-label="MongoDB">
      <path d="M12 2c0 8-4 10-4 18 2.5-1 4-5 4-5s1.5 4 4 5c0-8-4-10-4-18z" />
      <text x="24" y="16" fontSize="12" fontFamily="system-ui,sans-serif" fontWeight="600">MongoDB</text>
    </svg>
  );
}

export function LogoNextjs({ className = wrap }) {
  return (
    <svg className={className} viewBox="0 0 90 24" fill="currentColor" aria-label="Next.js">
      <circle cx="10" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M14.5 17.5V8.5l6 9" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <text x="26" y="16" fontSize="12" fontFamily="system-ui,sans-serif" fontWeight="600">Next.js</text>
    </svg>
  );
}

export const BUILT_WITH = [
  { name: "LangGraph", Logo: LogoLangGraph },
  { name: "DeepSeek", Logo: LogoDeepSeek },
  { name: "EduChain", Logo: LogoEduChain },
  { name: "TypeSafe Jev", Logo: LogoTypeSafe },
  { name: "MongoDB", Logo: LogoMongoDB },
  { name: "Next.js", Logo: LogoNextjs },
];
