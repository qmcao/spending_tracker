# Spending Tracker

Single-page web app for fast manual entry of transactions across two banks and three cards (two credit, one debit).

## MVP feature goals

1. **Transaction capture**
   - Inputs: date (defaults to today), amount, category, card (bank + credit/debit), optional memo.
   - Quick category chips (editable at runtime) plus an “add custom category” action stored locally.
   - Form spacing tuned for thumb reach on mobile.
2. **History display**
   - Grouped by day inside collapsible monthly sections.
   - Card badges show which bank/card handled the spend; edit/delete for every row.
   - Category filter to narrow the list when zeroing in on a specific budget bucket.
3. **Summary insights**
   - Hero totals: current month + credit vs debit spend to quickly gauge payoff needs.
   - Category pie chart per month with legend, driven entirely by local data.
4. **Persistence**
   - Offline-ready using `localStorage`, with JSON export/import to move between devices/backups.

## Visual direction

- Palette: blush pink (#FADDEA), dusty rose (#E7A5C1), lavender (#C9B7FF), creamy white (#FFF8F9), charcoal text for contrast.
- Rounded cards, soft shadows, playful serif headings (e.g., "Playfair Display") paired with clean sans body (e.g., "Inter").
- Large tap targets (>44px) for buttons and keypad; sticky footer bar so entry controls always reachable on phone.

## Architecture overview

- Plain HTML + CSS + vanilla JS; no build tooling so it can be hosted on GitHub Pages.
- All logic in `app.js`, styles in `styles.css`. Assets self-hosted (Google Fonts via `<link>`).
- Data schema:

```ts
type CardId = 'bankA-credit' | 'bankB-credit' | 'bankA-debit';

interface Transaction {
  id: string;
  date: string; // ISO yyyy-mm-dd
  amount: number; // cents
  category: string;
  memo?: string;
  cardId: CardId;
  cleared?: boolean; // legacy flag, default true
  createdAt: number;
}
```

## Next steps

1. Scaffold static files (`index.html`, `styles.css`, `app.js`).
2. Implement UI + interactions per spec above.
3. Test on mobile viewport, refine aesthetics, and document usage.
