export type BillingPlanId = 'basic' | 'ops_pod' | 'full_ai' | 'enterprise';
export type BillingInterval = 'monthly' | 'yearly';

export interface PricingPlan {
  id: BillingPlanId;
  marketingName: string;
  badge?: string;
  tagline: string;
  description: string;
  minSeats: number;
  recommendedSeats?: number;
  price: {
    monthly: number;
    yearly: number;
    unit: 'seat' | 'org';
    footnote?: string;
  };
  ribbon?: string;
  featureHighlights: string[];
  includesFrom?: BillingPlanId;
  contactSales?: boolean;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'basic',
    marketingName: 'Basic',
    badge: 'Free forever',
    tagline: 'Single ops lead or lab',
    description: 'Core inventory, BOM, and purchasing tools with manual compliance checklists.',
    minSeats: 1,
    price: {
      monthly: 0,
      yearly: 0,
      unit: 'seat',
      footnote: 'Unlimited single-seat usage',
    },
    featureHighlights: [
      'Inventory + PO automation fundamentals',
      'Manual compliance checklists & regulatory link manager',
      'Google Sheets / Docs / Calendar read connectors',
      'Community support & onboarding checklists',
    ],
  },
  {
    id: 'ops_pod',
    marketingName: 'Ops Pod',
    badge: 'New',
    tagline: 'Team workspace for purchasing & ops',
    description: 'Unlock the auto-PO workflow, Shopify ingestion, and inbound logistics calendar pushes.',
    minSeats: 3,
    recommendedSeats: 5,
    price: {
      monthly: 140,
      yearly: 95,
      unit: 'seat',
      footnote: 'Yearly pricing billed upfront',
    },
    ribbon: 'Best for scaling teams',
    includesFrom: 'basic',
    featureHighlights: [
      'Auto-PO drafting with vendor-ready email threads',
      'Shopify sales + inventory ingestion w/ RBAC guardrails',
      'Google Calendar push for inbound logistics timeline',
      'Ops console for approvals, alerts, and requisitions',
    ],
  },
  {
    id: 'full_ai',
    marketingName: 'Plant Control (Full AI)',
    badge: 'AI Suite',
    tagline: 'AI compliance + tracking automation',
    description: 'Adds AI compliance copilots, Gmail webhook routing, and 50 automated scans per month.',
    minSeats: 1,
    price: {
      monthly: 49,
      yearly: 49,
      unit: 'seat',
      footnote: 'Add-on per seat. First seat required.',
    },
    includesFrom: 'ops_pod',
    featureHighlights: [
      '50 automated compliance scans per month (reset monthly)',
      'Label OCR + AI corrective actions (Gemini / GPT / Claude)',
      'Gmail webhook parsing with tracking + invoice automation',
      'AI purchasing copilots with semantic search + insights',
    ],
  },
  {
    id: 'enterprise',
    marketingName: 'Enterprise',
    badge: 'Custom',
    tagline: 'Private tenants & advanced governance',
    description: 'Everything in Plant Control plus private hosting, SSO, and dedicated success engineering.',
    minSeats: 10,
    price: {
      monthly: 0,
      yearly: 0,
      unit: 'org',
      footnote: 'Custom pricing',
    },
    includesFrom: 'full_ai',
    contactSales: true,
    featureHighlights: [
      'Private Supabase or VPC hosting + data residency options',
      'SSO (Okta, Google Workspace, Azure AD) and SCIM provisioning',
      'Dedicated CSM, quarterly architecture reviews, 1-day SLA',
      'Custom connectors (ERP, PLM, MES) + white-glove onboarding',
    ],
  },
];

export const PRICING_PLAN_MAP: Record<BillingPlanId, PricingPlan> = PRICING_PLANS.reduce(
  (acc, plan) => {
    acc[plan.id] = plan;
    return acc;
  },
  {} as Record<BillingPlanId, PricingPlan>,
);

export const BILLING_INTERVAL_LABEL: Record<BillingInterval, string> = {
  monthly: 'Monthly billing',
  yearly: 'Yearly billing',
};
