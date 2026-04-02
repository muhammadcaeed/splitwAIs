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
        saveDefaultSplittingOptions: false,
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
