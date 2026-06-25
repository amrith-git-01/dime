import type { ImageSourcePropType } from "react-native";

import slide1Image from "@/assets/images/onboarding/slide-1.png";
import slide2Image from "@/assets/images/onboarding/slide-2.png";
import slide3Image from "@/assets/images/onboarding/slide-3.png";
import slide4Image from "@/assets/images/onboarding/slide-4.png";
import slide5Image from "@/assets/images/onboarding/slide-5.png";

export interface AuthFeatureSlideData {
  id: string;
  image: ImageSourcePropType;
  description: string;
}

export const AUTH_FEATURE_SLIDES: AuthFeatureSlideData[] = [
  {
    id: "auto-tracking",
    image: slide1Image,
    description:
      "UPI and bank alerts turn into categorised expenses — automatically, on your device.",
  },
  {
    id: "capture-methods",
    image: slide2Image,
    description:
      "Scan a receipt, speak an expense, or type it in. Log spending however you like.",
  },
  {
    id: "budgets",
    image: slide3Image,
    description:
      "Set monthly limits per category and see how much room you have left.",
  },
  {
    id: "insights",
    image: slide4Image,
    description:
      "Charts and month comparisons help you spot where your money goes.",
  },
  {
    id: "agent",
    image: slide5Image,
    description:
      'Ask Dime AI anything — like "How much on food last month?" — and get instant answers.',
  },
];
