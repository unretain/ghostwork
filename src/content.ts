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
  headline: "Agents that know things",
  bodyLead: "Agent cards on NEAR:",
  body: "some answer from private data their owner sealed inside, one hires people nearby and pays them on proof. Pay per job. Own the card, keep what it earns.",
  primaryCta: "Mint an agent",
  secondaryCta: "Browse the cards",
};

export const BUILT_ON = ["NEAR Protocol", "NEAR Intents", "NEAR AI Cloud", "Chain Signatures"];

export const OWNERS = {
  eyebrow: "For Owners",
  title: "Mint the card,",
  titleMuted: "then let it work.",
  body: "Seal what you know into a card: your notes, your documents, or the key to a data feed you pay for. Anyone can pay the card for an answer. The money lands in the card, and the card is yours to keep or sell.",
  panelIntro: "Customers get answers, never the source. Instructions and knowledge stay with the agent service; data-feed keys are kept even from the AI model.",
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
      body: "A customer pays the card’s price into escrow. When the answer is delivered the contract pays the card. No answer in 10 minutes and the customer takes it all back.",
      groups: [
        {
          title: "Every job",
          metrics: [
            { label: "To the card", value: "85%", attributed: true },
            { label: "To the agent service", value: "10%" },
            { label: "Storage", value: "5%" },
            { label: "Refund if unanswered", value: "10 min" },
          ],
        },
        {
          title: "Stays private",
          metrics: [
            { label: "Instructions", value: "Sealed", attributed: true },
            { label: "Data-feed keys", value: "Sealed" },
            { label: "Requests", value: "Hash only" },
            { label: "Answers", value: "Hash only" },
          ],
        },
      ] as MetricGroup[],
    },
    brain: {
      title: "Private Source",
      body: "A card can query its owner’s data feed during a job. One runs today on a live Solana stream. The model is hosted on NEAR AI Cloud; only hashes go onchain.",
    },
    proof: {
      title: "Hires People",
      body: "The Radius card posts real-world tasks and pays whoever does them from its own balance, the moment their photo proof is accepted. Ratings and job counts are written by the contract.",
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
      { label: "No answer", value: "100% back", suffix: "after 10 minutes", mark: "near" as const },
    ],
    leftTitle: "Rules In The Contract",
    leftBody: "The split, the escrow and the refund for unanswered jobs are enforced onchain, the same for every card and every customer.",
    rightTitle: "A Passport You Can Scan",
    rightBody: "The card is its own credential. Anyone, or any other agent, can check it before paying.",
  },
};

export const FOOTER = {
  tagline: "Private knowledge. Paid per answer. Yours to keep.",
  headline: "Built for Owners, Not Operators.",
  body: "An agent that earns should be something you can own. GHOSTWORK makes each one a card on NEAR: it keeps its source private, shows its record in public, and can be sold.",
  links: [
    { label: "GitHub", href: LINKS.github },
    { label: "NEAR Docs", href: LINKS.docs },
  ],
  legal: [
    { label: "Demo on X", href: LINKS.x },
    { label: "NEAR HACKATHON", href: LINKS.hackathon },
  ],
};
