// User Agreement Types for Regulatory Features
// Tracks user acceptance of terms and disclaimers

export interface RegulatoryUserAgreement {
  userId: string;

  // Agreement acceptance
  acceptedAt: string;
  version: string; // Agreement version (e.g., "1.0", "1.1")
  ipAddress?: string; // Optional: track where accepted from

  // What they agreed to
  acknowledgedTerms: {
    notLegalAdvice: boolean;
    verificationRequired: boolean;
    consultAttorneyRecommended: boolean;
    noWarranties: boolean;
    useAtOwnRisk: boolean;
    liabilityRelease: boolean;
    aiLimitations: boolean;
    regulatoryChanges: boolean;
  };

  // Additional acknowledgments
  additionalAcknowledgments: {
    letterDraftsRequireReview: boolean;
    complianceInfoMayBeIncomplete: boolean;
    verifyAllSourcesRequired: boolean;
    documentVerificationProcess: boolean;
  };

  // Signature
  fullName: string;
  title: string;
  companyName: string;
  electronicSignature: string; // Typed name as signature

  // Status
  status: 'active' | 'revoked' | 'expired';
  expiresAt?: string; // Optional: require re-acceptance annually
}

export interface LetterDraftDisclaimer {
  // Minimal disclaimer shown when drafting letters
  // Main legal protection is covered by the regulatory user agreement
  version: string;
  checkboxText: string; // Single checkbox text to acknowledge before generating letter
}

export interface LetterDraftReview {
  letterId: string;

  // Review workflow
  reviews: Array<{
    reviewerId: string;
    reviewerName: string;
    reviewerRole: 'user' | 'manager' | 'attorney' | 'consultant';
    reviewDate: string;

    // Review details
    approved: boolean;
    changesRequested: boolean;
    changes?: string;
    comments?: string;

    // Legal review specific
    legalIssuesIdentified?: string[];
    recommendations?: string[];
  }>;

  // Overall status
  status: 'draft' | 'pending_review' | 'changes_requested' | 'approved' | 'sent' | 'archived';

  // Tracking
  createdAt: string;
  lastModified: string;
  sentAt?: string;
  responseReceived?: {
    date: string;
    summary: string;
  };
}

// The actual regulatory agreement text
export const REGULATORY_AGREEMENT_TEXT = {
  version: "1.0",
  lastUpdated: "2025-11-06",

  title: "Regulatory Compliance Features - User Agreement",

  introduction: `
This agreement governs your use of the Regulatory Compliance features in TGF-MRP, including but not limited to:
- AI-powered regulatory research
- State agency contact information
- Compliance issue identification
- Letter drafting assistance
- Regulatory guidance

BY USING THESE FEATURES, YOU ACKNOWLEDGE AND AGREE TO THE FOLLOWING TERMS:
`,

  sections: [
    {
      title: "1. NOT LEGAL ADVICE",
      content: `
The information and assistance provided by these features ARE NOT LEGAL ADVICE and should not be relied upon as such.

This system uses artificial intelligence to research and organize regulatory information. AI can make mistakes, provide incomplete information, or misinterpret regulations.

You acknowledge that:
- This is a research and organizational tool only
- It does not create an attorney-client relationship
- It does not substitute for professional legal counsel
- It should not be your sole source for compliance decisions
`
    },
    {
      title: "2. VERIFICATION REQUIRED",
      content: `
YOU MUST VERIFY ALL INFORMATION with official sources before taking any compliance action.

Required verification steps:
- Check official state government websites (.gov domains)
- Contact state agriculture departments directly
- Review actual statutes and regulations cited
- Consult with qualified regulatory attorneys
- Document your verification process

DO NOT rely solely on AI-generated information for compliance decisions.
`
    },
    {
      title: "3. ATTORNEY CONSULTATION RECOMMENDED",
      content: `
We STRONGLY RECOMMEND consulting with a qualified regulatory attorney or consultant who:
- Is licensed to practice in the relevant state(s)
- Has experience with agriculture/fertilizer regulations
- Can provide professional legal advice specific to your situation

This is especially important for:
- Product registration decisions
- Response to state enforcement actions
- Interpretation of complex regulations
- High-risk compliance situations
`
    },
    {
      title: "4. NO WARRANTIES",
      content: `
We make NO WARRANTIES about the accuracy, completeness, timeliness, or reliability of:
- AI-generated regulatory information
- State agency contact information
- Compliance recommendations
- Letter drafts
- Source materials

Information may be:
- Outdated (regulations change frequently)
- Incomplete (AI may miss relevant information)
- Incorrect (AI can misinterpret or hallucinate)
- Inapplicable (your specific situation may differ)
`
    },
    {
      title: "5. USE AT YOUR OWN RISK",
      content: `
You use these features entirely AT YOUR OWN RISK.

You are solely responsible for:
- Verifying all information provided
- Making compliance decisions
- Ensuring your products meet all legal requirements
- Responding to regulatory inquiries
- Consequences of non-compliance

We are not responsible for:
- Fines or penalties you may incur
- Product recalls or seizures
- Business interruption or loss
- Damage to reputation
- Legal fees or costs
`
    },
    {
      title: "6. LIABILITY RELEASE",
      content: `
TO THE MAXIMUM EXTENT PERMITTED BY LAW, you release and hold harmless TGF-MRP, its owners, employees, and affiliates from any and all claims, damages, losses, or expenses arising from:

- Use of AI-generated regulatory information
- Reliance on compliance recommendations
- Use of letter drafts or templates
- State agency contact information
- Any compliance-related features

This includes but is not limited to:
- Regulatory fines or penalties
- Legal costs and attorney fees
- Product recalls or seizures
- Loss of business or revenue
- Reputational damage
`
    },
    {
      title: "7. AI LIMITATIONS",
      content: `
You understand and acknowledge that AI systems:

- Can make mistakes or provide incorrect information
- May "hallucinate" facts or citations that don't exist
- Cannot understand context the way humans can
- May miss nuances in complex regulations
- Are trained on historical data (may be outdated)
- Cannot replace human judgment and expertise

Always apply critical thinking and verify AI outputs.
`
    },
    {
      title: "8. REGULATORY CHANGES",
      content: `
Agricultural regulations change frequently.

You acknowledge that:
- Information may become outdated quickly
- You are responsible for staying current with regulations
- We do not guarantee updates to reflect regulatory changes
- Cached information may be stale
- You should verify currency of all information
`
    },
    {
      title: "9. LETTER DRAFTS REQUIRE REVIEW",
      content: `
AI-generated letter drafts are TEMPLATES ONLY and require thorough review before sending.

You MUST:
- Review all content for accuracy
- Verify all facts and statements
- Have letters reviewed by appropriate personnel
- Consider legal review for important communications
- Ensure letters accurately represent your situation
- Take responsibility for all content sent

DO NOT send AI-generated letters without careful review.
`
    },
    {
      title: "10. DOCUMENT YOUR PROCESS",
      content: `
We strongly recommend documenting your compliance verification process:

- What sources you checked
- Who you consulted
- Dates of verification
- Professional reviews obtained
- Decisions made and rationale
- Actions taken

This documentation can be valuable if compliance questions arise later.
`
    }
  ],

  agreement: `
BY CLICKING "I ACCEPT" BELOW, YOU ACKNOWLEDGE THAT:

✓ You have read and understand this entire agreement
✓ You agree to all terms and conditions stated above
✓ You will verify all information with official sources
✓ You will consult with qualified legal professionals
✓ You understand this is not legal advice
✓ You use these features at your own risk
✓ You release TGF-MRP from liability as stated above

If you do not agree to these terms, do not use the Regulatory Compliance features.
`,

  signature: {
    required: [
      "Full legal name",
      "Title",
      "Company name",
      "Date"
    ]
  }
};

// Letter drafting disclaimer - minimal, just single checkbox per letter
// Comprehensive legal protection is covered by the main regulatory user agreement
export const LETTER_DRAFTING_DISCLAIMER = {
  version: "1.0",

  // Single checkbox - clean and simple
  checkboxText: "I understand this is AI-generated (not legal advice), requires thorough review and verification, and I take full responsibility for any letter I send"
};

// Data retention and deletion policy
export const DATA_RETENTION_AGREEMENT = {
  version: "1.0",
  lastUpdated: "2025-11-06",
  title: "Data Retention and Deletion Policy",

  content: `
**Data Storage:**
Your data is stored locally and/or in cloud services (Supabase) as configured.
You are responsible for backing up your data.

**Data Deletion:**
We are not responsible for accidental or intentional deletion of data. You should
maintain regular backups of critical business information.

**Data Retention:**
Data is retained until explicitly deleted by users with appropriate permissions.
No automatic deletion occurs unless configured by your organization.

**Your Responsibilities:**
- Maintain backups of critical data
- Implement appropriate user permissions
- Train users on proper data management
- Document your data retention policies

By using this system, you acknowledge and accept these terms.
`
};
