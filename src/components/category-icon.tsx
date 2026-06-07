import {
  ArrowLeftRight,
  Baby,
  Banknote,
  Briefcase,
  CircleDot,
  Coffee,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  type LucideIcon,
  PawPrint,
  Plane,
  Receipt,
  RefreshCw,
  RotateCcw,
  Shield,
  ShoppingBag,
  ShoppingBasket,
  Sparkles,
  Ticket,
  TramFront,
  TrendingUp,
  UtensilsCrossed,
} from "lucide-react";
import { createElement } from "react";

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "shopping-basket": ShoppingBasket,
  "utensils-crossed": UtensilsCrossed,
  "tram-front": TramFront,
  "shopping-bag": ShoppingBag,
  ticket: Ticket,
  "heart-pulse": HeartPulse,
  "graduation-cap": GraduationCap,
  receipt: Receipt,
  "refresh-cw": RefreshCw,
  plane: Plane,
  banknote: Banknote,
  "arrow-left-right": ArrowLeftRight,
  shield: Shield,
  home: Home,
  sparkles: Sparkles,
  "circle-dot": CircleDot,
  coffee: Coffee,
  "paw-print": PawPrint,
  gift: Gift,
  baby: Baby,
  briefcase: Briefcase,
  "trending-up": TrendingUp,
  "rotate-ccw": RotateCcw,
  landmark: Landmark,
};

export function getCategoryIcon(name: string | null | undefined): LucideIcon {
  return CATEGORY_ICONS[name ?? "circle-dot"] ?? CircleDot;
}

export function CategoryIcon({
  name,
  className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  return createElement(getCategoryIcon(name), { className, "aria-hidden": true });
}
