```markdown
# Complete Grok / X-Inspired App Design System  
**Full-Page UI + Sidebar + Light & Dark Mode**  
Exportable Markdown Documentation – 2025 Edition  

Ready for Notion, GitHub Wiki, or your design system repo.

---

## 1. Design Philosophy (The “Grok + X” DNA)

| Principle               | How it shows in the UI                                      |
|-------------------------|-------------------------------------------------------------|
| Minimalist but warm     | Almost no borders, generous whitespace, subtle shadows     |
| Content-first           | Sidebar + header never compete with main canvas             |
| Fast & predictable      | Pill-shaped hit areas, instant hover feedback              |
| Theme-aware by default  | Every component designed first in dark, then adapted to light |
| Single accent color     | `#1D9BF0` (X blue) used only for primary actions & links    |
| Motion only when useful | Micro-interactions on hover/focus, no decorative animations |

---

## 2. Global Layout Structure (All Breakpoints)

```
┌─────────────────────────────────────────────────────────────┐
│ Top Bar (optional search + model picker)                    │ ← 56px height
├──────────────┬──────────────────────────────────────────────┤
│ Sidebar      │ Main Content Area                            │
│ 240–280px    │ • Feed / Chat / Editor                       │
│ (fixed)      │ • Right rail (optional context, activity)    │
└──────────────┴──────────────────────────────────────────────┘
│ Bottom Navigation Bar (mobile only ≤500px)                  │ ← 56px height
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Color System – Light & Dark Mode (2025 palette)

```css
/* CSS Custom Properties – put in :root and [data-theme="light"] */
:root {
  /* Core */
  --bg-primary:   #000000;
  --bg-secondary: #16181C;
  --bg-tertiary:  #202327;
  --surface:      #16181C;
  --border:       rgba(255,255,255,0.1);

  /* Text */
  --text-primary:   #FFFFFF;
  --text-secondary: #71767B;
  --text-muted:     #71767B;

  /* Accent */
  --accent:         #1D9BF0;
  --accent-hover:   #1a8cd8;

  /* States */
  --success: #00BA7C;
  --error:   #F4213A;
}

[data-theme="light"] {
  --bg-primary:   #FFFFFF;
  --bg-secondary: #F7F9F9;
  --bg-tertiary:  #EFF3F4;
  --surface:      #FFFFFF;
  --border:       rgba(0,0,0,0.1);

  --text-primary:   #0F1419;
  --text-secondary: #536471;
  --text-muted:     #536471;
}
```

### Exact X/Grok shades (2025 measured)
| Name               | Dark Hex     | Light Hex    | Usage |
|--------------------|--------------|--------------|-------|
| Background         | `#000000`    | `#FFFFFF`    | Page |
| Elevated surface   | `#16181C`    | `#FFFFFF`    | Cards, modals |
| Secondary surface  | `#202327`    | `#F7F9F9`    | Sidebar hover, input bg |
| Border / divider   | `rgba(255,255,255,0.1)` | `rgba(0,0,0,0.1)` | All lines |

---

## 4. Typography Scale (Inter or system-ui)

```css
.text-xs   { font-size: 13px; line-height: 16px; }
.text-sm   { font-size: 15px; line-height: 20px; }
.text-base { font-size: 17px; line-height: 24px; }
.text-lg   { font-size: 19px; line-height: 28px; }
.text-xl   { font-size: 23px; line-height: 30px; }
.text-2xl  { font-size: 31px; line-height: 38px; }

font-weight: 400 normal, 500 medium, 700 bold
```

---

## 5. Component Library (Copy-Paste Ready)

### 5.1 Top Bar (Desktop & Tablet)

```html
<header class="top-bar">
  <div class="left">Grok Logo or App Name</div>
  <div class="center">
    <input type="search" placeholder="Search or ask Grok…" class="search-global" />
  </div>
  <div class="right">
    <button class="model-picker">grok-4-fast ▼</button>
    <button class="theme-toggle">Moon/Sun Icon</button>
  </div>
</header>
```

```css
.top-bar {
  height: 56px;
  padding: 0 16px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 100;
}
.search-global {
  width: 100%;
  max-width: 400px;
  background: var(--bg-secondary);
  border-radius: 9999px;
  padding: 10px 16px;
  border: 1px solid var(--border);
}
```

### 5.2 Sidebar (Full version from previous doc + enhancements)

```css
.sidebar {
  width: 280px;
  background: var(--bg-primary);
  border-right: 1px solid var(--border);
}

/* Hover pill effect */
.nav-item {
  border-radius: 9999px;
  padding: 12px 16px;
}
.nav-item:hover {
  background: var(--bg-tertiary);
}
```

### 5.3 Main Content Cards (Chat bubbles, posts, code blocks)

```css
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 12px;
}

/* Chat message styles */
.message-user   { background: var(--accent); color: white; align-self: flex-end; }
.message-grok   { background: var(--bg-secondary); }
```

### 5.4 Buttons

```css
.btn-primary {
  background: var(--accent);
  color: white;
  font-weight: 700;
  border-radius: 9999px;
  padding: 12px 24px;
}
.btn-primary:hover { background: var(--accent-hover); }

.btn-ghost {
  background: transparent;
  color: var(--text-primary);
  border-radius: 9999px;
  padding: 10px 16px;
}
.btn-ghost:hover { background: var(--bg-tertiary); }
```

### 5.5 Inputs & Textareas

```css
.input, .textarea {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px 16px;
  color: var(--text-primary);
}
.input:focus, .textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(29,155,240,0.3);
}
```

---

## 6. Mobile Layout (≤500px)

```css
@media (max-width: 500px) {
  .sidebar, .top-bar { display: none; }
  
  .mobile-bottom-nav {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    height: 56px;
    background: var(--bg-primary);
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: space-around;
    align-items: center;
    z-index: 100;
  }
  .mobile-bottom-nav a {
    padding: 8px;
    border-radius: 50%;
  }
  .mobile-bottom-nav a.active {
    color: var(--accent);
  }
}
```

---

## 7. Theme Toggle Implementation (One-liner)

```js
document.documentElement.dataset.theme = 
  localStorage.theme || 
  (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  
document.getElementById('theme-toggle').addEventListener('click', () => {
  const newTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = newTheme;
  localStorage.theme = newTheme;
});
```

---

## 8. Full Export Checklist

- [ ] Dark mode default with perfect contrast  
- [ ] Light mode fully styled (no gray-on-white crimes)  
- [ ] Sidebar (desktop) + bottom nav (mobile)  
- [ ] Top bar with global search & model picker  
- [ ] Pill-shaped interactive elements everywhere  
- [ ] Single accent color `#1D9BF0`  
- [ ] Card-based content with subtle borders  
- [ ] Mobile-first responsive breakpoints  
- [ ] Theme toggle with system preference detection  
- [ ] All copy-paste components ready  

---

**File name to save:** `GROK_X_FULL_DESIGN_SYSTEM_2025.md`

Drop this into your repo and your entire team will build pixel-perfect Grok/X-style apps in hours instead of weeks.

Enjoy the speed  
— Built with love by a Grok user for Grok users
```
