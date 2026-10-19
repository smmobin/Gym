import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { TrialPublicPage } from './TrialPublicPage'

describe('TrialPublicPage', () => {
  it('shows public trial form without auth', () => {
    render(
      <MemoryRouter>
        <TrialPublicPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'درخواست جلسه آزمایشی' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ارسال درخواست' })).toBeInTheDocument()
    expect(screen.getByText(/عضویت خودکار ساخته نمی‌شود/)).toBeInTheDocument()
  })
})
