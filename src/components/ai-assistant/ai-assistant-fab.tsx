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
