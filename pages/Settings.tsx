import React from 'react';

const Settings: React.FC = () => {
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold text-white tracking-tight">Settings</h1>
        <p className="text-gray-400 mt-1">Manage integrations, reporting, and application preferences.</p>
      </header>

      {/* API Integrations Section */}
      <section>
        <h2 className="text-xl font-semibold text-gray-300 border-b border-gray-700 pb-2 mb-4">Data Acquisition & Integrations</h2>
        <div className="space-y-6">
          {/* Finale Inventory Card */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
            <h3 className="text-lg font-semibold text-white">Finale Inventory</h3>
            <p className="text-sm text-gray-400 mt-1 mb-4">Sync inventory levels directly from Finale Inventory.</p>
            <div className="space-y-4">
              <div>
                <label htmlFor="finale-api-key" className="block text-sm font-medium text-gray-300">API Key</label>
                <input
                  type="password"
                  id="finale-api-key"
                  className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="••••••••••••••••••••"
                />
              </div>
              <div className="flex justify-end">
                <button className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors">
                  Save & Sync
                </button>
              </div>
            </div>
          </div>
          
          {/* QuickBooks Card */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700 opacity-60">
            <h3 className="text-lg font-semibold text-white">QuickBooks Online</h3>
            <p className="text-sm text-gray-400 mt-1 mb-4">Connect to QuickBooks to sync sales data for more accurate demand forecasting. (Coming Soon)</p>
            <div className="flex justify-end">
                <button disabled className="bg-gray-600 text-gray-400 font-semibold py-2 px-4 rounded-md cursor-not-allowed">
                  Connect
                </button>
              </div>
          </div>
          
           {/* Webhooks Card */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
            <h3 className="text-lg font-semibold text-white">Incoming Webhooks</h3>
            <p className="text-sm text-gray-400 mt-1 mb-4">Use webhooks to receive real-time data from other platforms (e.g., Shopify sales).</p>
             <div>
                <label htmlFor="webhook-url" className="block text-sm font-medium text-gray-300">Webhook URL</label>
                <div className="mt-1 flex rounded-md shadow-sm">
                    <input
                      type="text"
                      id="webhook-url"
                      readOnly
                      value="https://tgfmrp.app/api/webhooks/xyz-123-abc"
                      className="flex-1 block w-full min-w-0 rounded-none rounded-l-md bg-gray-900 border-gray-600 text-gray-400 sm:text-sm px-3 py-2 cursor-not-allowed"
                    />
                    <button className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-gray-600 bg-gray-700 text-sm text-gray-300 hover:bg-gray-600">
                        Copy
                    </button>
                </div>
              </div>
          </div>

        </div>
      </section>

      {/* Reporting Section */}
      <section>
        <h2 className="text-xl font-semibold text-gray-300 border-b border-gray-700 pb-2 mb-4">Reporting & Automation</h2>
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white">Scheduled Reports</h3>
          <p className="text-sm text-gray-400 mt-1 mb-4">Configure automated reports to be delivered to your inbox.</p>
          <div className="space-y-4">
            <div>
              <label htmlFor="report-type" className="block text-sm font-medium text-gray-300">Report</label>
              <select id="report-type" className="mt-1 block w-full pl-3 pr-10 py-2 text-base bg-gray-700 border-gray-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md text-white">
                <option>Weekly Shortage Report</option>
                <option>Monthly Buildability Summary</option>
                <option>Vendor Performance Review</option>
              </select>
            </div>
            <div>
              <label htmlFor="report-recipients" className="block text-sm font-medium text-gray-300">Recipients (comma-separated)</label>
              <input type="email" id="report-recipients" className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" placeholder="ceo@example.com, ops@example.com" />
            </div>
            <div className="flex justify-end">
                <button className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors">
                  Save Schedule
                </button>
              </div>
          </div>
        </div>
      </section>
       {/* Alerts Section */}
      <section>
        <h2 className="text-xl font-semibold text-gray-300 border-b border-gray-700 pb-2 mb-4">Alerts & Notifications</h2>
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
           <h3 className="text-lg font-semibold text-white">Proactive Alerts</h3>
           <p className="text-sm text-gray-400 mt-1 mb-4">Get notified when critical events occur.</p>
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="text-md font-medium text-gray-200">Email on Critical Shortage</h4>
                    <p className="text-sm text-gray-500">Notify when projected stock is less than 7 days of forecast.</p>
                </div>
                 <label htmlFor="toggle" className="flex items-center cursor-pointer">
                    <div className="relative">
                      <input type="checkbox" id="toggle" className="sr-only" />
                      <div className="block bg-gray-600 w-14 h-8 rounded-full"></div>
                      <div className="dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition"></div>
                    </div>
                </label>
            </div>
        </div>
      </section>

      {/* Automation Rules Section */}
      <section>
        <h2 className="text-xl font-semibold text-gray-300 border-b border-gray-700 pb-2 mb-4">Automation Rules (Future)</h2>
        <div className="space-y-6">
          {/* Purchasing Rule */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
            <h3 className="text-lg font-semibold text-white">Automated Purchasing</h3>
            <p className="text-sm text-gray-400 mt-1 mb-4">Automatically create draft purchase orders when components run low.</p>
            <div className="space-y-4 p-4 border border-dashed border-gray-600 rounded-lg">
                <div className="flex items-center gap-2 text-gray-300 flex-wrap">
                   <span>WHEN projected stock for a</span>
                   <select className="bg-gray-700 border-gray-600 rounded-md p-1 text-sm">
                       <option>Component</option>
                       <option>Raw Material</option>
                   </select>
                   <span>is less than</span>
                   <input type="number" defaultValue="14" className="w-16 bg-gray-700 border-gray-600 rounded-md p-1 text-sm text-center" />
                   <span>days of supply</span>
                </div>
                 <div className="flex items-center gap-2 text-gray-300 flex-wrap">
                   <span>THEN automatically create a draft PO for its primary vendor.</span>
                </div>
                <div className="flex justify-end pt-2">
                    <button className="bg-gray-600 text-gray-400 font-semibold py-2 px-4 rounded-md cursor-not-allowed">Enable Rule</button>
                </div>
            </div>
          </div>
          {/* Production Rule */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
            <h3 className="text-lg font-semibold text-white">Automated Production</h3>
            <p className="text-sm text-gray-400 mt-1 mb-4">Automatically create build orders when finished goods are needed.</p>
            <div className="space-y-4 p-4 border border-dashed border-gray-600 rounded-lg">
                <div className="flex items-center gap-2 text-gray-300 flex-wrap">
                   <span>WHEN projected stock for a</span>
                   <select className="bg-gray-700 border-gray-600 rounded-md p-1 text-sm">
                       <option>Finished Good</option>
                   </select>
                   <span>is less than</span>
                   <input type="number" defaultValue="7" className="w-16 bg-gray-700 border-gray-600 rounded-md p-1 text-sm text-center" />
                   <span>days of supply</span>
                </div>
                 <div className="flex items-center gap-2 text-gray-300 flex-wrap">
                   <span>THEN automatically create a Build Order to replenish stock up to the reorder point.</span>
                </div>
                 <div className="flex justify-end pt-2">
                    <button className="bg-gray-600 text-gray-400 font-semibold py-2 px-4 rounded-md cursor-not-allowed">Enable Rule</button>
                </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
};

export default Settings;