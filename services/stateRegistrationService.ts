// State Registration Service
// Manages state-by-state product registration requirements and renewal tracking

import type { ProductRegistration } from '../types';

// State Registration Guidelines
export interface StateGuidelines {
  stateCode: string;
  stateName: string;
  agency: string;
  agencyUrl: string;
  registrationRequired: boolean;
  requiresLabeling: boolean;
  renewalPeriod: 'annual' | 'biennial' | 'triennial';
  renewalMonth?: string; // "January", "December", etc.
  averageFee: number;
  averageRenewalFee: number;
  processingTime: string; // "2-4 weeks", "30 days", etc.
  requirements: string[];
  penalties?: string;
  notes?: string;
  lastUpdated: string;
}

// Comprehensive state-by-state guidelines
export const STATE_GUIDELINES: Record<string, StateGuidelines> = {
  CA: {
    stateCode: 'CA',
    stateName: 'California',
    agency: 'California Department of Food and Agriculture (CDFA)',
    agencyUrl: 'https://www.cdfa.ca.gov/is/ffldrs/',
    registrationRequired: true,
    requiresLabeling: true,
    renewalPeriod: 'annual',
    renewalMonth: 'January',
    averageFee: 250,
    averageRenewalFee: 250,
    processingTime: '4-6 weeks',
    requirements: [
      'Product label (PDF or physical sample)',
      'Guaranteed analysis showing NPK percentages',
      'Complete ingredient list by weight',
      'Company registration (if not already registered)',
      'CDFA Form 2013 (Fertilizer Registration Application)',
      'Certificate of Analysis (for specialty products)',
      'OMRI certificate (if claiming organic)'
    ],
    penalties: 'Late renewals may result in $500+ fines and product recall',
    notes: 'California has some of the strictest fertilizer regulations. All products must be registered before sale. Renewals due by January 1st each year.',
    lastUpdated: '2025-01-01'
  },
  OR: {
    stateCode: 'OR',
    stateName: 'Oregon',
    agency: 'Oregon Department of Agriculture (ODA)',
    agencyUrl: 'https://www.oregon.gov/oda/programs/FertilizerPesticides/',
    registrationRequired: true,
    requiresLabeling: true,
    renewalPeriod: 'annual',
    renewalMonth: 'December',
    averageFee: 150,
    averageRenewalFee: 150,
    processingTime: '2-4 weeks',
    requirements: [
      'Product label',
      'Guaranteed analysis',
      'Ingredient declaration',
      'ODA Registration Form',
      'Brand name registration (if applicable)',
      'Tonnage reports (annual)'
    ],
    penalties: 'Products sold without registration subject to immediate stop-sale order',
    notes: 'Oregon requires annual tonnage reports. Renewals due by December 31st.',
    lastUpdated: '2025-01-01'
  },
  WA: {
    stateCode: 'WA',
    stateName: 'Washington',
    agency: 'Washington State Department of Agriculture (WSDA)',
    agencyUrl: 'https://agr.wa.gov/departments/pesticides-and-fertilizers/fertilizers',
    registrationRequired: true,
    requiresLabeling: true,
    renewalPeriod: 'annual',
    renewalMonth: 'June',
    averageFee: 200,
    averageRenewalFee: 200,
    processingTime: '3-4 weeks',
    requirements: [
      'Product label',
      'Guaranteed analysis',
      'List of ingredients',
      'WSDA Application Form',
      'Tonnage distribution plan',
      'Heavy metal analysis (for certain products)'
    ],
    penalties: 'Civil penalties up to $7,500 per violation',
    notes: 'Washington state requires detailed heavy metal testing for certain products. Fiscal year registration (July 1 - June 30).',
    lastUpdated: '2025-01-01'
  },
  NY: {
    stateCode: 'NY',
    stateName: 'New York',
    agency: 'New York State Department of Agriculture and Markets',
    agencyUrl: 'https://agriculture.ny.gov/plant-industry/fertilizers',
    registrationRequired: true,
    requiresLabeling: true,
    renewalPeriod: 'annual',
    renewalMonth: 'December',
    averageFee: 100,
    averageRenewalFee: 100,
    processingTime: '2-3 weeks',
    requirements: [
      'Product label',
      'Guaranteed analysis',
      'Ingredient statement',
      'NY Registration Form',
      'Product name approval'
    ],
    penalties: 'Unregistered products subject to stop-sale and fines',
    notes: 'New York has specific labeling requirements for organic claims.',
    lastUpdated: '2025-01-01'
  },
  VT: {
    stateCode: 'VT',
    stateName: 'Vermont',
    agency: 'Vermont Agency of Agriculture, Food and Markets',
    agencyUrl: 'https://agriculture.vermont.gov/plant-health-pesticides/fertilizer',
    registrationRequired: true,
    requiresLabeling: true,
    renewalPeriod: 'annual',
    renewalMonth: 'January',
    averageFee: 125,
    averageRenewalFee: 125,
    processingTime: '2-3 weeks',
    requirements: [
      'Product label',
      'Guaranteed analysis',
      'Complete ingredient list',
      'VT Registration Application',
      'Heavy metal analysis results',
      'Source documentation for organic claims'
    ],
    penalties: 'Penalties range from $100 to $5,000 per violation',
    notes: 'Vermont requires heavy metal testing and has strict organic labeling rules.',
    lastUpdated: '2025-01-01'
  },
  ME: {
    stateCode: 'ME',
    stateName: 'Maine',
    agency: 'Maine Board of Pesticides Control / Dept of Agriculture',
    agencyUrl: 'https://www.maine.gov/dacf/php/pesticides/',
    registrationRequired: true,
    requiresLabeling: true,
    renewalPeriod: 'annual',
    renewalMonth: 'December',
    averageFee: 100,
    averageRenewalFee: 100,
    processingTime: '2-4 weeks',
    requirements: [
      'Product label',
      'Guaranteed analysis',
      'Ingredient declaration',
      'Maine Registration Form',
      'Distributor information'
    ],
    penalties: 'Stop-sale orders and fines up to $1,000 per violation',
    notes: 'Maine requires registration for all fertilizers sold in the state.',
    lastUpdated: '2025-01-01'
  },
  TX: {
    stateCode: 'TX',
    stateName: 'Texas',
    agency: 'Texas Department of Agriculture (TDA)',
    agencyUrl: 'https://www.texasagriculture.gov/RegulatoryPrograms/Fertilizer.aspx',
    registrationRequired: true,
    requiresLabeling: true,
    renewalPeriod: 'annual',
    renewalMonth: 'August',
    averageFee: 180,
    averageRenewalFee: 180,
    processingTime: '3-5 weeks',
    requirements: [
      'Product label',
      'Guaranteed analysis',
      'Ingredient statement',
      'TDA Registration Form (Form 5301)',
      'Brand name and grade registration',
      'Tonnage reports (semi-annual)'
    ],
    penalties: 'Administrative penalties and stop-sale orders',
    notes: 'Texas has specific requirements for specialty fertilizers and soil amendments.',
    lastUpdated: '2025-01-01'
  },
  FL: {
    stateCode: 'FL',
    stateName: 'Florida',
    agency: 'Florida Department of Agriculture and Consumer Services (FDACS)',
    agencyUrl: 'https://www.fdacs.gov/Agriculture-Industry/Fertilizer',
    registrationRequired: true,
    requiresLabeling: true,
    renewalPeriod: 'biennial',
    renewalMonth: 'June',
    averageFee: 200,
    averageRenewalFee: 150,
    processingTime: '4-6 weeks',
    requirements: [
      'Product label',
      'Guaranteed analysis',
      'Complete ingredient list',
      'FDACS Registration Application',
      'Heavy metal certification',
      'Source statements for specialty products'
    ],
    penalties: 'Civil penalties up to $10,000 and criminal charges for willful violations',
    notes: 'Florida has strict environmental regulations due to water quality concerns. Biennial registration.',
    lastUpdated: '2025-01-01'
  }
};

// Calculate renewal status based on expiration date
export function calculateRenewalStatus(
  expirationDate: string
): ProductRegistration['renewalStatus'] {
  const now = new Date();
  const expiration = new Date(expirationDate);
  const daysUntilExpiration = Math.ceil(
    (expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilExpiration < 0) return 'expired';
  if (daysUntilExpiration <= 30) return 'urgent';
  if (daysUntilExpiration <= 90) return 'due_soon';
  return 'current';
}

// Calculate days until expiration
export function calculateDaysUntilExpiration(expirationDate: string): number {
  const now = new Date();
  const expiration = new Date(expirationDate);
  return Math.ceil((expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// Get all states that are commonly used
export function getAllStates(): { code: string; name: string }[] {
  return Object.values(STATE_GUIDELINES).map(g => ({
    code: g.stateCode,
    name: g.stateName
  }));
}

// Get registrations that need attention
export function getRegistrationsNeedingAttention(
  registrations: ProductRegistration[]
): {
  urgent: ProductRegistration[];
  dueSoon: ProductRegistration[];
  expired: ProductRegistration[];
} {
  const urgent: ProductRegistration[] = [];
  const dueSoon: ProductRegistration[] = [];
  const expired: ProductRegistration[] = [];

  registrations.forEach(reg => {
    const status = calculateRenewalStatus(reg.expirationDate);
    const daysUntil = calculateDaysUntilExpiration(reg.expirationDate);

    const enrichedReg = {
      ...reg,
      renewalStatus: status,
      daysUntilExpiration: daysUntil
    };

    switch (status) {
      case 'urgent':
        urgent.push(enrichedReg);
        break;
      case 'due_soon':
        dueSoon.push(enrichedReg);
        break;
      case 'expired':
        expired.push(enrichedReg);
        break;
    }
  });

  return { urgent, dueSoon, expired };
}

// Get renewal deadline for a state
export function getRenewalDeadline(stateCode: string, year: number): Date | null {
  const guidelines = STATE_GUIDELINES[stateCode];
  if (!guidelines || !guidelines.renewalMonth) return null;

  const monthMap: Record<string, number> = {
    January: 0,
    February: 1,
    March: 2,
    April: 3,
    May: 4,
    June: 5,
    July: 6,
    August: 7,
    September: 8,
    October: 9,
    November: 10,
    December: 11
  };

  const month = monthMap[guidelines.renewalMonth];
  if (month === undefined) return null;

  return new Date(year, month, 1); // First day of renewal month
}

// Validate registration data
export function validateRegistration(
  registration: Partial<ProductRegistration>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!registration.stateCode || registration.stateCode.length !== 2) {
    errors.push('Valid state code is required');
  }

  if (!registration.registrationNumber || registration.registrationNumber.trim() === '') {
    errors.push('Registration number is required');
  }

  if (!registration.registeredDate) {
    errors.push('Registration date is required');
  }

  if (!registration.expirationDate) {
    errors.push('Expiration date is required');
  }

  if (registration.registeredDate && registration.expirationDate) {
    const regDate = new Date(registration.registeredDate);
    const expDate = new Date(registration.expirationDate);
    if (expDate <= regDate) {
      errors.push('Expiration date must be after registration date');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
