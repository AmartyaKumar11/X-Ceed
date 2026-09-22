"use client";

/**
 * Official brand marks via Simple Icons CDN.
 * Color tokens stay muted; dark mode uses invert for dark-on-transparent icons.
 */
const ICON = (slug, color = "6b7280") =>
  `https://cdn.simpleicons.org/${slug}/${color}`;

export const BUILT_WITH = [
  { name: "Next.js", slug: "nextdotjs" },
  { name: "React", slug: "react" },
  { name: "TypeScript", slug: "typescript" },
  { name: "Python", slug: "python" },
  { name: "FastAPI", slug: "fastapi" },
  { name: "LangGraph", slug: "langchain" },
  { name: "DeepSeek", slug: "deepseek" },
  { name: "TypeSafe Jev", slug: null },
  { name: "MongoDB", slug: "mongodb" },
  { name: "GraphQL", slug: "graphql" },
  { name: "Apollo", slug: "apollographql" },
  { name: "Vercel", slug: "vercel" },
  { name: "Railway", slug: "railway" },
  { name: "Docker", slug: "docker" },
  { name: "YouTube", slug: "youtube" },
];

/** Fallback text mark when CDN slug is missing / 404s */
function TextMark({ name }) {
  return (
    <span className="text-sm font-semibold tracking-tight text-muted-foreground">
      {name}
    </span>
  );
}

export function TechLogo({ name, slug, className = "" }) {
  if (!slug) return <TextMark name={name} />;
  return (
    <span
      className={`inline-flex items-center gap-2.5 shrink-0 opacity-55 transition-opacity hover:opacity-100 ${className}`}
      title={name}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={ICON(slug)}
        alt=""
        width={22}
        height={22}
        className="h-[22px] w-[22px] object-contain dark:invert"
        loading="lazy"
        decoding="async"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
      <span className="text-sm font-medium tracking-tight text-foreground/70 whitespace-nowrap">
        {name}
      </span>
    </span>
  );
}
