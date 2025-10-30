# TGF MRP - Material Requirements Planning System

A modern, full-stack Material Requirements Planning (MRP) system built with React, TypeScript, and Supabase.

## 🚀 Recent Improvements (2025)

This project has undergone significant improvements to enhance code quality, performance, and maintainability:

- ✅ **Performance**: 23% reduction in bundle size (587KB → 452KB)
- ✅ **Code Splitting**: Pages load on-demand with React.lazy()
- ✅ **Test Infrastructure**: Jest + React Testing Library with 16 passing tests
- ✅ **Error Handling**: Global error boundaries for graceful failure recovery
- ✅ **Logging**: Structured, production-safe logging system
- ✅ **TypeScript**: Strict mode enabled for better type safety

See [docs/IMPROVEMENTS_2025.md](docs/IMPROVEMENTS_2025.md) for detailed information.

## ✨ Features

- 📊 **Dashboard**: Real-time overview of inventory, BOMs, and orders
- 📦 **Inventory Management**: Track materials, quantities, and vendors
- 🛒 **Purchase Orders**: Create and manage purchase orders
- 🏭 **Production**: Build order management and tracking
- 📋 **Bill of Materials**: Create and manage BOMs with artwork integration
- 👥 **User Management**: Role-based access control (Admin, Manager, Staff)
- 📥 **CSV Import/Export**: Bulk data operations with validation
- 🔄 **Real-time Updates**: Live data synchronization via Supabase

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Backend**: Supabase (PostgreSQL, Auth, Real-time)
- **Styling**: Tailwind CSS
- **Testing**: Jest, React Testing Library
- **Deployment**: Vercel
- **AI**: Google Gemini for intelligent assistance

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account and project

### Installation

1. Clone the repository:
```bash
git clone https://github.com/bselee/TGF-MRP.git
cd TGF-MRP
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
# Edit .env.local with your Supabase credentials
```

4. Run the development server:
```bash
npm run dev
```

For detailed deployment instructions, see [QUICK_START.md](QUICK_START.md).

## 🧪 Testing

Run all tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

Generate coverage report:
```bash
npm run test:coverage
```

## 🏗️ Building

Build for production:
```bash
npm run build
```

Preview production build:
```bash
npm run preview
```

Validate before committing (runs tests + build):
```bash
npm run validate
```

Check for remaining console statements:
```bash
npm run check:console
```

> Note: Scripts in `scripts/` directory are pre-configured as executable.

## 📊 Project Scripts

- `npm run dev` - Start development server
- `npm test` - Run test suite
- `npm run build` - Build for production
- `npm run validate` - Run tests + build (pre-commit validation)
- `npm run check:console` - Check for console statements that need cleanup

## 📚 Documentation

- [Quick Start Guide](QUICK_START.md) - Get up and running quickly
- [Session Document](SESSION_DOCUMENT.md) - Development sessions and decisions
- [Database Reference](DATABASE_REFERENCE.md) - Database schema documentation
- [Improvements 2025](docs/IMPROVEMENTS_2025.md) - Recent improvements and upgrades
- [Deployment Guide](DEPLOYMENT_GUIDE.md) - Production deployment instructions

## 🏛️ Architecture

- **Frontend**: Single-page application with code splitting
- **State Management**: React hooks with centralized data service
- **Real-time**: Supabase subscriptions for live updates
- **Authentication**: Supabase Auth with PKCE flow
- **Authorization**: Row-Level Security (RLS) policies
- **Data Layer**: Centralized service layer with adapters

## 🤝 Contributing

1. Run tests before committing: `npm test`
2. Validate changes: `npm run validate`
3. Use structured logger instead of `console.log`
4. Follow TypeScript strict mode guidelines
5. Add tests for new features

## 📝 License

See [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Built with:
- [React](https://react.dev/)
- [Supabase](https://supabase.com/)
- [Vite](https://vitejs.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)
