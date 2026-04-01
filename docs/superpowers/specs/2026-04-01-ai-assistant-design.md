# AI Assistant — Natural Language Expense Entry

**Date:** 2026-04-01
**Status:** Approved
**Phase:** 1 (Expense Creation) — Phase 2 (Group Creation) stubbed

---

## Overview

A global AI assistant that allows users to add expenses (and later create groups) using natural language — either typed or spoken. The assistant is accessible from anywhere in the app via a floating action button (FAB) and uses a two-stage LangChain pipeline powered by Claude Haiku to parse intent and extract structured data.

---

## Goals

- Allow users to create expenses by speaking or typing naturally (e.g., *"I paid $45 for dinner, split evenly with John and Sara"*)
- Keep the architecture scalable so new intents (group creation, etc.) can be added with minimal changes
- Follow existing codebase conventions (feature flags, tRPC mutations, co-located server actions)
- Use LangChain with Anthropic (`@langchain/anthropic`) instead of OpenAI

---

## Non-Goals (Phase 1)

- Group creation (stubbed, Phase 2)
- Multi-turn clarification conversations (possible future extension with LangGraph)
- Editing or deleting existing expenses via AI
- Streaming responses

---

## Architecture

### Entry Point

A floating action button (FAB) is rendered in the root layout (`src/app/layout.tsx`), bottom-right corner. It is visible on all pages and gated behind the `enableAiAssistant` feature flag. It is hidden on the expense creation form page to avoid confusion with manual entry.

The FAB is route-aware: it reads the current URL to determine whether the user is inside a group (`/groups/[groupId]/...`) and passes the `groupId` as context to the AI pipeline.

### Data Flow

```
User types or speaks
       ↓
Web Speech API (voice) → populates text field
       ↓
"Parse" button → Server Action (ai-assistant-actions.ts)
       ↓
Stage 1 — Intent Router Chain
  ChatPromptTemplate + ChatAnthropic (claude-haiku-4-5-20251001) + StructuredOutputParser
  Output: { intent: 'CREATE_EXPENSE' | 'CREATE_GROUP' | 'UNKNOWN', confidence: number }
       ↓
Stage 2 — Intent-specific Extraction Chain
  ChatPromptTemplate (with group context) + ChatAnthropic (claude-haiku-4-5-20251001) + StructuredOutputParser
  Output: parsed expense object (Zod schema)
       ↓
Confirmation Card rendered inside modal
       ↓
User reviews, edits if needed, confirms
       ↓
Existing createGroupExpense tRPC mutation
       ↓
Modal closes, expense list refreshes
```

### Context Sent to Every Parse Request

- Current `groupId` (if user is inside a group)
- All groups the user has access to (id + name)
- Participants of the current group (id + name)
- Categories list (id + name)
- Group's default currency
- Today's date (for resolving relative dates like "yesterday")
- Current user's participant ID (to resolve "I", "me", "myself")

---

## LangChain Pipeline

### Stage 1: Intent Router (`src/lib/ai/chains/intent-router.ts`)

Classifies the user's input into a known intent.

**Output schema:**
```ts
z.object({
  intent: z.enum(['CREATE_EXPENSE', 'CREATE_GROUP', 'UNKNOWN']),
  confidence: z.number().min(0).max(1),
})
```

If `intent` is `UNKNOWN` or `confidence < 0.7`, the modal displays a friendly error: *"I didn't understand that. Try something like: 'I paid $45 for dinner, split with John and Sara.'"*

### Stage 2: Expense Extraction (`src/lib/ai/chains/create-expense.chain.ts`)

Extracts all expense fields from the input text, using the group context to resolve participant names and categories.

**Output schema (`src/lib/ai/schemas/create-expense.schema.ts`):**
```ts
z.object({
  title: z.string(),
  amount: z.number(),
  paidById: z.string(),
  paidFor: z.array(z.object({
    participantId: z.string(),
    shares: z.number().default(1),
  })),
  splitMode: z.enum(['EVENLY', 'BY_SHARES', 'BY_PERCENTAGE', 'BY_AMOUNT']).default('EVENLY'),
  categoryId: z.number().default(0),
  expenseDate: z.string(),        // ISO date string
  notes: z.string().optional(),
  groupId: z.string().optional(), // resolved from route context; user selects on confirmation card if absent
})
```

Fields the AI cannot confidently extract are returned as `null`. The confirmation card highlights these fields in amber, prompting the user to fill them before confirming.

### Phase 2 Stubs

- `src/lib/ai/chains/create-group.chain.ts` — stubbed, not implemented
- `src/lib/ai/schemas/create-group.schema.ts` — stubbed, not implemented

---

## UI/UX

### Floating Action Button

- Bottom-right corner, all pages
- Sparkle/wand icon to distinguish from the existing "+" button
- Hidden on the expense creation form page

### AI Assistant Modal

Bottom sheet on mobile, centered modal on desktop.

```
┌─────────────────────────────────┐
│  AI Assistant           [✕]     │
│─────────────────────────────────│
│  ┌───────────────────────────┐  │
│  │ "I paid $45 for dinner,   │  │
│  │  split with John & Sara"  │  │
│  └───────────────────────────┘  │
│  [🎤 Hold to speak]  [Parse →]  │
└─────────────────────────────────┘
```

- Text area is pre-focused on open
- Mic button: hold to record via Web Speech API, releases and populates text field
- "Parse" sends to server action with loading spinner while chain runs

### Confirmation Card

Rendered inside the modal after successful parsing.

```
┌─────────────────────────────────┐
│  ✓ Here's what I understood     │
│─────────────────────────────────│
│  Group       [Rome Trip ▾]      │
│  Title       Dinner             │
│  Amount      $45.00             │
│  Paid by     [You ▾]            │
│  Split with  [John ✕] [Sara ✕]  │
│  Split mode  Evenly             │
│  Date        Today              │
│  Category    Food               │
│─────────────────────────────────│
│  [Try again]      [Add Expense] │
└─────────────────────────────────┘
```

- Every field is editable inline
- Group dropdown always shown; pre-selected if user is inside a group, required if not
- Changing the group reloads the participant list for "Paid by" and "Split with"
- Fields the AI could not extract are highlighted in amber
- "Try again" clears back to the input
- "Add Expense" is disabled until all required fields are filled

---

## File Structure

```
src/components/
  ai-assistant/
    ai-assistant-fab.tsx               ← floating button added to root layout
    ai-assistant-modal.tsx             ← modal with text input + voice input
    ai-assistant-actions.ts            ← server action ('use server')
    confirmation-cards/
      expense-confirmation-card.tsx    ← Phase 1
      group-confirmation-card.tsx      ← Phase 2 stub

src/lib/ai/
  chains/
    intent-router.ts
    create-expense.chain.ts
    create-group.chain.ts              ← Phase 2 stub
  schemas/
    create-expense.schema.ts
    create-group.schema.ts             ← Phase 2 stub
```

---

## Server Action

**File:** `src/components/ai-assistant/ai-assistant-actions.ts`

```ts
async function parseNaturalLanguageInput(input: {
  text: string
  groupId?: string
  groups: { id: string; name: string }[]
  participants: { id: string; name: string }[]
  categories: { id: number; name: string }[]
  currency: string
  today: string
  currentUserId: string
}): Promise<ParsedExpenseResult | UnknownIntentResult>
```

Runs Stage 1 and Stage 2 chains sequentially. Returns the parsed result or an unknown intent signal.

---

## Feature Flag & Environment Variables

**`src/lib/featureFlags.ts`** — new flag:
```ts
enableAiAssistant: process.env.NEXT_PUBLIC_ENABLE_AI_ASSISTANT === 'true'
```

**New env vars (`.env.example`):**
```
NEXT_PUBLIC_ENABLE_AI_ASSISTANT=false
ANTHROPIC_API_KEY=
```

**New package:**
```
@langchain/core
@langchain/anthropic
langchain
```

---

## Voice Input

- Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`)
- Hold-to-record on the mic button; result populates the text field on release
- No fallback (browser support message shown if API unavailable)
- Compatible with Capacitor for future Google Play Store distribution

---

## Testing

**Unit tests** (`src/lib/ai/`):
- Each chain tested with mocked `ChatAnthropic` responses
- Zod output schemas tested with valid and malformed AI outputs
- Edge cases: ambiguous participant names, missing amount, unrecognized intent, relative dates

No end-to-end AI tests (would require real API calls). The editable confirmation card is the production safety net for AI misparses.

---

## Future Extensions

- **Phase 2:** Group creation intent (`CREATE_GROUP`)
- **Multi-turn clarification:** Replace single-turn chain with LangGraph for back-and-forth when input is ambiguous
- **Capacitor native mic:** Replace Web Speech API with Capacitor microphone plugin for better mobile quality
- **Subscription gating:** Gate `enableAiAssistant` behind a paid tier for the Google Play Store release
