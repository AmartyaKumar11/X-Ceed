"use client";
import React from "react";
import { Button } from "@/components/ui/button";
import { Briefcase, User, CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import DarkModeToggle from "@/components/DarkModeToggle";

export default function LandingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* Glass nav */}
      <header className="sticky top-0 z-50 glass">
        <div className="mx-auto max-w-7xl flex items-center justify-between h-14 px-6">
          <div className="flex items-center gap-3">
            <span
              className="vercel-gradient size-6 rounded-sm"
              aria-hidden
            />
            <span className="text-sm font-medium tracking-[-0.02em]">X-CEED</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#for-whom" className="hover:text-foreground transition-colors">Roles</a>
          </nav>
          <div className="flex items-center gap-3">
            <DarkModeToggle />
            <Button onClick={() => router.push("/auth")} size="sm">
              Sign In
            </Button>
          </div>
        </div>
      </header>

      {/* Hero — clean monochrome, one conic accent already on logo */}
      <section className="relative mx-auto max-w-7xl px-6 pt-24 pb-20 md:pt-32 md:pb-28">
        <h1 className="text-5xl md:text-[80px] font-bold leading-none tracking-[-0.04em] max-w-4xl">
          Hire and prepare
          <br />
          with intelligence.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed tracking-[-0.005em]">
          AI-driven resume analysis, job matching, and interview prep for applicants and recruiters.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button size="lg" onClick={() => router.push("/auth")} className="px-8">
            Get Started
          </Button>
          <Button size="lg" variant="outline" onClick={() => router.push("/auth")}>
            Sign In / Register
          </Button>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border/40">
        <div id="for-whom" className="mx-auto max-w-7xl grid grid-cols-1 md:grid-cols-2 gap-4 py-16 px-6">
          <div className="bg-card rounded-md p-6 vercel-elevated">
            <div className="flex items-center gap-2 mb-4">
              <Briefcase className="w-5 h-5 text-muted-foreground" />
              <h2 className="text-[22px] font-semibold tracking-[-0.015em]">For Recruiters</h2>
            </div>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 text-vercel-blue shrink-0" />
                AI-powered candidate shortlisting
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 text-vercel-blue shrink-0" />
                Instant resume–job fit analysis
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 text-vercel-blue shrink-0" />
                Smart interview scheduling
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 text-vercel-blue shrink-0" />
                Manage applicants with ease
              </li>
            </ul>
          </div>
          <div className="bg-card rounded-md p-6 vercel-elevated">
            <div className="flex items-center gap-2 mb-4">
              <User className="w-5 h-5 text-muted-foreground" />
              <h2 className="text-[22px] font-semibold tracking-[-0.015em]">For Applicants</h2>
            </div>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 text-vercel-blue shrink-0" />
                Personalized job recommendations
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 text-vercel-blue shrink-0" />
                AI resume feedback & improvement tips
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 text-vercel-blue shrink-0" />
                Interview preparation plans
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 text-vercel-blue shrink-0" />
                Track applications & progress
              </li>
            </ul>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/40 py-8 px-6">
        <div className="mx-auto max-w-7xl flex items-center justify-between text-xs text-muted-foreground">
          <span className="tracking-[-0.02em] font-medium text-foreground">X-CEED</span>
          <span>AI recruitment intelligence</span>
        </div>
      </footer>
    </div>
  );
}
