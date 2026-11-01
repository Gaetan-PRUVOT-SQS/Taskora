// Système de marque Taskora : mark / wordmark / lockup (+ mono)
import mark from "../assets/brand/mark.png";
import wordmark from "../assets/brand/wordmark.png";
import lockup from "../assets/brand/lockup.png";
import markNavy from "../assets/brand/mark-navy.png";
import markWhite from "../assets/brand/mark-white.png";
import type { BrandSize, BrandVariant } from "../types.ts";

const VARIANTS = {
  mark: mark,
  wordmark: wordmark,
  lockup: lockup,
  "mark-navy": markNavy,
  "mark-white": markWhite,
};

interface BrandLogoProps {
  variant?: BrandVariant;
  size?: BrandSize;
  alt?: string;
  className?: string;
}

export function BrandLogo(props: BrandLogoProps) {
  // variant: mark | wordmark | lockup | mark-navy | mark-white
  const variant: BrandVariant = props.variant || "lockup";
  const size = props.size || "md";
  const src = VARIANTS[variant] || lockup;

  // tailles en utilitaires Tailwind
  let sizeClass = "h-[180px] w-auto max-w-[420px]";
  if (size === "sm") {
    sizeClass = "h-11 w-auto max-w-[160px]";
  }
  if (size === "lg") {
    sizeClass = "h-60 w-auto max-w-[520px]";
  }

  const isMark =
    variant === "mark" ||
    variant === "mark-navy" ||
    variant === "mark-white";
  if (isMark && size === "sm") {
    sizeClass = "h-12 max-w-14 w-auto";
  }
  if (variant === "wordmark") {
    sizeClass = "h-7 max-w-[160px] w-auto";
  }

  let className =
    "brand-logo block select-none object-contain " + sizeClass;
  if (isMark) {
    className = className + " brand-logo-mark";
  }
  if (props.className) {
    className = className + " " + props.className;
  }

  return (
    <img
      src={src}
      alt={props.alt || "Taskora"}
      className={className}
      draggable="false"
    />
  );
}
