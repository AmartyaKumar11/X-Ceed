"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useInView, useScroll, useTransform, useMotionValueEvent } from "framer-motion";
import {
  ArrowRight,
  Briefcase,
  GraduationCap,
  Github,
  Mail,
  BookOpen,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DarkModeToggle from "@/components/DarkModeToggle";
import { BUILT_WITH } from "@/components/landing/logos";
import {
  MatchDashboardMock,
  ResumeAnalysisMock,
  MatchingMock,
  GapMock,
  CareerPlanMock,
  ShortlistMock,
  EduChainMock,
} from "@/components/landing/mocks";

const BENTO = [
  {
    title: "AI Resume Analysis",
    desc: "LangGraph extracts skills, levels, and evidence — not keyword soup.",
    Mock: ResumeAnalysisMock,
    span: "md:col-span-1",
  },
  {
    title: "Intelligent Matching",
    desc: "Jev scores fit; DeepSeek writes the evidence-backed explanation.",
    Mock: MatchingMock,
    span: "md:col-span-1",
  },
  {
    title: "Skill Gap Detection",
    desc: "Missing, weak, or under-evidenced — prioritized for action.",
    Mock: GapMock,
    span: "md:col-span-1",
  },
  {
    title: "Career Planning",
    desc: "Per-gap YouTube courses filtered by Jev, sequenced by DeepSeek.",
    Mock: CareerPlanMock,
    span: "md:col-span-1",
  },
  {
    title: "Recruiter Dashboard",
    desc: "GraphQL-fed shortlists with live AI Core match scores.",
    Mock: ShortlistMock,
    span: "md:col-span-1",
  },
  {
    title: "Blockchain Accountability",
    desc: "EduChain learning bets — stake milestones, verify on-chain.",
    Mock: EduChainMock,
    span: "md:col-span-1",
  },
];

const PIPELINE = [
  { id: "analyze", label: "Resume Analysis", model: "Jev + DeepSeek", detail: "Typed skill levels & evidence spans" },
  { id: "match", label: "Matching", model: "Jev score · DeepSeek explain", detail: "Calibrated fit with written rationale" },
  { id: "gap", label: "Gap Analysis", model: "Jev classify", detail: "missing / weak / under-evidenced" },
  { id: "career", label: "Career Planning", model: "YouTube + Jev + DeepSeek", detail: "Curated modules & study plan" },
];

function SectionReveal({ children, className = "" }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function PipelineSection() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.7", "end 0.35"],
  });
  const active = useTransform(scrollYProgress, [0, 0.25, 0.5, 0.75, 1], [0, 1, 2, 3, 3]);
  const [idx, setIdx] = useState(0);
  useMotionValueEvent(active, "change", (v) => setIdx(Math.round(v)));

  return (
    <section id="pipeline" ref={ref} className="relative border-t border-white/10 py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <SectionReveal>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-white/40">Infrastructure</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.03em] text-white md:text-4xl">
            Multi-agentic LangGraph pipeline
          </h2>
          <p className="mt-4 max-w-xl text-base text-white/50 leading-relaxed">
            System-1 decisions on Jev. System-2 narratives on DeepSeek. Scroll to walk the graph.
          </p>
        </SectionReveal>

        <div className="mt-14 relative">
          {/* connector */}
          <div className="absolute left-4 right-4 top-[22px] hidden h-px bg-white/10 md:block" />
          <div
            className="absolute left-4 top-[22px] hidden h-px bg-[#0070F3] transition-all duration-300 md:block"
            style={{ width: `calc(${(idx / Math.max(PIPELINE.length - 1, 1)) * 100}% - 2rem)` }}
          />

          <div className="grid gap-4 md:grid-cols-4">
            {PIPELINE.map((node, i) => {
              const on = i <= idx;
              return (
                <motion.div
                  key={node.id}
                  animate={{
                    opacity: on ? 1 : 0.35,
                    scale: i === idx ? 1.02 : 1,
                  }}
                  transition={{ duration: 0.25 }}
                  className={`relative rounded-md bg-[#0a0a0a] p-5 ${
                    on ? "shadow-[0_0_0_1px_#333,0_0_0_1px_#0070F3_inset]" : "shadow-[0_0_0_1px_#222]"
                  }`}
                >
                  <div
                    className={`mb-4 size-3 rounded-full ${on ? "bg-[#0070F3]" : "bg-white/20"}`}
                  />
                  <p className="text-sm font-semibold tracking-[-0.02em] text-white">{node.label}</p>
                  <p className="mt-1 text-xs text-[#0070F3]">{node.model}</p>
                  <p className="mt-2 text-xs text-white/45 leading-relaxed">{node.detail}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("applicant");
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const mockY = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const mockOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0.35]);

  const submitCta = (e) => {
    e.preventDefault();
    const q = email ? `?email=${encodeURIComponent(email)}&role=${role}` : "";
    router.push(`/auth${q}`);
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans antialiased">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-black/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <a href="#" className="flex items-center gap-2.5">
            <span className="vercel-gradient size-5 rounded-[4px]" aria-hidden />
            <span className="text-sm font-medium tracking-[-0.02em]">X-CEED</span>
          </a>
          <nav className="hidden items-center gap-7 text-sm font-medium text-white/50 md:flex">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#how" className="hover:text-white transition-colors">How it works</a>
            <a href="#pipeline" className="hover:text-white transition-colors">Pipeline</a>
            <a href="#roles" className="hover:text-white transition-colors">Roles</a>
          </nav>
          <div className="flex items-center gap-2">
            <DarkModeToggle />
            <Button
              size="sm"
              variant="ghost"
              className="text-white/70 hover:text-white hover:bg-white/5"
              onClick={() => router.push("/auth")}
            >
              Sign in
            </Button>
            <Button size="sm" className="bg-white text-black hover:bg-white/90" onClick={() => router.push("/auth")}>
              Get Started
            </Button>
          </div>
        </div>
      </header>

      {/* 1. HERO */}
      <section ref={heroRef} className="relative overflow-hidden pt-20 md:pt-28 pb-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,112,243,0.12),transparent_55%)]" />
        <div className="relative mx-auto max-w-7xl px-6 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mx-auto max-w-4xl text-4xl font-bold leading-[1.05] tracking-[-0.04em] md:text-6xl lg:text-[72px]"
          >
            AI-Powered Recruitment Intelligence
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08 }}
            className="mx-auto mt-6 max-w-2xl text-base text-white/55 leading-relaxed tracking-[-0.01em] md:text-lg"
          >
            Multi-agentic pipelines that analyze, match, and develop talent — not keyword filters.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.14 }}
            className="mt-9 flex flex-wrap items-center justify-center gap-3"
          >
            <Button
              size="lg"
              className="h-11 bg-white px-7 text-black hover:bg-white/90"
              onClick={() => router.push("/auth")}
            >
              Get Started
              <ArrowRight className="size-4" />
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="h-11 px-7 text-white/80 hover:bg-white/5 hover:text-white shadow-[0_0_0_1px_#333]"
              onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })}
            >
              See How It Works
            </Button>
          </motion.div>

          <motion.div style={{ y: mockY, opacity: mockOpacity }} className="mx-auto mt-16 max-w-5xl">
            <MatchDashboardMock className="animate-[fadeIn_0.8s_ease-out]" />
          </motion.div>
        </div>
      </section>

      {/* 2. SOCIAL PROOF */}
      <section className="border-y border-white/10 py-10">
        <div className="mx-auto max-w-7xl px-6">
          <p className="mb-6 text-center text-xs font-medium uppercase tracking-[0.16em] text-white/35">
            Built with
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-5 text-white">
            {BUILT_WITH.map(({ name, Logo }) => (
              <Logo key={name} className="h-5 w-auto opacity-45 hover:opacity-90 transition-opacity" />
            ))}
          </div>
        </div>
      </section>

      {/* 3. BENTO */}
      <section id="features" className="py-24 md:py-32">
        <div className="mx-auto max-w-7xl px-6">
          <SectionReveal>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-white/40">Product</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.03em] md:text-4xl">
              Everything in one intelligence layer
            </h2>
          </SectionReveal>

          <div className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BENTO.map((tile, i) => (
              <SectionReveal key={tile.title}>
                <motion.article
                  whileHover={{ y: -2 }}
                  transition={{ duration: 0.2 }}
                  className={`group flex h-full flex-col overflow-hidden rounded-md bg-[#0a0a0a] shadow-[0_0_0_1px_#222] hover:shadow-[0_0_0_1px_#333] ${tile.span}`}
                  style={{ transitionDelay: `${i * 40}ms` }}
                >
                  <div className="p-3 pb-0">
                    <tile.Mock />
                  </div>
                  <div className="mt-auto p-5 pt-4">
                    <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-white">
                      {tile.title}
                    </h3>
                    <p className="mt-1.5 text-sm text-white/45 leading-relaxed">{tile.desc}</p>
                  </div>
                </motion.article>
              </SectionReveal>
            ))}
          </div>
        </div>
      </section>

      {/* 4. HOW IT WORKS */}
      <section id="how" className="border-t border-white/10 py-24 md:py-32">
        <div className="mx-auto max-w-7xl px-6">
          <SectionReveal>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-white/40">Workflow</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] md:text-4xl">
              How it works
            </h2>
          </SectionReveal>

          <div className="relative mt-14 grid gap-8 md:grid-cols-3">
            <div className="pointer-events-none absolute left-[16%] right-[16%] top-5 hidden h-px bg-white/10 md:block" />
            {[
              {
                n: "01",
                title: "Upload resume",
                body: "AI extracts a structured profile — skills, levels, and evidence spans.",
              },
              {
                n: "02",
                title: "Match against jobs",
                body: "Jev scores calibrated fit. DeepSeek writes the explanation recruiters can trust.",
              },
              {
                n: "03",
                title: "Close the gaps",
                body: "Personalized courses, projects, and blockchain milestones to ship proof.",
              },
            ].map((step) => (
              <SectionReveal key={step.n}>
                <div className="relative">
                  <div className="mb-5 flex size-10 items-center justify-center rounded-full bg-[#0a0a0a] text-xs font-medium text-[#0070F3] shadow-[0_0_0_1px_#333]">
                    {step.n}
                  </div>
                  <h3 className="text-lg font-semibold tracking-[-0.02em]">{step.title}</h3>
                  <p className="mt-2 text-sm text-white/45 leading-relaxed">{step.body}</p>
                </div>
              </SectionReveal>
            ))}
          </div>
        </div>
      </section>

      {/* 5. PIPELINE */}
      <PipelineSection />

      {/* 6. ROLES SPLIT */}
      <section id="roles" className="border-t border-white/10 py-24 md:py-32">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-3 md:grid-cols-2">
            <SectionReveal>
              <div className="h-full rounded-md bg-[#0a0a0a] p-8 shadow-[0_0_0_1px_#222] md:p-10">
                <Briefcase className="size-5 text-white/40" />
                <h2 className="mt-4 text-2xl font-semibold tracking-[-0.025em]">For Recruiters</h2>
                <p className="mt-2 text-sm text-white/45">
                  Configurable weights, AI shortlists, and outreach that cite evidence.
                </p>
                <ul className="mt-8 space-y-3 text-sm text-white/70">
                  {[
                    "Weight skills, experience, education, projects, communication",
                    "AI Core shortlist with live match scores",
                    "Evidence-backed explanations — not black-box scores",
                    "GraphQL dashboard for applications & stats",
                  ].map((t) => (
                    <li key={t} className="flex gap-2">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[#0070F3]" />
                      {t}
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-8 bg-white text-black hover:bg-white/90"
                  onClick={() => router.push("/auth")}
                >
                  Hire with X-CEED
                </Button>
              </div>
            </SectionReveal>
            <SectionReveal>
              <div className="h-full rounded-md bg-[#0a0a0a] p-8 shadow-[0_0_0_1px_#222] md:p-10">
                <GraduationCap className="size-5 text-white/40" />
                <h2 className="mt-4 text-2xl font-semibold tracking-[-0.025em]">For Candidates</h2>
                <p className="mt-2 text-sm text-white/45">
                  Career plans, mock interviews, quizzes, and on-chain learning bets.
                </p>
                <ul className="mt-8 space-y-3 text-sm text-white/70">
                  {[
                    "Per-gap YouTube courses + study sequencing",
                    "Adaptive mock interviews with live feedback",
                    "Unique quizzes grounded in your video notes",
                    "EduChain milestones for real accountability",
                  ].map((t) => (
                    <li key={t} className="flex gap-2">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[#0070F3]" />
                      {t}
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-8 bg-white text-black hover:bg-white/90"
                  onClick={() => router.push("/auth")}
                >
                  Build your career
                </Button>
              </div>
            </SectionReveal>
          </div>
        </div>
      </section>

      {/* 7. CTA */}
      <section id="cta" className="border-t border-white/10 py-24 md:py-32">
        <div className="mx-auto max-w-xl px-6 text-center">
          <SectionReveal>
            <h2 className="text-3xl font-semibold tracking-[-0.035em] md:text-5xl">
              Start Building Better Careers
            </h2>
            <p className="mt-4 text-white/50">
              Create an account — pick your role and jump straight into the pipeline.
            </p>
            <form onSubmit={submitCta} className="mt-10 space-y-3 text-left">
              <Input
                type="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 border-0 bg-white/5 text-white placeholder:text-white/30 shadow-[0_0_0_1px_#333] focus-visible:ring-[#0070F3]"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="flex h-11 w-full rounded-md bg-white/5 px-3 text-sm text-white shadow-[0_0_0_1px_#333] outline-none focus-visible:ring-2 focus-visible:ring-[#0070F3]"
              >
                <option value="applicant" className="bg-black">Applicant / Candidate</option>
                <option value="recruiter" className="bg-black">Recruiter</option>
              </select>
              <Button type="submit" size="lg" className="h-11 w-full bg-white text-black hover:bg-white/90">
                Continue
                <ArrowRight className="size-4" />
              </Button>
            </form>
          </SectionReveal>
        </div>
      </section>

      {/* 8. FOOTER */}
      <footer className="border-t border-white/10 py-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="vercel-gradient size-4 rounded-[3px]" aria-hidden />
            <span className="text-sm font-medium tracking-[-0.02em]">X-CEED</span>
          </div>
          <div className="flex flex-wrap items-center gap-5 text-sm text-white/45">
            <a
              href="https://github.com/AmartyaKumar11/X-Ceed"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
            >
              <Github className="size-3.5" /> GitHub
            </a>
            <a href="/landing" className="inline-flex items-center gap-1.5 hover:text-white transition-colors">
              <BookOpen className="size-3.5" /> Docs
            </a>
            <a
              href="mailto:hello@x-ceed.dev"
              className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
            >
              <Mail className="size-3.5" /> Contact
            </a>
            <span className="inline-flex items-center gap-1.5 text-white/30">
              <Shield className="size-3.5" /> EduChain-ready
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
