#!/bin/bash
# Quick password reset script with environment loaded

cd /workspaces/TGF-MRP

# Load environment variables from .env.local
export $(grep -v '^#' .env.local | xargs)

# Run the admin script
node scripts/admin-reset-password.js bill.selee@buildasoil.com "$1"
