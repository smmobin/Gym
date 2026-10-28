import { describe, expect, it } from 'vitest'

import { workoutPlansTableHtml } from '../assets/js/workouts.js'

describe('workout plans table', () => {
  it('renders empty state when there are no plans', () => {
    const html = workoutPlansTableHtml([], { canWrite: true })
    expect(html).toContain('workout-plans-empty')
    expect(html).toContain('هنوز برنامه‌ای')
    expect(html).not.toContain('<table')
  })

  it('renders a responsive table with title, preview, trainer, and edit action', () => {
    const html = workoutPlansTableHtml(
      [
        {
          id: 7,
          title: 'برنامه هفته ۱',
          body: 'اسکات ۳×۱۰ — پرس سینه ۳×۸ — پلانک ۳×۴۵ث',
          trainer_full_name: 'مربی یک',
          updated_at: '2026-10-22T20:26:00.000Z',
        },
      ],
      { canWrite: true },
    )
    expect(html).toContain('workout-plans-table')
    expect(html).toContain('responsive-table')
    expect(html).toContain('برنامه هفته ۱')
    expect(html).toContain('اسکات ۳×۱۰')
    expect(html).toContain('مربی یک')
    expect(html).toContain('data-edit-plan="7"')
    expect(html).toContain('ویرایش')
    expect(html).toContain('<th scope="col">عنوان</th>')
  })

  it('hides actions column for read-only roles', () => {
    const html = workoutPlansTableHtml(
      [{ id: 1, title: 'A', body: 'B', trainer_full_name: 'T' }],
      { canWrite: false },
    )
    expect(html).not.toContain('data-edit-plan')
    expect(html).not.toContain('عملیات')
  })

  it('escapes HTML in plan fields', () => {
    const html = workoutPlansTableHtml(
      [{ id: 2, title: '<script>x</script>', body: 'a <b>b</b>', trainer_full_name: 't&t' }],
      { canWrite: false },
    )
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('a &lt;b&gt;b&lt;/b&gt;')
    expect(html).toContain('t&amp;t')
  })
})
