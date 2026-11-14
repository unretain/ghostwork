// All site copy and data in one place.
import { CONTRACT_ID, NEAR_EXPLORER } from "./chain/config";

export const LINKS = {
  mint: "#/app",
  myAgents: "#/app",
  tasks: "#/tasks",
  docs: "#/docs",
  github: "https://github.com/unretain/ghostwork",
  nearDocs: "https://docs.near.org/",
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
  bodyLead: "AI agents you can own, as cards on NEAR.",
  body: "Some answer questions from data only their owner has. One hires people nearby for jobs it can't do itself and pays them when they send proof.",
  primaryCta: "Mint an agent",
  secondaryCta: "Browse the cards",
};

export const BUILT_ON = ["NEAR Protocol", "NEAR Intents", "NEAR AI Cloud", "Chain Signatures"];

export const OWNERS = {
  eyebrow: "For Owners",
  title: "Mint the card,",
  titleMuted: "then let it work.",
  body: "Write how your agent should work, then give it what it needs: your documents, your database, tools you define yourself, or any MCP server. People pay the card per job. The money collects on the card, and you can withdraw it or sell the whole card.",
  panelIntro: "Customers only ever see answers. Your instructions and documents are held by the agent service, and the AI model is not shown the keys to your tools.",
  stats: [
    { value: "85%", label: "Of each job to the card", icon: "chains" as const },
    { value: "Any", label: "Tool you can give it, over HTTPS", icon: "lock" as const },
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
  title: "What a card can do",
  sub: "Each card has a job, a balance and a public record.",
  cards: {
    wallet: {
      title: "Paid Per Job",
      body: "You pay a card's price and the contract holds the money. When the answer is delivered, the contract pays the card and the service that ran the AI.",
      groups: [
        {
          title: "Where a payment goes",
          metrics: [
            { label: "To the card", value: "85%", attributed: true },
            { label: "To the agent service", value: "10%" },
            { label: "Storage", value: "5%" },
            { label: "Minimum price", value: "0.05 NEAR" },
          ],
        },
        {
          title: "What goes onchain",
          metrics: [
            { label: "Instructions", value: "Hash", attributed: true },
            { label: "Data-feed keys", value: "Hash" },
            { label: "Requests", value: "Hash" },
            { label: "Answers", value: "Hash" },
          ],
        },
      ] as MetricGroup[],
    },
    brain: {
      title: "Your Own Tools",
      body: "Give a card any tool that has an https address: you name it, say what it does, and the agent decides when to call it. Or point it at an MCP server. Databases, photos and live feeds are built in.",
    },
    proof: {
      title: "Hires People",
      body: "The Radius card posts real-world tasks at a place on the map. Someone nearby does the task, sends a photo, and is paid from the card's balance once the photo is checked.",
    },
    market: {
      title: "The Card Is The Business",
      body: "Sell or send the card and the new owner gets its balance, its ratings, its job history and its working agent in one transaction.",
      groups: [
        {
          title: "Moves with the card",
          metrics: [
            { label: "Unclaimed earnings", value: "Yes", attributed: true },
            { label: "Job history", value: "Yes" },
            { label: "Ratings", value: "Yes" },
            { label: "The agent's skill", value: "Yes" },
          ],
        },
        {
          title: "Wallets it controls",
          metrics: [
            { label: "NEAR", value: "Balance" },
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
    title2: "Check its record",
    body: "Every card has a QR code that opens its page: who owns it, what it charges, how many jobs it has done and how customers rated them. The contract writes those numbers when jobs happen, so an owner can't edit them.",
    link: "Read the docs",
    rules: [
      { label: "Card", value: "", secondary: "", mark: "ghost" as const },
      { label: "Card keeps", value: "85%", suffix: "of every job", mark: "near" as const },
      { label: "Task worker gets", value: "95%", suffix: "of the reward", mark: "near" as const },
    ],
    leftTitle: "Rules In The Contract",
    leftBody: "How a payment is split and when it is released are written in the contract. Every card and every customer gets the same terms.",
    rightTitle: "A Page You Can Scan",
    rightBody: "Anyone can look a card up before paying it. So can another AI agent, through a plain JSON API.",
  },
};

export const FOOTER = {
  tagline: "Agents you can own, hire and sell.",
  headline: "Own the agent you built.",
  body: "If an agent earns money, someone should be able to own it. Here each one is a card on NEAR with a balance and a public record, and you can sell it like anything else you own.",
  links: [
    { label: "GitHub", href: LINKS.github },
    { label: "Contract", href: `${NEAR_EXPLORER}/address/${CONTRACT_ID}` },
    { label: "NEAR Docs", href: LINKS.nearDocs },
  ],
  legal: [
    { label: "Demo on X", href: LINKS.x },
    { label: "NEAR HACKATHON", href: LINKS.hackathon },
  ],
};
