# Spending Tracker

Single-page web app for fast manual entry of transactions across two banks and three cards (two credit, one debit).

## MVP feature goals

1. **Transaction capture**
   - Inputs: date (defaults to today), amount, category, card (bank + credit/debit), optional memo, toggle for `cleared` (to indicate whether money has left account).
   - Quick category buttons for frequent categories.
   - Amount keypad for painless entry on mobile.
2. **History display**
   - Grouped by day with totals.
   - Inline badges for card + status so user can tell what is pending.
   - Edit/delete actions per entry.
3. **Summary insights**
   - Totals per card and per status (pending vs cleared).
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
  id: string; // uuid
  date: string; // ISO yyyy-mm-dd
  amount: number; // cents
  category: string;
  memo?: string;
  cardId: CardId;
  cleared: boolean;
  createdAt: number;
}
```

## Next steps

1. Scaffold static files (`index.html`, `styles.css`, `app.js`).
2. Implement UI + interactions per spec above.
3. Test on mobile viewport, refine aesthetics, and document usage.
