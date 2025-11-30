import React from 'react';
import Button from '@/components/ui/Button';
import context7GuideUrl from '../CONTEXT7_SETUP.md?url';

const CodeBlock: React.FC<{ code: string; lang?: string }> = ({ code, lang = 'json' }) => (
  <pre className="bg-gray-900/70 rounded-md p-4 text-sm text-gray-300 overflow-x-auto border border-gray-700">
    <code className={`language-${lang}`}>{code.trim()}</code>
  </pre>
);

const ApiEndpoint: React.FC<{
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    description: string;
    requestBody?: string;
    responseBody: string;
}> = ({ method, path, description, requestBody, responseBody }) => {
    const methodColors = {
        GET: 'text-green-400',
        POST: 'text-blue-400',
        PUT: 'text-yellow-400',
        DELETE: 'text-red-400',
    };

    return (
        <div className="space-y-4">
            <div>
                <span className={`font-bold text-lg mr-4 ${methodColors[method]}`}>{method}</span>
                <span className="font-mono text-lg text-white">{path}</span>
            </div>
            <p className="text-gray-400">{description}</p>
            {requestBody && (
                <div>
                    <h5 className="font-semibold mb-2 text-gray-300">Request Body:</h5>
                    <CodeBlock code={requestBody} />
                </div>
            )}
            <div>
                <h5 className="font-semibold mb-2 text-gray-300">Example Response (200 OK):</h5>
                <CodeBlock code={responseBody} />
            </div>
        </div>
    );
};

const ApiDocs: React.FC = () => {
  return (
    <div className="space-y-12 max-w-5xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold text-white tracking-tight">API Documentation</h1>
        <p className="text-gray-400 mt-2">Integrate external systems with the MuRP application using this REST API.</p>
      </header>

      {/* --- Authentication --- */}
      <section>
        <h2 className="text-2xl font-semibold text-gray-300 border-b border-gray-700 pb-2 mb-4">Authentication</h2>
        <p className="text-gray-400 mb-4">
          All API requests must be authenticated using an API key generated in the Admin Settings panel.
          Include the API key in the <code className="bg-gray-700 px-1 py-0.5 rounded text-accent-300">Authorization</code> header of your request.
        </p>
        <CodeBlock code={`Authorization: Bearer <YOUR_API_KEY>`} lang="bash" />
      </section>

      {/* --- Data Models --- */}
      <section>
        <h2 className="text-2xl font-semibold text-gray-300 border-b border-gray-700 pb-2 mb-4">Data Models</h2>
        <div className="space-y-6">
          <div>
            <h3 className="text-xl font-semibold text-white mb-2">Inventory Item</h3>
            <CodeBlock code={`{
  "sku": "COMP-001",
  "name": "Worm Castings (1 lb)",
  "category": "Amendments",
  "stock": 500,
  "onOrder": 100,
  "reorderPoint": 200,
  "vendorId": "VEND-001",
  "moq": 50
}`} />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-white mb-2">Purchase Order</h3>
            <CodeBlock code={`{
  "id": "PO-2024-001",
  "vendorId": "VEND-001",
  "status": "Fulfilled",
  "createdAt": "2024-07-15T10:00:00Z",
  "items": [
    { "sku": "COMP-001", "name": "Worm Castings (1 lb)", "quantity": 200, "price": 5.50 }
  ],
  "expectedDate": "2024-07-29",
  "notes": "Standard delivery.",
  "requisitionIds": ["REQ-2024-004"]
}`} />
          </div>
        </div>
      </section>

      {/* --- Endpoints --- */}
      <section>
        <h2 className="text-2xl font-semibold text-gray-300 border-b border-gray-700 pb-2 mb-4">API Endpoints</h2>
        <div className="space-y-10">
          <ApiEndpoint
            method="GET"
            path="/api/v1/inventory"
            description="Retrieves a list of all inventory items."
            responseBody={`[
  {
    "sku": "COMP-001",
    "name": "Worm Castings (1 lb)",
    "stock": 500,
    "onOrder": 100
  },
  {
    "sku": "COMP-002",
    "name": "Pumice (1/8 inch)",
    "stock": 250,
    "onOrder": 50
  }
]`}
          />
          <ApiEndpoint
            method="GET"
            path="/api/v1/purchase-orders"
            description="Retrieves a list of all purchase orders."
            responseBody={`[
  {
    "id": "PO-2024-002",
    "vendorId": "VEND-003",
    "status": "Submitted",
    "createdAt": "2024-08-01T14:30:00Z"
  }
]`}
          />
          <ApiEndpoint
            method="POST"
            path="/api/v1/purchase-orders"
            description="Creates a new purchase order."
            requestBody={`{
  "vendorId": "VEND-002",
  "expectedDate": "2024-09-15",
  "items": [
    { "sku": "COMP-002", "quantity": 150 },
    { "sku": "COMP-005", "quantity": 100 }
  ],
  "notes": "Rush delivery if possible."
}`}
            responseBody={`{
  "id": "PO-2024-004",
  "vendorId": "VEND-002",
  "status": "Pending",
  "createdAt": "2024-08-20T11:00:00Z",
  "items": [
    { "sku": "COMP-002", "name": "Pumice (1/8 inch)", "quantity": 150, "price": 3.00 },
    { "sku": "COMP-005", "name": "Neem Seed Meal (1 lb)", "quantity": 100, "price": 4.25 }
  ]
}`}
          />
          <ApiEndpoint
            method="GET"
            path="/api/v1/requisitions"
            description="Retrieves a list of all internal purchase requisitions."
            responseBody={`[
  {
    "id": "REQ-2024-002",
    "requesterId": "user-manager-mfg2",
    "department": "MFG 2",
    "status": "Pending",
    "items": [ { "sku": "COMP-006", "quantity": 20 } ]
  }
]`}
          />
           <ApiEndpoint
            method="POST"
            path="/api/v1/build-orders"
            description="Creates a new internal build order for a finished good."
            requestBody={`{
  "finishedSku": "PROD-A",
  "quantity": 50
}`}
            responseBody={`{
  "id": "BO-2024-003",
  "finishedSku": "PROD-A",
  "name": "Premium Potting Mix (1 cu ft)",
  "quantity": 50,
  "status": "Pending",
  "createdAt": "2024-08-20T11:05:00Z"
}`}
          />
        </div>
      </section>

      {/* Context7 Research Assistant */}
      <section aria-label="Context7 Research Assistant" className="border border-blue-900/40 rounded-2xl bg-gradient-to-br from-blue-950/60 via-accent-800/40 to-slate-900/30 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">Context7 Research Assistant</h2>
            <p className="text-sm text-blue-100 mt-2 max-w-2xl">
              Need up-to-date SDK guidance while building against the MuRP APIs? The Context7 MCP server pipes live documentation into the VS Code assistant.
              Use it to resolve package IDs, pull the latest REST examples, or stage migration notes without leaving the console.
            </p>
          </div>
          <div className="flex gap-3">
            <a
              href={context7GuideUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-lg shadow-blue-900/40"
            >
              Open Context7 Setup Guide
            </a>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open('https://context7.com/', '_blank', 'noopener')}
            >
              Learn about Context7
            </Button>
          </div>
        </div>
        <ul className="mt-5 text-sm text-blue-100 list-disc list-inside space-y-1">
          <li>Launch the Context7 MCP server via the VS Code extension or CLI task.</li>
          <li>Use <code className="text-blue-200">resolve-library-id</code> to map packages, then <code className="text-blue-200">get-library-docs</code> for deep dives.</li>
          <li>Results stay cached locally for seven days, so repeated lookups are instant—even offline.</li>
        </ul>
      </section>
    </div>
  );
};

export default ApiDocs;
