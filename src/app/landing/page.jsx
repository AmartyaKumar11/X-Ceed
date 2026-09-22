"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  motion,
  AnimatePresence,
  useScroll,
  useTransform,
  useMotionValueEvent,
} from "framer-motion";
import {
  ArrowRight,
  LayoutDashboard,
  Rocket,
  CheckCircle2,
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
import "./landing.css";

const EASE = [0.16, 1, 0.3, 1];

const ROTATING = [
  "Recruitment Intelligence",
  "Talent Matching",
  "Career Development",
  "Skill Analysis",
];

const BENTO = [
  {
    title: "AI Resume Analysis",
    desc: "LangGraph extracts skills, levels, and evidence — not keyword soup.",
    Mock: ResumeAnalysisMock,
  },
  {
    title: "Intelligent Matching",
    desc: "Jev scores fit; DeepSeek writes the evidence-backed explanation.",
    Mock: MatchingMock,
  },
  {
    title: "Skill Gap Detection",
    desc: "Missing, weak, or under-evidenced — prioritized for action.",
    Mock: GapMock,
  },
  {
    title: "Career Planning",
    desc: "Per-gap YouTube courses filtered by Jev, sequenced by DeepSeek.",
    Mock: CareerPlanMock,
  },
  {
    title: "Recruiter Dashboard",
    desc: "GraphQL-fed shortlists with live AI Core match scores.",
    Mock: ShortlistMock,
  },
  {
    title: "Blockchain Accountability",
    desc: "EduChain learning bets — stake milestones, verify on-chain.",
    Mock: EduChainMock,
  },
];

const PIPELINE = [
  { id: "analyze", label: "Resume Analysis", model: "Jev + DeepSeek", detail: "Typed skill levels & evidence spans" },
  { id: "match", label: "Matching", model: "Jev score · DeepSeek explain", detail: "Calibrated fit with written rationale" },
  { id: "gap", label: "Gap Analysis", model: "Jev classify", detail: "missing / weak / under-evidenced" },
  { id: "career", label: "Career Planning", model: "YouTube + Jev + DeepSeek", detail: "Curated modules & study plan" },
];

const HOW_STEPS = [
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
];

const bentoContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const bentoItem = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: EASE },
  },
};

function SectionReveal({ children, className = "" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.7, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function RotatingWords() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % ROTATING.length), 3000);
    return () => clearInterval(t);
  }, []);

  return (
    <span className="relative inline-grid justify-items-start text-left align-top">
      {/* reserve width for longest phrase */}
      <span className="invisible col-start-1 row-start-1 whitespace-nowrap" aria-hidden>
        Recruitment Intelligence
      </span>
      <AnimatePresence mode="wait">
        <motion.span
          key={ROTATING[i]}
          className="col-start-1 row-start-1 inline-block whitespace-nowrap text-white"
          initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -20, filter: "blur(8px)" }}
          transition={{ duration: 0.45, ease: EASE }}
        >
          {ROTATING[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function BentoCard({ tile }) {
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState(false);

  return (
    <motion.article
      variants={bentoItem}
      className="bento-card group relative flex h-full flex-col overflow-hidden rounded-md bg-[#0a0a0a]"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-300"
        style={{
          opacity: hover ? 1 : 0,
          background: `radial-gradient(600px circle at ${mouse.x}px ${mouse.y}px, rgba(0, 112, 243, 0.06), transparent 40%)`,
        }}
      />
      <div className="relative z-0 p-3 pb-0">
        <tile.Mock />
      </div>
      <div className="relative z-0 mt-auto p-5 pt-4">
        <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-white">{tile.title}</h3>
        <p className="mt-1.5 text-sm text-white/45 leading-relaxed">{tile.desc}</p>
      </div>
    </motion.article>
  );
}

function LogoMarquee() {
  const logos = [...BUILT_WITH, ...BUILT_WITH];
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-black to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-black to-transparent" />
      <div className="logo-marquee-track py-1 text-white">
        {logos.map(({ name, Logo }, i) => (
          <Logo
            key={`${name}-${i}`}
            className="h-5 w-auto shrink-0 opacity-50 transition-opacity hover:opacity-100"
          />
        ))}
      </div>
    </div>
  );
}

function PipelineSection() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const active = useTransform(scrollYProgress, [0.2, 0.4, 0.6, 0.8], [0, 1, 2, 3]);
  const lineProgress = useTransform(scrollYProgress, [0.2, 0.8], [0, 1]);
  const [idx, setIdx] = useState(0);
  const [lineW, setLineW] = useState(0);
  useMotionValueEvent(active, "change", (v) => setIdx(Math.round(v)));
  useMotionValueEvent(lineProgress, "change", (v) => setLineW(v));

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

        <div className="relative mt-14">
          <div className="absolute left-4 right-4 top-[22px] hidden h-px bg-white/10 md:block" />
          <div
            className="absolute left-4 top-[22px] hidden h-px origin-left bg-[#0070F3] transition-[width] duration-150 md:block"
            style={{
              width: `calc((100% - 2rem) * ${lineW})`,
              boxShadow: "0 0 12px rgba(0,112,243,0.45)",
            }}
          />

          <div className="grid gap-4 md:grid-cols-4">
            {PIPELINE.map((node, i) => {
              const isActive = i === idx;
              const passed = i <= idx;
              return (
                <motion.div
                  key={node.id}
                  animate={{
                    opacity: passed ? 1 : 0.4,
                    scale: isActive ? 1.02 : 1,
                  }}
                  transition={{ duration: 0.35, ease: EASE }}
                  className={`relative rounded-md bg-[#0a0a0a] p-5 ${
                    isActive
                      ? "shadow-[0_0_0_1px_rgba(0,112,243,0.7),0_0_24px_2px_rgba(0,112,243,0.15)]"
                      : "shadow-[0_0_0_1px_#222]"
                  }`}
                >
                  <div
                    className={`mb-4 size-3 rounded-full transition-colors ${
                      passed ? "bg-[#0070F3]" : "bg-white/20"
                    }`}
                  />
                  <p className="text-sm font-semibold tracking-[-0.02em] text-white">{node.label}</p>
                  <p className="mt-1 text-xs text-[#0070F3]">{node.model}</p>
                  <AnimatePresence mode="wait">
                    {isActive && (
                      <motion.p
                        key={node.detail}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3, ease: EASE }}
                        className="mt-2 overflow-hidden text-xs text-white/45 leading-relaxed"
                      >
                        {node.detail}
                      </motion.p>
                    )}
                  </AnimatePresence>
                  {!isActive && (
                    <p className="mt-2 text-xs text-white/35 leading-relaxed">{node.detail}</p>
                  )}
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
  const [isScrolled, setIsScrolled] = useState(false);
  const [navVisible, setNavVisible] = useState(true);
  const lastScrollY = useRef(0);
  const heroRef = useRef(null);

  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const mockY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const mockOpacity = useTransform(scrollYProgress, [0, 0.85], [1, 0.4]);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setIsScrolled(y > 50);
      setNavVisible(y < lastScrollY.current || y < 50);
      lastScrollY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const submitCta = (e) => {
    e.preventDefault();
    const q = email ? `?email=${encodeURIComponent(email)}&role=${role}` : "";
    router.push(`/auth${q}`);
  };

  return (
    <div className="page-grain min-h-screen bg-black text-white font-sans antialiased">
      {/* Nav — hide on scroll down, glass after hero */}
      <motion.header
        animate={{ y: navVisible ? 0 : -80 }}
        transition={{ duration: 0.3, ease: EASE }}
        className={`fixed top-0 z-50 w-full transition-colors duration-300 ${
          isScrolled
            ? "border-b border-white/5 bg-black/70 backdrop-blur-xl"
            : "border-b border-transparent bg-transparent"
        }`}
      >
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
      </motion.header>

      {/* 1. HERO */}
      <section ref={heroRef} className="relative overflow-hidden pt-28 md:pt-32 pb-8">
        <div className="hero-bg pointer-events-none absolute inset-0 opacity-80" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,112,243,0.14),transparent_55%)]" />
        <div className="relative mx-auto max-w-7xl px-6 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="mx-auto max-w-4xl text-4xl font-bold leading-[1.05] tracking-[-0.04em] md:text-6xl lg:text-[72px]"
          >
            <span className="block sm:inline">AI-Powered{" "}</span>
            <RotatingWords />
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08, ease: EASE }}
            className="mx-auto mt-6 max-w-2xl text-base text-white/55 leading-relaxed tracking-[-0.01em] md:text-lg"
          >
            Multi-agentic pipelines that analyze, match, and develop talent — not keyword filters.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.14, ease: EASE }}
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
            <div className="hero-screenshot overflow-hidden rounded-md">
              <MatchDashboardMock className="!shadow-none" />
            </div>
          </motion.div>
        </div>
      </section>

      {/* 2. SOCIAL PROOF — marquee */}
      <section className="border-y border-white/10 py-10">
        <div className="mx-auto max-w-7xl px-6">
          <SectionReveal>
            <p className="mb-6 text-center text-xs font-medium uppercase tracking-[0.16em] text-white/35">
              Built with
            </p>
            <LogoMarquee />
          </SectionReveal>
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

          <motion.div
            className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
            variants={bentoContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
          >
            {BENTO.map((tile) => (
              <BentoCard key={tile.title} tile={tile} />
            ))}
          </motion.div>
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

          <div className="relative mt-14">
            {/* draw line */}
            <svg
              className="pointer-events-none absolute left-[16%] right-[16%] top-5 hidden h-0.5 w-[68%] md:block"
              viewBox="0 0 100 2"
              preserveAspectRatio="none"
              aria-hidden
            >
              <motion.line
                x1="0"
                y1="1"
                x2="100"
                y2="1"
                stroke="rgba(0, 112, 243, 0.35)"
                strokeWidth="2"
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 1.2, ease: "easeInOut" }}
              />
            </svg>

            <div className="grid gap-8 md:grid-cols-3">
              {HOW_STEPS.map((step, i) => (
                <SectionReveal key={step.n}>
                  <div className="relative">
                    <div
                      className="step-icon mb-5 flex size-10 items-center justify-center rounded-full bg-[#0a0a0a] text-xs font-medium text-[#0070F3]"
                      style={{ animationDelay: `${i * 0.4}s` }}
                    >
                      {step.n}
                    </div>
                    <h3 className="text-lg font-semibold tracking-[-0.02em]">{step.title}</h3>
                    <p className="mt-2 text-sm text-white/45 leading-relaxed">{step.body}</p>
                  </div>
                </SectionReveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 5. PIPELINE */}
      <PipelineSection />

      {/* 6. ROLES — blue command center vs violet launchpad */}
      <section id="roles" className="border-t border-white/10 py-24 md:py-32">
        <div className="mx-auto max-w-7xl px-6">
          <div className="relative flex flex-col gap-4 md:flex-row md:gap-0">
            <motion.div
              className="role-card role-card--recruiter group relative flex-1 overflow-hidden rounded-md p-8 md:p-10"
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.7, ease: EASE }}
            >
              <div
                className="pointer-events-none absolute -left-10 -top-10 size-64 rounded-full"
                style={{
                  background: "radial-gradient(circle, rgba(0,112,243,0.22) 0%, transparent 68%)",
                }}
                aria-hidden
              />
              <div className="relative flex h-full flex-col">
                <div className="role-icon--blue flex size-14 items-center justify-center rounded-lg">
                  <LayoutDashboard className="size-10" strokeWidth={1.5} />
                </div>
                <h2 className="mt-6 text-2xl font-semibold tracking-[-0.03em] text-white">
                  For Recruiters
                </h2>
                <p className="mt-2 text-sm text-white/45">
                  Configurable weights, AI shortlists, and outreach that cite evidence.
                </p>
                <ul className="mt-8 flex flex-col gap-3 text-sm text-white/70">
                  {[
                    "Weight skills, experience, education, projects, communication",
                    "AI Core shortlist with live match scores",
                    "Evidence-backed explanations — not black-box scores",
                    "GraphQL dashboard for applications & stats",
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#60A5FA]" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="mt-8 inline-flex h-11 items-center justify-center gap-2 self-start rounded-md border border-white/10 bg-white/10 px-5 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/20 md:mt-auto"
                  onClick={() => router.push("/auth")}
                >
                  Hire with X-CEED
                  <ArrowRight className="size-4" />
                </button>
              </div>
            </motion.div>

            {/* vertical / horizontal divider */}
            <div
              className="relative hidden w-8 shrink-0 self-stretch md:block"
              aria-hidden
            >
              <div className="absolute inset-y-10 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-white/15 to-transparent" />
            </div>
            <div
              className="mx-2 h-px w-auto bg-gradient-to-r from-transparent via-white/15 to-transparent md:hidden"
              aria-hidden
            />

            <motion.div
              className="role-card role-card--candidate group relative flex-1 overflow-hidden rounded-md p-8 md:p-10"
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.7, ease: EASE }}
            >
              <div
                className="pointer-events-none absolute -left-10 -top-10 size-64 rounded-full"
                style={{
                  background: "radial-gradient(circle, rgba(121,40,202,0.22) 0%, transparent 68%)",
                }}
                aria-hidden
              />
              <div className="relative flex h-full flex-col">
                <div className="role-icon--violet flex size-14 items-center justify-center rounded-lg">
                  <Rocket className="size-10" strokeWidth={1.5} />
                </div>
                <h2 className="mt-6 text-2xl font-semibold tracking-[-0.03em] text-white">
                  For Candidates
                </h2>
                <p className="mt-2 text-sm text-white/45">
                  Career plans, mock interviews, quizzes, and on-chain learning bets.
                </p>
                <ul className="mt-8 flex flex-col gap-3 text-sm text-white/70">
                  {[
                    "Per-gap YouTube courses + study sequencing",
                    "Adaptive mock interviews with live feedback",
                    "Unique quizzes grounded in your video notes",
                    "EduChain milestones for real accountability",
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#A78BFA]" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="mt-8 inline-flex h-11 items-center justify-center gap-2 self-start rounded-md border border-white/10 bg-white/10 px-5 text-sm font-medium text-white backdrop-blur transition-colors hover:border-[rgba(121,40,202,0.35)] hover:bg-[rgba(121,40,202,0.2)] md:mt-auto"
                  onClick={() => router.push("/auth")}
                >
                  Build your career
                  <ArrowRight className="size-4" />
                </button>
              </div>
            </motion.div>
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
              <button type="submit" className="gradient-border-btn">
                Continue
                <ArrowRight className="size-4" />
              </button>
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
