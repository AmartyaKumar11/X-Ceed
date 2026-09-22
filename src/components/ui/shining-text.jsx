"use client";

import * as React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * @param {{ text: string, className?: string, as?: "h1" | "span" | "p" }} props
 */
export function ShiningText({ text, className, as = "span" }) {
  const MotionTag = as === "h1" ? motion.h1 : as === "p" ? motion.p : motion.span;

  return (
    <MotionTag
      className={cn(
        "inline-block bg-[linear-gradient(110deg,#404040,35%,#fff,50%,#404040,75%,#404040)] bg-[length:200%_100%] bg-clip-text text-base font-normal text-transparent dark:bg-[linear-gradient(110deg,#a3a3a3,35%,#fff,50%,#a3a3a3,75%,#a3a3a3)]",
        className
      )}
      initial={{ backgroundPosition: "200% 0" }}
      animate={{ backgroundPosition: "-200% 0" }}
      transition={{
        repeat: Infinity,
        duration: 2,
        ease: "linear",
      }}
    >
      {text}
    </MotionTag>
  );
}
