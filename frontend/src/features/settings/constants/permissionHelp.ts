import type { HelpAccordionGroup } from "./helpAccordion";

export const PERMISSION_HELP_INTRO =
  "What Dime may ask Android for, how we use it, and why it is optional unless you want that feature.";

export const PERMISSION_HELP_GROUPS: readonly HelpAccordionGroup[] = [
  {
    id: "capture",
    title: "Capture",
    terms: [
      {
        id: "camera",
        term: "Camera",
        description:
          "Dime can use the camera while the app is open. You tap to photograph a receipt; we read amount and merchant from that picture. We need this so you can log a bill without typing. The photo is attached to the transaction you create.",
      },
      {
        id: "photos",
        term: "Photos",
        description:
          "Android may list photo access because Dime can attach a receipt image. We only use a picture you capture or choose — we do not scan your gallery in the background.",
      },
      {
        id: "microphone",
        term: "Microphone",
        description:
          "Dime can use the microphone while you hold the voice control. We turn speech into a draft expense for you to confirm. We need this so you can log spending hands-free. Audio is not recorded when you are not capturing.",
      },
    ],
  },
  {
    id: "alerts",
    title: "Alerts",
    terms: [
      {
        id: "notifications",
        term: "Notifications",
        description:
          "Dime can show tray alerts on this phone. We use them for budget limits, a daily expense reminder, and when a capture succeeds or fails. We need this so you hear about overspend and missed logs without opening the app. You can deny this and still use Dime; those alerts just will not appear.",
      },
    ],
  },
];
