import { createFileRoute } from '@tanstack/react-router'

import { TestModule } from '@/features/test-module'

export const Route = createFileRoute('/_authenticated/test-module/')({
  component: TestModule,
})
