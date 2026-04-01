# AI Assistant — Natural Language Expense Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global floating AI assistant button that lets users create expenses by typing or speaking naturally, using a two-stage LangChain pipeline (intent detection → expense extraction) powered by Claude Haiku, with a confirmation card before saving.

**Architecture:** A floating action button (FAB) in the root layout opens a modal with a text input and mic button (Web Speech API). On "Parse", a Next.js server action runs two sequential LangChain chains (intent router → expense extractor) using `@langchain/anthropic`. The result populates an editable confirmation card; confirming calls the existing `createGroupExpense` tRPC mutation. Rate limiting is IP-based via a new `AiRequestLog` Prisma model.

**Tech Stack:** LangChain (`langchain`, `@langchain/core`, `@langchain/anthropic`), Claude Haiku (`claude-haiku-4-5-20251001`), Zod, Prisma/PostgreSQL, tRPC, Next.js Server Actions, Web Speech API, Jest.

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `package.json` | Modify | Add LangChain packages |
| `.env.example` | Modify | Document new env vars |
| `src/lib/env.ts` | Modify | Validate new env vars |
| `src/lib/featureFlags.ts` | Modify | Add `enableAiAssistant` flag |
| `prisma/schema.prisma` | Modify | Add `AiRequestLog` model |
| `src/lib/ai/schemas/intent-router.schema.ts` | Create | Zod schema for intent router output |
| `src/lib/ai/schemas/create-expense.schema.ts` | Create | Zod schema for expense extraction output |
| `src/lib/ai/schemas/create-group.schema.ts` | Create | Phase 2 stub |
| `src/lib/ai/chains/intent-router.ts` | Create | LangChain intent classification chain |
| `src/lib/ai/chains/create-expense.chain.ts` | Create | LangChain expense extraction chain |
| `src/lib/ai/chains/create-group.chain.ts` | Create | Phase 2 stub |
| `src/components/ai-assistant/ai-assistant-actions.ts` | Create | Server action: validate → rate-limit → chain pipeline |
| `src/components/ai-assistant/confirmation-cards/expense-confirmation-card.tsx` | Create | Editable confirmation card + tRPC mutation |
| `src/components/ai-assistant/confirmation-cards/group-confirmation-card.tsx` | Create | Phase 2 stub |
| `src/components/ai-assistant/ai-assistant-modal.tsx` | Create | Modal with text + voice input |
| `src/components/ai-assistant/ai-assistant-fab.tsx` | Create | Floating action button |
| `src/app/layout.tsx` | Modify | Mount FAB inside `Content` component |

---

## Task 1: Install LangChain packages and configure environment

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `.env.example`
- Modify: `src/lib/env.ts`
- Modify: `src/lib/featureFlags.ts`

- [ ] **Step 1: Install LangChain packages**

```bash
npm install langchain @langchain/core @langchain/anthropic
```

Expected output: packages added successfully, no peer dependency errors.

- [ ] **Step 2: Add new env vars to `.env.example`**

Add these three lines at the end of `.env.example`:

```
NEXT_PUBLIC_ENABLE_AI_ASSISTANT=false
ANTHROPIC_API_KEY=
AI_RATE_LIMIT_PER_USER_PER_DAY=20
```

- [ ] **Step 3: Add new env vars to `src/lib/env.ts`**

In the `envSchema` object, add after the `OPENAI_API_KEY` line:

```typescript
NEXT_PUBLIC_ENABLE_AI_ASSISTANT: z.preprocess(
  interpretEnvVarAsBool,
  z.boolean().default(false),
),
ANTHROPIC_API_KEY: z.string().optional(),
AI_RATE_LIMIT_PER_USER_PER_DAY: z.coerce.number().int().positive().default(20),
```

In the `.superRefine` callback, add after the existing OpenAI check:

```typescript
if (env.NEXT_PUBLIC_ENABLE_AI_ASSISTANT && !env.ANTHROPIC_API_KEY) {
  ctx.addIssue({
    code: ZodIssueCode.custom,
    message:
      'If NEXT_PUBLIC_ENABLE_AI_ASSISTANT is specified, then ANTHROPIC_API_KEY must be specified too',
  })
}
```

- [ ] **Step 4: Add `enableAiAssistant` flag to `src/lib/featureFlags.ts`**

Add the new flag to the returned object inside `getRuntimeFeatureFlags`:

```typescript
enableAiAssistant: env.NEXT_PUBLIC_ENABLE_AI_ASSISTANT,
```

- [ ] **Step 5: Verify TypeScript still compiles**

```bash
npm run check-types
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .env.example src/lib/env.ts src/lib/featureFlags.ts
git commit -m "feat: install langchain and add AI assistant env config"
```

---

## Task 2: Add AiRequestLog Prisma model for rate limiting

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the `AiRequestLog` model to `prisma/schema.prisma`**

Append at the end of the file:

```prisma
model AiRequestLog {
  id        String   @id @default(cuid())
  userId    String
  createdAt DateTime @default(now())

  @@index([userId, createdAt])
}
```

- [ ] **Step 2: Run the migration**

```bash
npx prisma migrate dev --name add-ai-request-log
```

Expected: migration file created and applied, Prisma client regenerated.

- [ ] **Step 3: Verify Prisma client has the new model**

```bash
npx prisma generate
```

Expected: no errors, `PrismaClient` now exposes `prisma.aiRequestLog`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add AiRequestLog model for AI rate limiting"
```

---

## Task 3: TDD — Intent Router Zod schema

**Files:**
- Create: `src/lib/ai/schemas/intent-router.schema.ts`
- Test: `src/lib/ai/schemas/intent-router.schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/schemas/intent-router.schema.test.ts`:

```typescript
import { intentRouterOutputSchema } from './intent-router.schema'

describe('intentRouterOutputSchema', () => {
  it('accepts a valid CREATE_EXPENSE intent', () => {
    const result = intentRouterOutputSchema.safeParse({
      intent: 'CREATE_EXPENSE',
      confidence: 0.95,
    })
    expect(result.success).toBe(true)
  })

  it('accepts a valid CREATE_GROUP intent', () => {
    const result = intentRouterOutputSchema.safeParse({
      intent: 'CREATE_GROUP',
      confidence: 0.8,
    })
    expect(result.success).toBe(true)
  })

  it('accepts UNKNOWN intent', () => {
    const result = intentRouterOutputSchema.safeParse({
      intent: 'UNKNOWN',
      confidence: 0.3,
    })
    expect(result.success).toBe(true)
  })

  it('rejects an unrecognised intent value', () => {
    const result = intentRouterOutputSchema.safeParse({
      intent: 'DELETE_EXPENSE',
      confidence: 0.9,
    })
    expect(result.success).toBe(false)
  })

  it('rejects confidence above 1', () => {
    const result = intentRouterOutputSchema.safeParse({
      intent: 'CREATE_EXPENSE',
      confidence: 1.5,
    })
    expect(result.success).toBe(false)
  })

  it('rejects confidence below 0', () => {
    const result = intentRouterOutputSchema.safeParse({
      intent: 'CREATE_EXPENSE',
      confidence: -0.1,
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing confidence', () => {
    const result = intentRouterOutputSchema.safeParse({
      intent: 'CREATE_EXPENSE',
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npx jest src/lib/ai/schemas/intent-router.schema.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module './intent-router.schema'`

- [ ] **Step 3: Create the schema**

Create `src/lib/ai/schemas/intent-router.schema.ts`:

```typescript
import { z } from 'zod'

export const intentRouterOutputSchema = z.object({
  intent: z.enum(['CREATE_EXPENSE', 'CREATE_GROUP', 'UNKNOWN']),
  confidence: z.number().min(0).max(1),
})

export type IntentRouterOutput = z.infer<typeof intentRouterOutputSchema>
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npx jest src/lib/ai/schemas/intent-router.schema.test.ts --no-coverage
```

Expected: PASS — 7 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/schemas/intent-router.schema.ts src/lib/ai/schemas/intent-router.schema.test.ts
git commit -m "feat: add intent router output Zod schema with tests"
```

---

## Task 4: TDD — Expense Extraction Zod schema

**Files:**
- Create: `src/lib/ai/schemas/create-expense.schema.ts`
- Test: `src/lib/ai/schemas/create-expense.schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/schemas/create-expense.schema.test.ts`:

```typescript
import { createExpenseOutputSchema } from './create-expense.schema'

describe('createExpenseOutputSchema', () => {
  it('accepts a fully populated expense', () => {
    const result = createExpenseOutputSchema.safeParse({
      title: 'Dinner',
      amount: 45,
      paidById: 'participant-1',
      paidFor: [
        { participantId: 'participant-1', shares: 1 },
        { participantId: 'participant-2', shares: 1 },
      ],
      splitMode: 'EVENLY',
      categoryId: 3,
      expenseDate: '2026-04-01',
      notes: 'Anniversary dinner',
      groupId: 'group-abc',
    })
    expect(result.success).toBe(true)
  })

  it('defaults splitMode to EVENLY', () => {
    const result = createExpenseOutputSchema.parse({
      title: 'Coffee',
      amount: 5,
      paidById: 'participant-1',
      paidFor: [{ participantId: 'participant-1', shares: 1 }],
      expenseDate: '2026-04-01',
    })
    expect(result.splitMode).toBe('EVENLY')
  })

  it('defaults categoryId to 0', () => {
    const result = createExpenseOutputSchema.parse({
      title: 'Coffee',
      amount: 5,
      paidById: 'participant-1',
      paidFor: [{ participantId: 'participant-1', shares: 1 }],
      expenseDate: '2026-04-01',
    })
    expect(result.categoryId).toBe(0)
  })

  it('defaults shares to 1 in paidFor', () => {
    const result = createExpenseOutputSchema.parse({
      title: 'Coffee',
      amount: 5,
      paidById: 'participant-1',
      paidFor: [{ participantId: 'participant-1' }],
      expenseDate: '2026-04-01',
    })
    expect(result.paidFor[0].shares).toBe(1)
  })

  it('accepts null for fields the AI could not extract', () => {
    const result = createExpenseOutputSchema.safeParse({
      title: 'Dinner',
      amount: 45,
      paidById: null,
      paidFor: [],
      expenseDate: null,
    })
    expect(result.success).toBe(true)
  })

  it('rejects an invalid splitMode value', () => {
    const result = createExpenseOutputSchema.safeParse({
      title: 'Dinner',
      amount: 45,
      paidById: 'participant-1',
      paidFor: [],
      splitMode: 'BY_MAGIC',
      expenseDate: '2026-04-01',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing title', () => {
    const result = createExpenseOutputSchema.safeParse({
      amount: 45,
      paidById: 'participant-1',
      paidFor: [],
      expenseDate: '2026-04-01',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing amount', () => {
    const result = createExpenseOutputSchema.safeParse({
      title: 'Dinner',
      paidById: 'participant-1',
      paidFor: [],
      expenseDate: '2026-04-01',
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npx jest src/lib/ai/schemas/create-expense.schema.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module './create-expense.schema'`

- [ ] **Step 3: Create the schema**

Create `src/lib/ai/schemas/create-expense.schema.ts`:

```typescript
import { z } from 'zod'

export const createExpenseOutputSchema = z.object({
  title: z.string(),
  amount: z.number(),
  paidById: z.string().nullable(),
  paidFor: z.array(
    z.object({
      participantId: z.string(),
      shares: z.number().positive().default(1),
    }),
  ),
  splitMode: z
    .enum(['EVENLY', 'BY_SHARES', 'BY_PERCENTAGE', 'BY_AMOUNT'])
    .default('EVENLY'),
  categoryId: z.number().int().default(0),
  expenseDate: z.string().nullable(),
  notes: z.string().nullable().optional(),
  groupId: z.string().nullable().optional(),
})

export type CreateExpenseOutput = z.infer<typeof createExpenseOutputSchema>
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npx jest src/lib/ai/schemas/create-expense.schema.test.ts --no-coverage
```

Expected: PASS — 8 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/schemas/create-expense.schema.ts src/lib/ai/schemas/create-expense.schema.test.ts
git commit -m "feat: add expense extraction output Zod schema with tests"
```

---

## Task 5: TDD — Intent Router Chain

**Files:**
- Create: `src/lib/ai/chains/intent-router.ts`
- Test: `src/lib/ai/chains/intent-router.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/chains/intent-router.test.ts`:

```typescript
import { RunnableLambda } from '@langchain/core/runnables'
import { detectIntent } from './intent-router'

// Bypass env validation for tests
jest.mock('@/lib/env', () => ({
  env: { ANTHROPIC_API_KEY: 'test-key', AI_RATE_LIMIT_PER_USER_PER_DAY: 20 },
}))

function makeMockModel(responseJson: object) {
  return RunnableLambda.from(async () => ({
    content: JSON.stringify(responseJson),
  }))
}

describe('detectIntent', () => {
  it('returns CREATE_EXPENSE intent for an expense message', async () => {
    const mockModel = makeMockModel({ intent: 'CREATE_EXPENSE', confidence: 0.95 })
    const result = await detectIntent('I paid $45 for dinner with John', mockModel)
    expect(result.intent).toBe('CREATE_EXPENSE')
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })

  it('returns CREATE_GROUP intent for a group creation message', async () => {
    const mockModel = makeMockModel({ intent: 'CREATE_GROUP', confidence: 0.9 })
    const result = await detectIntent('Create a group called Trip to Paris', mockModel)
    expect(result.intent).toBe('CREATE_GROUP')
  })

  it('returns UNKNOWN for an unrecognised message', async () => {
    const mockModel = makeMockModel({ intent: 'UNKNOWN', confidence: 0.2 })
    const result = await detectIntent('What is the weather today?', mockModel)
    expect(result.intent).toBe('UNKNOWN')
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npx jest src/lib/ai/chains/intent-router.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module './intent-router'`

- [ ] **Step 3: Create the intent router chain**

Create `src/lib/ai/chains/intent-router.ts`:

```typescript
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { Runnable } from '@langchain/core/runnables'
import { env } from '@/lib/env'
import { StructuredOutputParser } from 'langchain/output_parsers'
import {
  intentRouterOutputSchema,
  IntentRouterOutput,
} from '../schemas/intent-router.schema'

const SYSTEM_PROMPT = `You are an intent classifier for an expense-sharing app called Spliit.
Classify the user's message into exactly one of these intents:
- CREATE_EXPENSE: The user wants to log a shared expense (e.g. "I paid $45 for dinner with John")
- CREATE_GROUP: The user wants to create a new expense group (e.g. "Create a group called Rome Trip")
- UNKNOWN: The message does not match any supported action

{format_instructions}`

export async function detectIntent(
  input: string,
  model?: Runnable,
): Promise<IntentRouterOutput> {
  const parser = StructuredOutputParser.fromZodSchema(intentRouterOutputSchema)

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', SYSTEM_PROMPT],
    ['human', '{input}'],
  ])

  const chatModel =
    model ??
    new ChatAnthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 512,
    })

  const chain = prompt.pipe(chatModel).pipe(parser)

  return chain.invoke({
    input,
    format_instructions: parser.getFormatInstructions(),
  })
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npx jest src/lib/ai/chains/intent-router.test.ts --no-coverage
```

Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/chains/intent-router.ts src/lib/ai/chains/intent-router.test.ts
git commit -m "feat: add intent router LangChain chain with tests"
```

---

## Task 6: TDD — Expense Extraction Chain

**Files:**
- Create: `src/lib/ai/chains/create-expense.chain.ts`
- Test: `src/lib/ai/chains/create-expense.chain.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/chains/create-expense.chain.test.ts`:

```typescript
import { RunnableLambda } from '@langchain/core/runnables'
import { extractExpense, ExpenseExtractionInput } from './create-expense.chain'

jest.mock('@/lib/env', () => ({
  env: { ANTHROPIC_API_KEY: 'test-key', AI_RATE_LIMIT_PER_USER_PER_DAY: 20 },
}))

function makeMockModel(responseJson: object) {
  return RunnableLambda.from(async () => ({
    content: JSON.stringify(responseJson),
  }))
}

const baseInput: ExpenseExtractionInput = {
  text: 'I paid $45 for dinner, split evenly with Sara',
  participants: [
    { id: 'p1', name: 'John' },
    { id: 'p2', name: 'Sara' },
  ],
  categories: [{ id: 1, name: 'Food' }, { id: 2, name: 'Transport' }],
  currency: 'USD',
  today: '2026-04-01',
  currentUserId: 'p1',
}

describe('extractExpense', () => {
  it('returns a parsed expense object', async () => {
    const mockModel = makeMockModel({
      title: 'Dinner',
      amount: 45,
      paidById: 'p1',
      paidFor: [
        { participantId: 'p1', shares: 1 },
        { participantId: 'p2', shares: 1 },
      ],
      splitMode: 'EVENLY',
      categoryId: 1,
      expenseDate: '2026-04-01',
      notes: null,
      groupId: null,
    })
    const result = await extractExpense(baseInput, mockModel)
    expect(result.title).toBe('Dinner')
    expect(result.amount).toBe(45)
    expect(result.paidById).toBe('p1')
    expect(result.paidFor).toHaveLength(2)
    expect(result.splitMode).toBe('EVENLY')
  })

  it('returns null for fields the AI could not extract', async () => {
    const mockModel = makeMockModel({
      title: 'Unknown expense',
      amount: 20,
      paidById: null,
      paidFor: [],
      expenseDate: null,
    })
    const result = await extractExpense(baseInput, mockModel)
    expect(result.paidById).toBeNull()
    expect(result.expenseDate).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npx jest src/lib/ai/chains/create-expense.chain.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module './create-expense.chain'`

- [ ] **Step 3: Create the expense extraction chain**

Create `src/lib/ai/chains/create-expense.chain.ts`:

```typescript
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { Runnable } from '@langchain/core/runnables'
import { env } from '@/lib/env'
import { StructuredOutputParser } from 'langchain/output_parsers'
import {
  createExpenseOutputSchema,
  CreateExpenseOutput,
} from '../schemas/create-expense.schema'

const SYSTEM_PROMPT = `You are an expense parser for a shared expense app called Spliit.
Extract structured expense information from the user's message.

Today's date: {today}
Group currency: {currency}
Current user participant ID (resolves "I", "me", "myself"): {currentUserId}

Available participants (JSON array):
{participants}

Available categories (JSON array):
{categories}

Rules:
- Match participant names case-insensitively; use their ID in the output
- "everyone" or "all" means include all participants in paidFor
- If a field cannot be determined, return null for that field
- amount must be a number in major currency units (e.g. 45.50 for $45.50)
- expenseDate must be ISO format YYYY-MM-DD; resolve relative dates using today's date
- Default splitMode is EVENLY unless the user specifies shares, percentages, or exact amounts

{format_instructions}`

export type ExpenseExtractionInput = {
  text: string
  participants: { id: string; name: string }[]
  categories: { id: number; name: string }[]
  currency: string
  today: string
  currentUserId: string
  groupId?: string
}

export async function extractExpense(
  input: ExpenseExtractionInput,
  model?: Runnable,
): Promise<CreateExpenseOutput> {
  const parser = StructuredOutputParser.fromZodSchema(createExpenseOutputSchema)

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', SYSTEM_PROMPT],
    ['human', '{text}'],
  ])

  const chatModel =
    model ??
    new ChatAnthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 512,
    })

  const chain = prompt.pipe(chatModel).pipe(parser)

  return chain.invoke({
    text: input.text,
    today: input.today,
    currency: input.currency,
    currentUserId: input.currentUserId,
    participants: JSON.stringify(input.participants),
    categories: JSON.stringify(input.categories),
    format_instructions: parser.getFormatInstructions(),
  })
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npx jest src/lib/ai/chains/create-expense.chain.test.ts --no-coverage
```

Expected: PASS — 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/chains/create-expense.chain.ts src/lib/ai/chains/create-expense.chain.test.ts
git commit -m "feat: add expense extraction LangChain chain with tests"
```

---

## Task 7: Phase 2 stubs

**Files:**
- Create: `src/lib/ai/schemas/create-group.schema.ts`
- Create: `src/lib/ai/chains/create-group.chain.ts`

- [ ] **Step 1: Create the group schema stub**

Create `src/lib/ai/schemas/create-group.schema.ts`:

```typescript
import { z } from 'zod'

// Phase 2: not yet implemented
export const createGroupOutputSchema = z.object({
  name: z.string(),
  currency: z.string().optional(),
  information: z.string().nullable().optional(),
})

export type CreateGroupOutput = z.infer<typeof createGroupOutputSchema>
```

- [ ] **Step 2: Create the group chain stub**

Create `src/lib/ai/chains/create-group.chain.ts`:

```typescript
// Phase 2: not yet implemented
export async function extractGroup(): Promise<never> {
  throw new Error('Group creation via AI is not yet implemented')
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/schemas/create-group.schema.ts src/lib/ai/chains/create-group.chain.ts
git commit -m "feat: add Phase 2 stubs for group creation chain"
```

---

## Task 8: TDD — Server action (rate limiting, validation, orchestration)

**Files:**
- Create: `src/components/ai-assistant/ai-assistant-actions.ts`
- Test: `src/components/ai-assistant/ai-assistant-actions.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/components/ai-assistant/ai-assistant-actions.test.ts`:

```typescript
// Must be before imports to mock modules
jest.mock('@/lib/env', () => ({
  env: {
    ANTHROPIC_API_KEY: 'test-key',
    AI_RATE_LIMIT_PER_USER_PER_DAY: 5,
    NEXT_PUBLIC_ENABLE_AI_ASSISTANT: true,
  },
}))

jest.mock('@/lib/ai/chains/intent-router', () => ({
  detectIntent: jest.fn(),
}))

jest.mock('@/lib/ai/chains/create-expense.chain', () => ({
  extractExpense: jest.fn(),
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    aiRequestLog: {
      count: jest.fn(),
      create: jest.fn(),
    },
  },
}))

jest.mock('next/headers', () => ({
  headers: jest.fn().mockResolvedValue(new Map([['x-forwarded-for', '127.0.0.1']])),
}))

import { parseNaturalLanguageInput } from './ai-assistant-actions'
import { detectIntent } from '@/lib/ai/chains/intent-router'
import { extractExpense } from '@/lib/ai/chains/create-expense.chain'
import { prisma } from '@/lib/prisma'

const mockDetectIntent = jest.mocked(detectIntent)
const mockExtractExpense = jest.mocked(extractExpense)
const mockCount = jest.mocked(prisma.aiRequestLog.count)
const mockCreate = jest.mocked(prisma.aiRequestLog.create)

const baseArgs = {
  text: 'I paid $45 for dinner with Sara',
  groups: [{ id: 'g1', name: 'Rome Trip' }],
  participants: [{ id: 'p1', name: 'John' }, { id: 'p2', name: 'Sara' }],
  categories: [{ id: 1, name: 'Food' }],
  currency: 'USD',
  today: '2026-04-01',
  currentUserId: 'p1',
}

beforeEach(() => {
  jest.clearAllMocks()
  mockCount.mockResolvedValue(0)
  mockCreate.mockResolvedValue({} as never)
})

describe('parseNaturalLanguageInput', () => {
  describe('input validation', () => {
    it('rejects empty input', async () => {
      const result = await parseNaturalLanguageInput({ ...baseArgs, text: '   ' })
      expect(result.type).toBe('error')
      if (result.type === 'error') expect(result.message).toMatch(/empty/i)
    })

    it('rejects input exceeding 500 characters', async () => {
      const result = await parseNaturalLanguageInput({
        ...baseArgs,
        text: 'a'.repeat(501),
      })
      expect(result.type).toBe('error')
      if (result.type === 'error') expect(result.message).toMatch(/too long/i)
    })
  })

  describe('rate limiting', () => {
    it('rejects requests when daily limit is exceeded', async () => {
      mockCount.mockResolvedValue(5) // at limit
      const result = await parseNaturalLanguageInput(baseArgs)
      expect(result.type).toBe('rate_limited')
    })

    it('logs the request on success', async () => {
      mockDetectIntent.mockResolvedValue({ intent: 'CREATE_EXPENSE', confidence: 0.9 })
      mockExtractExpense.mockResolvedValue({
        title: 'Dinner',
        amount: 45,
        paidById: 'p1',
        paidFor: [{ participantId: 'p1', shares: 1 }],
        splitMode: 'EVENLY',
        categoryId: 1,
        expenseDate: '2026-04-01',
        notes: null,
        groupId: null,
      })
      await parseNaturalLanguageInput(baseArgs)
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: '127.0.0.1' }) }),
      )
    })
  })

  describe('intent routing', () => {
    it('returns unknown_intent when confidence is below 0.7', async () => {
      mockDetectIntent.mockResolvedValue({ intent: 'CREATE_EXPENSE', confidence: 0.5 })
      const result = await parseNaturalLanguageInput(baseArgs)
      expect(result.type).toBe('unknown_intent')
    })

    it('returns unknown_intent for UNKNOWN intent', async () => {
      mockDetectIntent.mockResolvedValue({ intent: 'UNKNOWN', confidence: 0.9 })
      const result = await parseNaturalLanguageInput(baseArgs)
      expect(result.type).toBe('unknown_intent')
    })

    it('returns parsed expense for CREATE_EXPENSE intent', async () => {
      mockDetectIntent.mockResolvedValue({ intent: 'CREATE_EXPENSE', confidence: 0.95 })
      mockExtractExpense.mockResolvedValue({
        title: 'Dinner',
        amount: 45,
        paidById: 'p1',
        paidFor: [{ participantId: 'p1', shares: 1 }, { participantId: 'p2', shares: 1 }],
        splitMode: 'EVENLY',
        categoryId: 1,
        expenseDate: '2026-04-01',
        notes: null,
        groupId: null,
      })
      const result = await parseNaturalLanguageInput(baseArgs)
      expect(result.type).toBe('expense')
      if (result.type === 'expense') {
        expect(result.data.title).toBe('Dinner')
        expect(result.data.amount).toBe(45)
      }
    })
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npx jest src/components/ai-assistant/ai-assistant-actions.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module './ai-assistant-actions'`

- [ ] **Step 3: Check where `prisma` is exported from in this codebase**

```bash
grep -r "export.*prisma" src/lib/ --include="*.ts" -l
```

If `src/lib/prisma.ts` does not exist, check `src/lib/api.ts` for a `prisma` export. If prisma is instantiated inline in `src/lib/api.ts`, create `src/lib/prisma.ts`:

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 4: Create the server action**

Create `src/components/ai-assistant/ai-assistant-actions.ts`:

```typescript
'use server'

import { detectIntent } from '@/lib/ai/chains/intent-router'
import { extractExpense } from '@/lib/ai/chains/create-expense.chain'
import { CreateExpenseOutput } from '@/lib/ai/schemas/create-expense.schema'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { headers } from 'next/headers'

export type ParseResult =
  | { type: 'expense'; data: CreateExpenseOutput }
  | { type: 'unknown_intent' }
  | { type: 'rate_limited' }
  | { type: 'error'; message: string }

export type ParseNaturalLanguageInputArgs = {
  text: string
  groupId?: string
  groups: { id: string; name: string }[]
  participants: { id: string; name: string }[]
  categories: { id: number; name: string }[]
  currency: string
  today: string
  currentUserId: string
}

export async function parseNaturalLanguageInput(
  args: ParseNaturalLanguageInputArgs,
): Promise<ParseResult> {
  const { text, participants, categories, currency, today, currentUserId } = args

  // Input validation
  if (!text || text.trim().length === 0) {
    return { type: 'error', message: 'Input is empty' }
  }
  if (text.length > 500) {
    return { type: 'error', message: 'Input is too long (max 500 characters)' }
  }

  // Rate limiting by IP
  const headersList = await headers()
  const ip =
    headersList.get('x-forwarded-for') ??
    headersList.get('x-real-ip') ??
    'unknown'

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const requestCount = await prisma.aiRequestLog.count({
    where: { userId: ip, createdAt: { gte: dayAgo } },
  })

  if (requestCount >= env.AI_RATE_LIMIT_PER_USER_PER_DAY) {
    return { type: 'rate_limited' }
  }

  // Log request before calling the AI (prevents retries from bypassing the limit)
  await prisma.aiRequestLog.create({ data: { userId: ip } })

  // Stage 1: detect intent
  const { intent, confidence } = await detectIntent(
    text.trim().replace(/[\x00-\x1F\x7F]/g, ''),
  )

  if (intent === 'UNKNOWN' || confidence < 0.7) {
    return { type: 'unknown_intent' }
  }

  // Stage 2: extract structured data
  if (intent === 'CREATE_EXPENSE') {
    const data = await extractExpense({
      text,
      participants,
      categories,
      currency,
      today,
      currentUserId,
    })
    return { type: 'expense', data }
  }

  return { type: 'unknown_intent' }
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
npx jest src/components/ai-assistant/ai-assistant-actions.test.ts --no-coverage
```

Expected: PASS — all tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/components/ai-assistant/ai-assistant-actions.ts src/components/ai-assistant/ai-assistant-actions.test.ts
git commit -m "feat: add AI assistant server action with rate limiting and input validation"
```

---

## Task 9: Expense Confirmation Card

**Files:**
- Create: `src/components/ai-assistant/confirmation-cards/expense-confirmation-card.tsx`

The confirmation card is a client component that receives the parsed expense data, allows inline editing of all fields, and calls the existing `createGroupExpense` tRPC mutation on confirm.

- [ ] **Step 1: Read the existing `expenseFormSchema` to understand its exact shape**

```bash
grep -A 60 "expenseFormSchema" src/lib/schemas.ts
```

Note the field names — particularly `paidBy` (not `paidById`), `category` (not `categoryId`), and that `amount` is in dollars (the tRPC procedure stores as cents internally).

- [ ] **Step 2: Read how the existing tRPC mutation is called**

```bash
cat src/app/groups/\[groupId\]/expenses/create-expense-form.tsx
```

Note the exact `trpc.groups.expenses.create.useMutation()` call pattern and the shape of `expenseFormValues`.

- [ ] **Step 3: Create the confirmation card**

Create `src/components/ai-assistant/confirmation-cards/expense-confirmation-card.tsx`:

```typescript
'use client'

import { CreateExpenseOutput } from '@/lib/ai/schemas/create-expense.schema'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { trpc } from '@/trpc/client'
import { useState } from 'react'

type Participant = { id: string; name: string }
type Category = { id: number; name: string }
type Group = { id: string; name: string }

type Props = {
  parsed: CreateExpenseOutput
  groups: Group[]
  participants: Participant[]
  categories: Category[]
  defaultGroupId?: string
  onSuccess: () => void
  onRetry: () => void
}

export function ExpenseConfirmationCard({
  parsed,
  groups,
  participants,
  categories,
  defaultGroupId,
  onSuccess,
  onRetry,
}: Props) {
  const [groupId, setGroupId] = useState(parsed.groupId ?? defaultGroupId ?? '')
  const [title, setTitle] = useState(parsed.title)
  const [amount, setAmount] = useState(parsed.amount?.toString() ?? '')
  const [paidById, setPaidById] = useState(parsed.paidById ?? '')
  const [splitMode, setSplitMode] = useState(parsed.splitMode)
  const [expenseDate, setExpenseDate] = useState(parsed.expenseDate ?? '')
  const [categoryId, setCategoryId] = useState(parsed.categoryId.toString())

  const createExpense = trpc.groups.expenses.create.useMutation({
    onSuccess,
  })

  const isValid =
    groupId && title && amount && parseFloat(amount) > 0 && paidById && expenseDate

  function handleConfirm() {
    if (!isValid) return
    createExpense.mutate({
      groupId,
      expenseFormValues: {
        expenseDate: new Date(expenseDate),
        title,
        category: parseInt(categoryId, 10),
        amount: parseFloat(amount),
        paidBy: paidById,
        paidFor: parsed.paidFor.map((p) => ({
          participant: p.participantId,
          shares: p.shares,
        })),
        splitMode,
        isReimbursement: false,
        documents: [],
        recurrenceRule: 'NONE',
      },
    })
  }

  const amber = 'border-amber-400'

  return (
    <div className="space-y-3 mt-4">
      <p className="text-sm font-medium text-green-700 dark:text-green-400">
        ✓ Here&apos;s what I understood
      </p>

      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 items-center text-sm">
        <span className="text-muted-foreground">Group</span>
        <Select value={groupId} onValueChange={setGroupId}>
          <SelectTrigger className={!groupId ? amber : ''}>
            <SelectValue placeholder="Select group" />
          </SelectTrigger>
          <SelectContent>
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-muted-foreground">Title</span>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />

        <span className="text-muted-foreground">Amount</span>
        <Input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={!amount ? amber : ''}
        />

        <span className="text-muted-foreground">Paid by</span>
        <Select value={paidById} onValueChange={setPaidById}>
          <SelectTrigger className={!paidById ? amber : ''}>
            <SelectValue placeholder="Select participant" />
          </SelectTrigger>
          <SelectContent>
            {participants.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-muted-foreground">Split</span>
        <Select value={splitMode} onValueChange={(v) => setSplitMode(v as typeof splitMode)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="EVENLY">Evenly</SelectItem>
            <SelectItem value="BY_SHARES">By shares</SelectItem>
            <SelectItem value="BY_PERCENTAGE">By percentage</SelectItem>
            <SelectItem value="BY_AMOUNT">By amount</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-muted-foreground">Date</span>
        <Input
          type="date"
          value={expenseDate}
          onChange={(e) => setExpenseDate(e.target.value)}
          className={!expenseDate ? amber : ''}
        />

        <span className="text-muted-foreground">Category</span>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id.toString()}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Try again
        </Button>
        <Button
          size="sm"
          disabled={!isValid || createExpense.isPending}
          onClick={handleConfirm}
        >
          {createExpense.isPending ? 'Saving…' : 'Add Expense'}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run TypeScript check**

```bash
npm run check-types
```

Fix any type errors before continuing. Common issues:
- The `paidFor` shape in `expenseFormValues` — match exactly to what `expenseFormSchema` expects (check `src/lib/schemas.ts` for the exact field name: `participant` vs `participantId`)
- The tRPC hook path — verify it is `trpc.groups.expenses.create` by checking `src/trpc/routers/`

- [ ] **Step 5: Commit**

```bash
git add src/components/ai-assistant/confirmation-cards/expense-confirmation-card.tsx
git commit -m "feat: add expense confirmation card UI component"
```

---

## Task 10: Group Confirmation Card stub

**Files:**
- Create: `src/components/ai-assistant/confirmation-cards/group-confirmation-card.tsx`

- [ ] **Step 1: Create the stub**

Create `src/components/ai-assistant/confirmation-cards/group-confirmation-card.tsx`:

```typescript
'use client'

// Phase 2: not yet implemented
export function GroupConfirmationCard() {
  return (
    <p className="text-sm text-muted-foreground">
      Group creation via AI is coming soon.
    </p>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ai-assistant/confirmation-cards/group-confirmation-card.tsx
git commit -m "feat: add Phase 2 group confirmation card stub"
```

---

## Task 11: AI Assistant Modal

**Files:**
- Create: `src/components/ai-assistant/ai-assistant-modal.tsx`

The modal contains the text area, voice input (Web Speech API), parse button, loading state, and renders the confirmation card after a successful parse. It uses the Drawer component (already in `src/components/ui/drawer.tsx`) for mobile-friendly bottom sheet behaviour.

- [ ] **Step 1: Read the Drawer component to understand its API**

```bash
head -60 src/components/ui/drawer.tsx
```

Note the exported components: `Drawer`, `DrawerContent`, `DrawerHeader`, `DrawerTitle`, `DrawerFooter`.

- [ ] **Step 2: Read what tRPC queries exist for fetching groups and categories**

```bash
ls src/trpc/routers/
```

Find the query for listing groups (`groups.list` or similar) and for fetching categories (`categories.list`). These will be used to populate the group dropdown in the confirmation card.

- [ ] **Step 3: Create the modal**

Create `src/components/ai-assistant/ai-assistant-modal.tsx`:

```typescript
'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Mic, MicOff, Loader2 } from 'lucide-react'
import { parseNaturalLanguageInput } from './ai-assistant-actions'
import { ExpenseConfirmationCard } from './confirmation-cards/expense-confirmation-card'
import { trpc } from '@/trpc/client'
import type { ParseResult } from './ai-assistant-actions'

type Props = {
  open: boolean
  onClose: () => void
  groupId?: string
}

// Extend Window type for webkit prefix
declare global {
  interface Window {
    webkitSpeechRecognition: typeof SpeechRecognition
  }
}

export function AiAssistantModal({ open, onClose, groupId }: Props) {
  const [text, setText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [result, setResult] = useState<ParseResult | null>(null)
  const [speechSupported, setSpeechSupported] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  // Fetch data needed for confirmation card
  const { data: groupsData } = trpc.groups.list.useQuery()
  const { data: categoriesData } = trpc.categories.list.useQuery()
  const { data: groupData } = trpc.groups.get.useQuery(
    { groupId: groupId! },
    { enabled: !!groupId },
  )

  const groups = groupsData?.groups ?? []
  const participants = groupData?.group?.participants ?? []
  const categories = categoriesData?.categories ?? []

  useEffect(() => {
    setSpeechSupported(
      typeof window !== 'undefined' &&
        ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window),
    )
  }, [])

  function handleReset() {
    setText('')
    setResult(null)
  }

  function handleClose() {
    handleReset()
    onClose()
  }

  function startRecording() {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    const recognition = new SR()
    recognition.lang = navigator.language
    recognition.interimResults = false
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript
      setText((prev) => (prev ? `${prev} ${transcript}` : transcript))
    }
    recognition.onend = () => setIsRecording(false)
    recognition.start()
    recognitionRef.current = recognition
    setIsRecording(true)
  }

  function stopRecording() {
    recognitionRef.current?.stop()
    setIsRecording(false)
  }

  async function handleParse() {
    if (!text.trim()) return
    setIsParsing(true)
    setResult(null)
    try {
      const res = await parseNaturalLanguageInput({
        text,
        groupId,
        groups,
        participants,
        categories,
        currency: groupData?.group?.currency ?? 'USD',
        today: new Date().toISOString().split('T')[0],
        currentUserId: '',
      })
      setResult(res)
    } finally {
      setIsParsing(false)
    }
  }

  return (
    <Drawer open={open} onClose={handleClose}>
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader>
          <DrawerTitle>AI Assistant</DrawerTitle>
        </DrawerHeader>

        {result?.type === 'expense' ? (
          <ExpenseConfirmationCard
            parsed={result.data}
            groups={groups}
            participants={participants}
            categories={categories}
            defaultGroupId={groupId}
            onSuccess={handleClose}
            onRetry={handleReset}
          />
        ) : (
          <div className="space-y-3">
            <Textarea
              autoFocus
              placeholder='Try: "I paid $45 for dinner, split with John and Sara"'
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
            />

            {result?.type === 'error' && (
              <p className="text-sm text-destructive">{result.message}</p>
            )}
            {result?.type === 'unknown_intent' && (
              <p className="text-sm text-muted-foreground">
                I didn&apos;t understand that. Try: &quot;I paid $45 for dinner, split with John and Sara.&quot;
              </p>
            )}
            {result?.type === 'rate_limited' && (
              <p className="text-sm text-destructive">
                You&apos;ve reached your daily AI limit. Try again tomorrow.
              </p>
            )}

            <div className="flex gap-2">
              {speechSupported && (
                <Button
                  variant="outline"
                  size="sm"
                  onPointerDown={startRecording}
                  onPointerUp={stopRecording}
                  onPointerLeave={stopRecording}
                >
                  {isRecording ? (
                    <MicOff className="h-4 w-4 text-destructive" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                  <span className="ml-2">{isRecording ? 'Recording…' : 'Hold to speak'}</span>
                </Button>
              )}
              <Button
                className="ml-auto"
                size="sm"
                onClick={handleParse}
                disabled={!text.trim() || isParsing}
              >
                {isParsing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Parsing…
                  </>
                ) : (
                  'Parse →'
                )}
              </Button>
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}
```

- [ ] **Step 4: Verify the tRPC query names**

The modal uses `trpc.groups.list`, `trpc.groups.get`, and `trpc.categories.list`. Verify these exist:

```bash
ls src/trpc/routers/groups/
ls src/trpc/routers/
```

Adjust the query paths in the component to match what actually exists in the router.

- [ ] **Step 5: Run TypeScript check**

```bash
npm run check-types
```

Fix any errors — the most likely issue is the tRPC query paths or missing `Textarea` import (check `src/components/ui/` for the exact component name).

- [ ] **Step 6: Commit**

```bash
git add src/components/ai-assistant/ai-assistant-modal.tsx
git commit -m "feat: add AI assistant modal with text and voice input"
```

---

## Task 12: Floating Action Button + root layout wiring

**Files:**
- Create: `src/components/ai-assistant/ai-assistant-fab.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create the FAB component**

Create `src/components/ai-assistant/ai-assistant-fab.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AiAssistantModal } from './ai-assistant-modal'

export function AiAssistantFab() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Extract groupId from path /groups/[groupId]/...
  const groupIdMatch = pathname.match(/^\/groups\/([^/]+)/)
  const groupId = groupIdMatch?.[1]

  // Hide on the expense creation form to avoid confusion
  const isExpenseFormPage =
    pathname.includes('/expenses/create') || pathname.includes('/expenses/edit')

  if (isExpenseFormPage) return null

  return (
    <>
      <Button
        size="icon"
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
        aria-label="Open AI Assistant"
      >
        <Sparkles className="h-6 w-6" />
      </Button>

      <AiAssistantModal
        open={open}
        onClose={() => setOpen(false)}
        groupId={groupId}
      />
    </>
  )
}
```

- [ ] **Step 2: Add the FAB to `src/app/layout.tsx`**

In `src/app/layout.tsx`, add the import at the top with the other component imports:

```typescript
import { AiAssistantFab } from '@/components/ai-assistant/ai-assistant-fab'
import { getRuntimeFeatureFlags } from '@/lib/featureFlags'
```

Change the `Content` function signature to accept `enableAiAssistant`:

```typescript
function Content({
  children,
  enableAiAssistant,
}: {
  children: React.ReactNode
  enableAiAssistant: boolean
}) {
```

Add the FAB just before `<Toaster />` inside the `Content` component's return:

```typescript
{enableAiAssistant && <AiAssistantFab />}
<Toaster />
```

Change `RootLayout` to async and pass the flag to `Content`:

```typescript
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const messages = await getMessages()
  const { enableAiAssistant } = await getRuntimeFeatureFlags()
  return (
    <html lang={locale} suppressHydrationWarning>
      <ApplePwaSplash icon="/logo-with-text.png" color="#027756" />
      <body className="min-h-[100dvh] flex flex-col items-stretch bg-slate-50 bg-opacity-30 dark:bg-background">
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <Suspense>
              <ProgressBar />
            </Suspense>
            <Content enableAiAssistant={enableAiAssistant}>{children}</Content>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
npm run check-types
```

Expected: no errors.

- [ ] **Step 4: Start the dev server and manually verify the FAB appears**

```bash
npm run dev
```

- Open `http://localhost:3000`
- The FAB (sparkle button) should appear at the bottom-right only when `NEXT_PUBLIC_ENABLE_AI_ASSISTANT=true` in your `.env`
- Clicking it should open the modal
- The FAB should be hidden when visiting `/groups/[id]/expenses/create`

- [ ] **Step 5: Run all tests to confirm nothing is broken**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/ai-assistant/ai-assistant-fab.tsx src/app/layout.tsx
git commit -m "feat: add AI assistant FAB to root layout, gated by feature flag"
```

---

## Done

All 12 tasks complete. The AI assistant is now:

- Accessible globally via a sparkle FAB (hidden on expense form pages)
- Accepting text and voice input (Web Speech API, hold-to-speak)
- Running a two-stage Claude Haiku LangChain pipeline (intent → expense extraction)
- Showing an editable confirmation card before saving
- Rate-limited by IP (20 requests/day, configurable)
- Gated behind `NEXT_PUBLIC_ENABLE_AI_ASSISTANT=true`
- Extensible — adding group creation requires only a new chain, schema, and confirmation card

**To enable locally:**

```
# .env
NEXT_PUBLIC_ENABLE_AI_ASSISTANT=true
ANTHROPIC_API_KEY=your_anthropic_key_here
AI_RATE_LIMIT_PER_USER_PER_DAY=20
```
