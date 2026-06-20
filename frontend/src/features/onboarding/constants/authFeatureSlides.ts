import type { ImageSourcePropType } from "react-native";

import slide1Image from "@/assets/images/onboarding/slide-1.png";
import slide2Image from "@/assets/images/onboarding/slide-2.png";
import slide3Image from "@/assets/images/onboarding/slide-3.png";
import slide4Image from "@/assets/images/onboarding/slide-4.png";
import slide5Image from "@/assets/images/onboarding/slide-5.png";

export interface AuthFeatureSlideData {
  id: string;
  image: ImageSourcePropType;
  headline: string;
  subtext: string;
}

export const AUTH_FEATURE_SLIDES: AuthFeatureSlideData[] = [
  {
    id: "auto-tracking",
    image: slide1Image,
    headline: "Zero effort tracking",
    subtext:
      "Every UPI payment and notification becomes a clean, categorised expense — automatically and privately on your device.",
  },
  {
    id: "capture-methods",
    image: slide2Image,
    headline: "Capture your way",
    subtext:
      "Snap a receipt, speak it out loud, or type it in. Three ways to log an expense — whichever feels natural.",
  },
  {
    id: "budgets",
    image: slide3Image,
    headline: "Spend with confidence",
    subtext:
      "Set monthly limits for every category and watch your progress in real time. Know your limits before you hit them.",
  },
  {
    id: "insights",
    image: slide4Image,
    headline: "See the full picture",
    subtext:
      "Track top merchants, compare months, and spot patterns. Turn your spending history into smarter decisions.",
  },
  {
    id: "agent",
    image: slide5Image,
    headline: "Just ask Dime",
    subtext:
      '"How much did I spend on food last month?" Ask in plain language and get instant answers with charts and deep links.',
  },
];
