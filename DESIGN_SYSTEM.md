# Lowpass Design System

## Light Mode Theme
Complete design system for Lowpass tour management application. Dark mode will be added in future.

---

## 📐 Colors

### Brand Colors
- **Primary Orange**: `#FF4500` - Main brand color, CTAs, active states
- **Dark Brown**: `#6A1D01` - Sidebar background, dark text
- **Light Brown/Tan**: `#FFC0A3` - Gradient accents

### Backgrounds
- **White**: `#FFFFFF` - Primary background
- **Surface Gray**: `#F5F5F5` - Secondary surfaces, table headers
- **Surface Hover**: `#EFEFEF` - Hover states on surfaces

### Text
- **Primary Text**: `#0F0F0F` - Main content
- **Secondary Text**: `#737373` - Supporting content
- **Tertiary Text**: `#999999` - Disabled, muted content
- **Muted**: `rgba(15, 15, 15, 0.8)` - Labels, hints

### Semantic Colors
- **Success/Income**: `#10B981` - Green indicators
- **Error/Expenses**: `#EF4444` - Red indicators
- **Warning**: `#F59E0B` - Amber
- **Info**: `#3B82F6` - Blue
- **Overheads**: `#7C3AED` - Purple

### Borders
- **Border Default**: `#E5E6EE` - Standard borders
- **Border Light**: `rgba(51, 42, 28, 0.60)` - Subtle borders

---

## 🔤 Typography

### Font Family
`SF Pro, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`

### Font Sizes
| Name | Size | Usage |
|------|------|-------|
| `xs` | 10px | Labels, badges, small indicators |
| `sm` | 11px | Section headers, tab labels |
| `base` | 12px | Body text, table cells |
| `md` | 13px | Regular content |
| `lg` | 14px | Large text |
| `xl` | 18px | Subheadings |
| `2xl` | 24px | Headings, card titles |
| `3xl` | 36px | Page titles |
| `4xl` | 38.4px | Hero text, main heading |

### Font Weights
| Name | Weight | Usage |
|------|--------|-------|
| Light | 400 | Secondary text |
| Normal | 500 | Default weight |
| Semibold | 590 | Labels, smaller emphasis |
| Bold | 700 | Headings, primary emphasis |

### Line Heights
| Name | Value | Usage |
|------|-------|-------|
| Tight | 15px | Compact text |
| Normal | 16px | Default |
| Relaxed | 20px | Comfortable reading |
| Spacious | 32px | Large headings |

### Letter Spacing
| Name | Value | Usage |
|------|-------|-------|
| Normal | 0.60px | Standard |
| Wide | 1px | Tab labels |
| Wider | 1.10px | Section headers |
| Widest | 1.80px | Button labels |

---

## 📏 Spacing

Base unit: **4px**

| Name | Size | Usage |
|------|------|-------|
| `xs` | 4px | Minimal gaps |
| `sm` | 6px | Small spacing |
| `md` | 8px | Between elements |
| `lg` | 12px | Component spacing |
| `xl` | 16px | Section padding |
| `2xl` | 20px | Card padding |
| `3xl` | 24px | Large sections |
| `4xl` | 32px | Major sections |

---

## 🎨 Border Radius

| Name | Value | Usage |
|------|-------|-------|
| `sm` | 4px | Buttons, small elements |
| `md` | 6px | Inputs, form elements |
| `lg` | 8px | Cards (internal elements) |
| `xl` | 12px | Cards, modals |

---

## 🖼️ Components

### Card
Used for content containers, summary cards, data sections.

```tsx
import { Card, CardHeader, CardContent } from '@/components/ui/Card'

<Card variant="default">
  <CardHeader>Title</CardHeader>
  <CardContent>Content</CardContent>
</Card>
```

**Variants:**
- `default` - White background, standard border
- `accent` - Orange gradient, accent border (for summaries)
- `surface` - Gray surface, subtle border

### Badge
Status indicators, labels, category markers.

```tsx
import { Badge } from '@/components/ui/Badge'

<Badge variant="income" withDot>Income</Badge>
<Badge variant="expenses" size="sm">Expenses</Badge>
```

**Variants:** default, success, error, warning, info, income, expenses, overheads

---

## 🎯 Layout Dimensions

### Sidebar
- **Width**: 260px
- **Background**: Gradient from brown to tan to white
- **Border**: 1px orange right border

### Header
- **Height**: 64px
- **Background**: White 80% opacity with 4px blur
- **Padding**: 24px right, 16px top/bottom

### Max Content Width
- **Width**: 1152px (max-w-6xl in Tailwind)
- **Padding**: Centered in viewport

---

## ⚡ Patterns & Best Practices

### Color Usage
- Use `--color-primary` for interactive elements and emphasis
- Use `--color-brown` for dark text and backgrounds
- Use semantic colors (success, error, warning) for status
- Use gradient cards (`variant="accent"`) for summary sections

### Typography
- Section headers: `text-xs font-bold uppercase tracking-wider`
- Body text: `text-base font-normal`
- Interactive labels: `text-sm font-semibold uppercase tracking-widest`
- Headings: `text-2xl font-bold`

### Spacing
- Card padding: `p-6` (24px)
- Section gaps: `gap-6` (24px)
- Element gaps: `gap-3` (12px)
- Compact elements: `gap-1` (4px)

### Borders
- Use `border-lp-border` for standard borders
- Use `border-lp-orange` with opacity for accent borders
- Border width: `1px` for most elements

---

## 🔄 Theme Extension (Future)

For dark mode support, use CSS custom properties defined in `src/lib/theme.ts`:
- Colors automatically map to Tailwind classes (e.g., `--color-primary` → `bg-[var(--color-primary)]`)
- Dark mode will override these variables in `:root[data-theme="dark"]`

---

## 📚 Resources

- Theme definitions: `src/lib/theme.ts`
- UI Components: `src/components/ui/`
- Component usage examples: See Budget page implementation

---

## 🚀 Implementation Checklist

- [x] Theme system established
- [x] Core colors defined
- [x] Typography system defined
- [x] Spacing system defined
- [x] Card component created
- [x] Badge component created
- [ ] Button component
- [ ] Input component
- [ ] Table wrapper
- [ ] Navigation components
- [ ] Form components
