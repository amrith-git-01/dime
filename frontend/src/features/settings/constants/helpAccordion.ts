export type HelpAccordionItem = {
  id: string;
  term: string;
  description: string;
};

export type HelpAccordionGroup = {
  id: string;
  title: string;
  terms: readonly HelpAccordionItem[];
};
