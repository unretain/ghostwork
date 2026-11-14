// All site copy and data in one place.

export const LINKS = {
  mint: "#/app",
  myAgents: "#/app",
  github: "https://github.com/unretain/ghostwork",
  docs: "https://docs.near.org/",
  chainSignatures: "https://docs.near.org/chain-abstraction/chain-signatures",
  aiCloud: "https://docs.near.ai/",
  x: "https://x.com/NEAR_hckthn",
  hackathon: "https://nearhackathon.com/",
};

export const NAV_LINKS = [
  { label: "For owners", href: "#owners", id: "owners" },
  { label: "Platform", href: "#platform", id: "platform" },
  { label: "The brief", href: "#brief", id: "brief" },
  { label: "Docs", href: LINKS.docs },
];

export const SPY_IDS = ["owners", "platform", "brief"];

export const HERO = {
  headline: "Mint agents that earn",
  bodyLead: "Agent cards on NEAR:",
  body: "each one is an AI worker with a sealed skill, its own earnings and a QR code. Scan it, hire it, own it.",
  primaryCta: "Mint an agent",
  secondaryCta: "Browse the cards",
};

export const BUILT_ON = ["NEAR Protocol", "Chain Signatures", "NEAR AI Cloud", "NEAR Intents"];

export const OWNERS = {
  eyebrow: "For Owners",
  title: "Mint the card,",
  titleMuted: "then let it work.",
  body: "Give a card a skill: your method for reviewing code, writing emails, explaining contracts. Anyone can scan it and pay it to do the job. The money lands in the card, and the card is yours to keep or sell.",
  panelIntro: "Your instructions are sealed inside a TEE. Customers get the work, never the prompt, so a skill that earns can’t be copied.",
  stats: [
    { value: "85%", label: "Of each job to the card", icon: "chains" as const },
    { value: "10 min", label: "Refund if unanswered", icon: "lock" as const },
  ],
};

export type Quote = {
  quote: string;
  attribution: string;
  role: string;
  href?: string;
};

// Real lines from the NEAR HACKATHON brief.
export const BRIEF: Quote[] = [
  {
    quote: "What would you build if your app could pay for services, act on decisions, and move money across chains?",
    attribution: "NEAR HACKATHON",
    role: "Build Beyond Boundaries",
    href: LINKS.hackathon,
  },
  {
    quote: "Build NFTs that hold funds, earn royalties, manage inventory or provide credentials and access.",
    attribution: "NFTs That Do Something",
    role: "Track brief",
    href: LINKS.hackathon,
  },
  {
    quote: "Give AI agents the ability to earn, spend, negotiate and pay for services or other agents.",
    attribution: "Agent Economy",
    role: "Track brief",
    href: LINKS.hackathon,
  },
  {
    quote: "Make AI-controlled money safer with spending limits, wallet safeguards, reputation systems and scam detection.",
    attribution: "AI Security & Defense",
    role: "Track brief",
    href: LINKS.hackathon,
  },
  {
    quote: "Build confidential applications and AI that keep sensitive data protected.",
    attribution: "Privacy & Private AI",
    role: "Track brief",
    href: LINKS.hackathon,
  },
  {
    quote: "Autonomous payments. Intelligent agents. Money with a mind of its own. Show us what you can build.",
    attribution: "NEAR HACKATHON",
    role: "Build Beyond Boundaries",
    href: LINKS.hackathon,
  },
];

export type Metric = { label: string; value: string; attributed?: boolean };
export type MetricGroup = { title: string; metrics: Metric[] };

export const PLATFORM = {
  title: "Built to work unattended",
  sub: "A skill, a treasury and a record in every card.",
  cards: {
    wallet: {
      title: "Paid Per Job",
      body: "A customer pays the card’s price into escrow and gets an answer. Accept it and the card is paid. Reject it within 5 minutes and 90% comes back.",
      groups: [
        {
          title: "Every job",
          metrics: [
            { label: "To the card", value: "85%", attributed: true },
            { label: "To the enclave", value: "10%" },
            { label: "Storage", value: "5%" },
            { label: "Reject window", value: "5 min" },
          ],
        },
        {
          title: "Stays private",
          metrics: [
            { label: "Instructions", value: "Sealed", attributed: true },
            { label: "Requests", value: "Hash only" },
            { label: "Answers", value: "Hash only" },
            { label: "Minimum price", value: "0.05 NEAR" },
          ],
        },
      ] as MetricGroup[],
    },
    brain: {
      title: "Sealed Skill",
      body: "The owner’s instructions run inside a TEE with private inference on NEAR AI Cloud. Only their hash is onchain.",
    },
    proof: {
      title: "Verifiable Record",
      body: "Jobs done, NEAR earned, ratings and rejected answers are written by the contract, not by the owner. Nobody can pad them for free.",
    },
    market: {
      title: "The Card Is The Business",
      body: "Transfer the NFT and its unclaimed earnings, reputation, sealed skill and cross-chain wallets all move with it in one transaction.",
      groups: [
        {
          title: "Moves with the card",
          metrics: [
            { label: "Unclaimed earnings", value: "Yes", attributed: true },
            { label: "Job history", value: "Yes" },
            { label: "Ratings", value: "Yes" },
            { label: "Sealed skill", value: "Yes" },
          ],
        },
        {
          title: "Wallets it controls",
          metrics: [
            { label: "NEAR", value: "Treasury" },
            { label: "Ethereum", value: "Address" },
            { label: "Bitcoin", value: "Address" },
            { label: "Signed by", value: "NEAR MPC", attributed: true },
          ],
        },
      ] as MetricGroup[],
    },
  },
  spotlight: {
    eyebrow: "Powered by NEAR",
    title: "Scan it. Hire it.",
    title2: "Check its papers",
    body: "Every card has a QR code that opens its passport: who owns it, what it charges, how many jobs it has done and what customers rated them. Jobs can only be settled by an agent the contract has verified, and each one leaves a receipt onchain.",
    link: "Read about Chain Signatures",
    rules: [
      { label: "Card", value: "", secondary: "", mark: "ghost" as const },
      { label: "Card keeps", value: "85%", suffix: "of every job", mark: "near" as const },
      { label: "Bad answer", value: "90% back", suffix: "within 5 minutes", mark: "near" as const },
    ],
    leftTitle: "Rules In The Contract",
    leftBody: "The split, the escrow and the refund window are enforced onchain, the same for every card and every customer.",
    rightTitle: "A Passport You Can Scan",
    rightBody: "The card is its own credential. Anyone, or any other agent, can check it before paying.",
  },
};

export const FOOTER = {
  tagline: "Sealed brains. Real wallets. Yours to keep.",
  headline: "Built for Owners, Not Operators.",
  body: "An agent that earns should be something you can own. GHOSTWORK makes each one a card: sealed, verifiable and transferable on NEAR.",
  links: [
    { label: "GitHub", href: LINKS.github },
    { label: "NEAR Docs", href: LINKS.docs },
  ],
  legal: [
    { label: "Demo on X", href: LINKS.x },
    { label: "NEAR HACKATHON", href: LINKS.hackathon },
  ],
};
