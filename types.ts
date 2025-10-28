export interface BOMComponent {
  sku: string;
  quantity: number;
  name: string;
}

export interface BillOfMaterials {
  id: string;
  finishedSku: string;
  name: string;
  components: BOMComponent[];
}

export interface InventoryItem {
  sku: string;
  name: string;
  category: string;
  stock: number;
  onOrder: number;
  reorderPoint: number;
  vendorId: string;
  moq?: number;
}

export interface Vendor {
    id: string;
    name: string;
    contactEmail: string;
    leadTimeDays: number;
}

export interface PurchaseOrderItem {
    sku: string;
    name:string;
    quantity: number;
    price: number;
}

export interface PurchaseOrder {
    id: string;
    vendorId: string;
    status: 'Pending' | 'Submitted' | 'Fulfilled';
    createdAt: string;
    items: PurchaseOrderItem[];
}

export interface HistoricalSale {
    sku: string;
    date: string; // YYYY-MM-DD
    quantity: number;
}


export const mockVendors: Vendor[] = [
    { id: 'VEND-001', name: 'Soil Solutions Inc.', contactEmail: 'sales@soilsolutions.com', leadTimeDays: 14 },
    { id: 'VEND-002', name: 'Garden Supplies Co.', contactEmail: 'orders@gardensupplies.co', leadTimeDays: 7 },
    { id: 'VEND-003', name: 'Eco Packaging', contactEmail: 'contact@ecopackaging.com', leadTimeDays: 21 },
];

export const mockInventory: InventoryItem[] = [
  { sku: "COMP-001", name: "Worm Castings (1 lb)", category: "Amendments", stock: 500, onOrder: 100, reorderPoint: 200, vendorId: 'VEND-001', moq: 50 },
  { sku: "COMP-002", name: "Pumice (1/8 inch)", category: "Aggregates", stock: 250, onOrder: 50, reorderPoint: 150, vendorId: 'VEND-002', moq: 50 },
  { sku: "COMP-003", name: "Coconut Coir Brick", category: "Growing Media", stock: 150, onOrder: 75, reorderPoint: 100, vendorId: 'VEND-001', moq: 25 },
  { sku: "COMP-004", name: "Kelp Meal (1 lb)", category: "Amendments", stock: 80, onOrder: 0, reorderPoint: 50, vendorId: 'VEND-001' },
  { sku: "COMP-005", name: "Neem Seed Meal (1 lb)", category: "Pest Control", stock: 75, onOrder: 0, reorderPoint: 40, vendorId: 'VEND-002', moq: 20 },
  { sku: "COMP-006", name: "Biochar (1 gallon)", category: "Soil Conditioners", stock: 30, onOrder: 50, reorderPoint: 25, vendorId: 'VEND-001' },
  { sku: "COMP-007", name: "Mycorrhizal Fungi Inoculant", category: "Inoculants", stock: 120, onOrder: 0, reorderPoint: 60, vendorId: 'VEND-002' },
  { sku: "BAG-SML", name: "Small Burlap Bag (1 cu ft)", category: "Packaging", stock: 1000, onOrder: 500, reorderPoint: 800, vendorId: 'VEND-003', moq: 500 },
  { sku: "BAG-MED", name: "Medium Burlap Bag (2 cu ft)", category: "Packaging", stock: 500, onOrder: 0, reorderPoint: 400, vendorId: 'VEND-003', moq: 250 },
  { sku: "BAG-LRG", name: "Large Burlap Bag (4 cu ft)", category: "Packaging", stock: 200, onOrder: 100, reorderPoint: 150, vendorId: 'VEND-003', moq: 100 },
  
  // Finished Goods & Sub-Assemblies
  { sku: "PROD-A", name: "Premium Potting Mix (1 cu ft)", category: "Finished Goods", stock: 100, onOrder: 0, reorderPoint: 50, vendorId: 'N/A' },
  { sku: "PROD-B", name: "Organic Super Soil (2 cu ft)", category: "Finished Goods", stock: 40, onOrder: 0, reorderPoint: 25, vendorId: 'N/A' },
  { sku: "PROD-C", name: "Biochar Soil Conditioner (4 cu ft)", category: "Finished Goods", stock: 15, onOrder: 0, reorderPoint: 20, vendorId: 'N/A' },
  { sku: "PROD-D", name: "Seed Starting Mix (1 cu ft)", category: "Finished Goods", stock: 50, onOrder: 0, reorderPoint: 30, vendorId: 'N/A' },
  { sku: "SUB-A", name: "Seed Starter Kit", category: "Sub-Assembly", stock: 20, onOrder: 0, reorderPoint: 15, vendorId: 'N/A' },
];

export const mockBOMs: BillOfMaterials[] = [
  {
    id: "bom_110105",
    finishedSku: "PROD-A",
    name: "Premium Potting Mix (1 cu ft)",
    components: [
      { sku: "COMP-001", name: "Worm Castings (1 lb)", quantity: 5 },
      { sku: "COMP-002", name: "Pumice (1/8 inch)", quantity: 2 },
      { sku: "COMP-003", name: "Coconut Coir Brick", quantity: 1 },
      { sku: "BAG-SML", name: "Small Burlap Bag (1 cu ft)", quantity: 1 },
    ],
  },
  {
    id: "bom_110106",
    finishedSku: "PROD-B",
    name: "Organic Super Soil (2 cu ft)",
    components: [
      { sku: "COMP-001", name: "Worm Castings (1 lb)", quantity: 10 },
      { sku: "SUB-A", name: "Seed Starter Kit", quantity: 1 }, // Using a sub-assembly
      { sku: "BAG-MED", name: "Medium Burlap Bag (2 cu ft)", quantity: 1 },
    ],
  },
  {
    id: "bom_110107",
    finishedSku: "PROD-C",
    name: "Biochar Soil Conditioner (4 cu ft)",
    components: [
      { sku: "COMP-006", name: "Biochar (1 gallon)", quantity: 4 },
      { sku: "COMP-001", name: "Worm Castings (1 lb)", quantity: 8 },
      { sku: "COMP-003", name: "Coconut Coir Brick", quantity: 2 },
      { sku: "BAG-LRG", name: "Large Burlap Bag (4 cu ft)", quantity: 1 },
    ],
  },
  {
    id: "bom_110108",
    finishedSku: "PROD-D",
    name: "Seed Starting Mix (1 cu ft)",
    components: [
      { sku: "COMP-003", name: "Coconut Coir Brick", quantity: 3 },
      { sku: "COMP-002", name: "Pumice (1/8 inch)", quantity: 5 },
      { sku: "COMP-004", name: "Kelp Meal (1 lb)", quantity: 1 },
      { sku: "BAG-SML", name: "Small Burlap Bag (1 cu ft)", quantity: 1 },
    ],
  },
  {
    id: "bom_sub_a",
    finishedSku: "SUB-A",
    name: "Seed Starter Kit",
    components: [
        { sku: "COMP-005", name: "Neem Seed Meal (1 lb)", quantity: 2 },
        { sku: "COMP-007", name: "Mycorrhizal Fungi Inoculant", quantity: 1 },
    ]
  }
];

export const mockPurchaseOrders: PurchaseOrder[] = [
    {
        id: 'PO-2024-001',
        vendorId: 'VEND-001',
        status: 'Fulfilled',
        createdAt: '2024-07-15T10:00:00Z',
        items: [
            { sku: 'COMP-001', name: 'Worm Castings (1 lb)', quantity: 200, price: 5.50 },
            { sku: 'COMP-003', name: 'Coconut Coir Brick', quantity: 100, price: 2.75 },
        ]
    },
    {
        id: 'PO-2024-002',
        vendorId: 'VEND-003',
        status: 'Submitted',
        createdAt: '2024-08-01T14:30:00Z',
        items: [
            { sku: 'BAG-SML', name: 'Small Burlap Bag (1 cu ft)', quantity: 500, price: 0.50 },
            { sku: 'BAG-LRG', name: 'Large Burlap Bag (4 cu ft)', quantity: 100, price: 1.25 },
        ]
    },
    {
        id: 'PO-2024-003',
        vendorId: 'VEND-002',
        status: 'Pending',
        createdAt: '2024-08-05T09:00:00Z',
        items: [
            { sku: 'COMP-002', name: 'Pumice (1/8 inch)', quantity: 50, price: 3.00 },
            { sku: 'COMP-005', name: 'Neem Seed Meal (1 lb)', quantity: 40, price: 4.25 },
        ]
    }
];

// Generate mock historical sales data for the last 90 days
const generateHistoricalSales = (): HistoricalSale[] => {
    const sales: HistoricalSale[] = [];
    const skus = ["PROD-A", "PROD-B", "PROD-C", "PROD-D"];
    const today = new Date();
    for (let i = 90; i > 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateString = date.toISOString().split('T')[0];

        // Simulate more sales for popular products
        if (Math.random() > 0.3) { // 70% chance of sale for PROD-A
            sales.push({ sku: 'PROD-A', date: dateString, quantity: Math.floor(Math.random() * 5) + 1 });
        }
        if (Math.random() > 0.4) { // 60% chance of sale for PROD-B
             sales.push({ sku: 'PROD-B', date: dateString, quantity: Math.floor(Math.random() * 8) + 2 });
        }
        if (Math.random() > 0.8) { // 20% chance of sale for PROD-C
             sales.push({ sku: 'PROD-C', date: dateString, quantity: Math.floor(Math.random() * 2) + 1 });
        }
    }
    return sales;
};
export const mockHistoricalSales: HistoricalSale[] = generateHistoricalSales();
