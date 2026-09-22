"use client";

/** High-fidelity product UI mocks — stand in for screenshots */

export function MatchDashboardMock({ className = "" }) {
  return (
    <div className={`overflow-hidden rounded-md bg-card text-left text-[11px] leading-snug shadow-[0_0_0_1px_var(--border),0_24px_80px_rgba(0,0,0,0.08)] ${className}`}>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="size-2 rounded-full bg-foreground/20" />
        <span className="size-2 rounded-full bg-foreground/20" />
        <span className="size-2 rounded-full bg-foreground/20" />
        <span className="ml-2 text-muted-foreground">Match results · Senior Frontend Engineer</span>
      </div>
      <div className="grid grid-cols-[1fr_200px] gap-0">
        <div className="space-y-3 p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-muted-foreground">Overall fit</p>
              <p className="text-3xl font-semibold tracking-[-0.04em] text-foreground">61.6</p>
            </div>
            <div className="relative size-16">
              <svg viewBox="0 0 36 36" className="size-16 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" className="text-border" stroke="currentColor" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15.5" fill="none" stroke="#0070F3" strokeWidth="3"
                  strokeDasharray="61.6 100" strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-[#0070F3]">
                match
              </span>
            </div>
          </div>
          <p className="text-muted-foreground line-clamp-3">
            Strong React/TypeScript production evidence. Communication 0.8. Gaps: Next.js depth, Docker, Git seniority.
          </p>
          <div className="space-y-1.5">
            {[
              ["React", 92],
              ["TypeScript", 88],
              ["GraphQL", 74],
              ["Next.js", 46],
            ].map(([label, v]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="w-16 text-muted-foreground">{label}</span>
                <div className="h-1.5 flex-1 rounded-full bg-muted">
                  <div className="h-full rounded-full bg-[#0070F3]" style={{ width: `${v}%` }} />
                </div>
                <span className="w-6 text-right text-muted-foreground">{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="border-l border-border bg-foreground/[0.02] p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-foreground/35">Gaps</p>
          {[
            ["Next.js", "weak"],
            ["MongoDB", "weak"],
            ["Node.js", "weak"],
          ].map(([name, cls]) => (
            <div key={name} className="rounded border border-border bg-background/40 px-2 py-1.5">
              <div className="flex items-center justify-between">
                <span className="text-foreground/80">{name}</span>
                <span className="rounded px-1.5 py-0.5 text-[9px] text-[#A1A1A1] bg-card">{cls}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ResumeAnalysisMock() {
  return (
    <div className="h-full min-h-[140px] rounded bg-card0 p-3 text-[10px] shadow-[inset_0_0_0_1px_var(--border)]">
      <p className="mb-2 text-muted-foreground uppercase tracking-wider">Parsed profile</p>
      <div className="space-y-1.5">
        {["React · advanced", "TypeScript · advanced", "Next.js · intermediate", "LangGraph · intermediate"].map((s) => (
          <div key={s} className="flex items-center gap-2 rounded bg-muted px-2 py-1 text-foreground/75">
            <span className="size-1.5 rounded-full bg-[#0070F3]" />
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MatchingMock() {
  return (
    <div className="h-full min-h-[140px] rounded bg-card0 p-3 text-[10px] shadow-[inset_0_0_0_1px_var(--border)]">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-[-0.04em] text-foreground">61.6</span>
        <span className="text-muted-foreground">/ 100</span>
      </div>
      <p className="text-muted-foreground">
        Evidence: React dashboards serving 10k+ users · GraphQL LCP −35%
      </p>
      <div className="mt-3 flex gap-1">
        {["skills", "comms", "projects"].map((t) => (
          <span key={t} className="rounded bg-[#0070F3]/15 px-1.5 py-0.5 text-[#0070F3]">{t}</span>
        ))}
      </div>
    </div>
  );
}

export function GapMock() {
  return (
    <div className="h-full min-h-[140px] space-y-1.5 rounded bg-card0 p-3 text-[10px] shadow-[inset_0_0_0_1px_var(--border)]">
      {[
        ["Next.js", "weak", "fit 0.46"],
        ["Docker", "missing", "fit 0.12"],
        ["Portfolio SSR", "under-evidenced", "fit 0.38"],
      ].map(([req, cls, fit]) => (
        <div key={req} className="flex items-center justify-between rounded border border-border px-2 py-1.5">
          <span className="text-foreground/80">{req}</span>
          <div className="flex items-center gap-2">
            <span className="text-foreground/35">{fit}</span>
            <span className={`rounded px-1.5 py-0.5 ${
              cls === "missing" ? "bg-red-500/15 text-red-400" :
              cls === "weak" ? "bg-muted text-foreground/60" :
              "bg-[#0070F3]/15 text-[#0070F3]"
            }`}>{cls}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CareerPlanMock() {
  return (
    <div className="h-full min-h-[140px] rounded bg-card0 p-3 text-[10px] shadow-[inset_0_0_0_1px_var(--border)]">
      <p className="mb-2 text-muted-foreground">Next.js · weak · 2 videos</p>
      <div className="space-y-1.5">
        <div className="flex gap-2 rounded border border-border p-1.5">
          <div className="size-8 shrink-0 rounded bg-red-600/80" />
          <div>
            <p className="text-foreground/85 line-clamp-1">Next.js 13 App Router + TypeScript</p>
            <p className="text-foreground/35">Programming with Mosh</p>
          </div>
        </div>
        <div className="flex gap-2 rounded border border-border p-1.5">
          <div className="size-8 shrink-0 rounded bg-red-600/60" />
          <div>
            <p className="text-foreground/85 line-clamp-1">Next.js 15 Crash Course</p>
            <p className="text-foreground/35">Dipesh Malvia</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ShortlistMock() {
  return (
    <div className="h-full min-h-[140px] rounded bg-card0 p-3 text-[10px] shadow-[inset_0_0_0_1px_var(--border)]">
      <p className="mb-2 text-muted-foreground">GraphQL · shortlist</p>
      {[
        ["A. Kumar", 86],
        ["S. Patel", 79],
        ["J. Reyes", 71],
      ].map(([name, score]) => (
        <div key={name} className="mb-1.5 flex items-center justify-between rounded bg-muted px-2 py-1.5">
          <span className="text-foreground/80">{name}</span>
          <span className="font-medium text-[#0070F3]">{score}%</span>
        </div>
      ))}
    </div>
  );
}

export function EduChainMock() {
  return (
    <div className="h-full min-h-[140px] rounded bg-card0 p-3 text-[10px] shadow-[inset_0_0_0_1px_var(--border)]">
      <p className="mb-2 text-muted-foreground">EduChain · learning bet</p>
      <div className="rounded border border-border p-2">
        <p className="text-foreground/85">Milestone: Next.js SSR project</p>
        <p className="mt-1 text-muted-foreground">Stake 0.05 EDU · verify on-chain</p>
        <div className="mt-2 h-1.5 rounded-full bg-muted">
          <div className="h-full w-2/3 rounded-full bg-[#0070F3]" />
        </div>
        <p className="mt-1 text-foreground/35">2 / 3 milestones verified</p>
      </div>
    </div>
  );
}
