// State Regulatory Intelligence Database Types
// Comprehensive types for managing state-by-state regulatory compliance

export interface StateAgency {
  id: string;
  stateCode: string; // Two-letter code (e.g., "CA", "NY")
  stateName: string; // Full name (e.g., "California")

  // Contact Information
  departmentName: string; // e.g., "California Department of Food and Agriculture"
  divisionName?: string; // e.g., "Feed, Fertilizer, and Livestock Drugs"

  // Primary Contact
  mailingAddress: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };

  phone: string;
  fax?: string;
  email: string;
  website: string;

  // Online Portal Access
  onlinePortal?: {
    url: string;
    requiresAccount: boolean;
    accountSetupUrl?: string;
    notes: string; // "Login with SSO", "Requires business license", etc.
  };

  // Regulatory Information
  regulatoryNotes: string; // Markdown-formatted notes about this state's requirements
  commonIssues: string[]; // ["Neem registration", "Heavy metals testing", "Organic certification"]
  averageResponseTime: string; // "2-4 weeks", "1-2 months"
  strictnessLevel: 'low' | 'medium' | 'high' | 'very_high'; // How strict is this state?

  // Process Documentation
  registrationProcess: {
    steps: string[]; // ["Submit Form ABC-123", "Pay $250 fee", "Wait for approval"]
    requiredForms: string[]; // ["ABC-123", "XYZ-789"]
    fees: string; // "$250 initial, $100 annual renewal"
    typicalTimeline: string; // "4-6 weeks"
    notes: string;
  };

  // Metadata
  lastVerified: string; // ISO timestamp
  lastUpdated: string; // ISO timestamp
  dataSource: 'ai_research' | 'manual_entry' | 'state_website' | 'user_submission';
  verifiedBy?: string; // User ID who verified this info

  // Historical tracking
  updateHistory: Array<{
    date: string;
    field: string;
    oldValue: string;
    newValue: string;
    updatedBy: string;
  }>;
}

export interface StateCorrespondence {
  id: string;
  stateCode: string;
  agencyId: string; // Links to StateAgency

  // Letter Details
  type: 'incoming' | 'outgoing' | 'draft';
  category: 'registration' | 'complaint' | 'clarification' | 'renewal' | 'testing' | 'other';
  subject: string;
  receivedDate?: string; // For incoming letters
  sentDate?: string; // For outgoing letters

  // Content
  content: string; // Full letter text
  attachments?: Array<{
    id: string;
    fileName: string;
    fileType: string;
    url: string; // Storage URL
  }>;

  // AI Analysis (for incoming letters)
  aiAnalysis?: {
    summary: string; // AI-generated summary
    identifiedIssues: string[]; // List of compliance issues mentioned
    requiredActions: string[]; // What we need to do
    deadline?: string; // If a deadline was mentioned
    severity: 'info' | 'warning' | 'urgent' | 'critical';
    relatedProducts: string[]; // BOMs affected
    estimatedWorkHours: number; // How much effort to resolve
  };

  // Action Tracking
  status: 'received' | 'analyzed' | 'draft_prepared' | 'sent' | 'resolved' | 'archived';
  assignedTo?: string; // User ID
  dueDate?: string;
  resolution?: string; // How was this resolved

  // Thread tracking
  inResponseTo?: string; // ID of letter this is responding to
  responses: string[]; // IDs of responses to this letter

  // Metadata
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface StateRegulation {
  id: string;
  stateCode: string;

  // Regulation Details
  regulationType: 'fertilizer' | 'pesticide' | 'organic' | 'labeling' | 'testing' | 'licensing' | 'other';
  title: string;
  description: string;

  // Legal Reference
  statute?: string; // e.g., "California Food and Agricultural Code Section 14500-14599"
  regulation?: string; // e.g., "Title 3, California Code of Regulations"
  effectiveDate: string;

  // Applicability
  appliesToIngredients: string[]; // ["Neem", "Kelp", "Biochar"]
  appliesToClaims: string[]; // ["Organic", "Natural", "Eco-friendly"]
  appliesToProductTypes: string[]; // ["Soil amendment", "Fertilizer", "Pesticide"]

  // Requirements
  requiresRegistration: boolean;
  requiresTesting: boolean;
  requiresLabeling: boolean;
  requiresReporting: boolean;

  // Penalties
  violationPenalty?: string; // "$1,000 per day" or "Criminal misdemeanor"

  // Resources
  sourceUrl: string;
  guidanceDocuments: string[];

  // Metadata
  lastVerified: string;
  confidence: 'high' | 'medium' | 'low'; // How confident are we in this info
  notes: string;
}

export interface StateResearchTask {
  id: string;
  stateCode: string;
  taskType: 'initial_research' | 'update_verification' | 'deep_dive';
  status: 'queued' | 'in_progress' | 'completed' | 'failed';

  // Research Scope
  researchTopics: string[]; // ["contact_info", "registration_process", "fee_structure", "online_portal"]

  // Results
  findings: Array<{
    topic: string;
    data: any;
    sources: string[]; // URLs researched
    confidence: 'high' | 'medium' | 'low';
  }>;

  // Execution
  startedAt?: string;
  completedAt?: string;
  error?: string;

  // Scheduling
  scheduledFor?: string; // For weekly/monthly auto-updates
  lastRunAt?: string;
}

export interface LetterTemplate {
  id: string;
  name: string;
  category: 'registration' | 'response_to_complaint' | 'clarification' | 'renewal' | 'appeal' | 'general';
  description: string;

  // Template Content
  template: string; // Markdown with {{variables}}

  // Required Variables
  requiredFields: Array<{
    name: string;
    type: 'text' | 'date' | 'number' | 'product_list' | 'ingredient_list';
    description: string;
    example: string;
  }>;

  // Metadata
  useCount: number;
  lastUsed?: string;
  successRate?: number; // How often does this template get good results?
  createdBy: string;
  isPublic: boolean; // Available to all users vs private
}

// US Regions for regional compliance scanning
export const US_REGIONS = {
  'West Coast': ['CA', 'OR', 'WA'],
  'Mountain': ['MT', 'ID', 'WY', 'NV', 'UT', 'CO', 'AZ', 'NM'],
  'Midwest': ['ND', 'SD', 'NE', 'KS', 'MN', 'IA', 'MO', 'WI', 'IL', 'IN', 'MI', 'OH'],
  'Southwest': ['TX', 'OK', 'AR', 'LA'],
  'Southeast': ['MS', 'AL', 'TN', 'KY', 'WV', 'VA', 'NC', 'SC', 'GA', 'FL'],
  'Northeast': ['PA', 'NY', 'VT', 'NH', 'ME', 'MA', 'RI', 'CT', 'NJ', 'DE', 'MD'],
  'Alaska & Hawaii': ['AK', 'HI']
} as const;

export type USRegion = keyof typeof US_REGIONS;

// All 50 US states
export const ALL_US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
] as const;

export const STATE_NAMES: Record<string, string> = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
  'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
  'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
  'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
  'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
  'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
  'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
  'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
  'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
  'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
  'WI': 'Wisconsin', 'WY': 'Wyoming'
};
