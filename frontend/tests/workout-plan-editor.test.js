import { describe, expect, it, vi } from 'vitest'

import {
  formatWorkoutItemLine,
  mountWorkoutPlanEditor,
  workoutPlanItemsTableHtml,
  workoutUnitLabel,
} from '../assets/js/workout-plan-editor.js'

describe('workout plan structured table', () => {
  it('labels units in Persian', () => {
    expect(workoutUnitLabel('reps')).toBe('تکرار')
    expect(workoutUnitLabel('seconds')).toBe('ثانیه')
  })

  it('formats a clear athlete-facing line', () => {
    expect(
      formatWorkoutItemLine(
        { exercise_name: 'پلانک', sets: 3, amount: 45, unit: 'seconds' },
        0,
      ),
    ).toBe('1. پلانک · 3 ست · 45 ثانیه')
    expect(
      formatWorkoutItemLine(
        { exercise_name: 'اسکات', sets: 3, amount: 10, unit: 'reps', note: 'استراحت ۶۰ث' },
        0,
      ),
    ).toBe('1. اسکات · 3 ست · 10 تکرار · استراحت ۶۰ث')
  })

  it('renders read-only item rows for athlete', () => {
    const html = workoutPlanItemsTableHtml(
      [
        {
          exercise_name: 'اسکات',
          sets: 3,
          amount: 10,
          unit: 'reps',
          note: null,
        },
      ],
      { title: 'برنامه هفته ۱', meta: 'مربی یک · امروز' },
    )
    expect(html).toContain('workout-items-list')
    expect(html).toContain('workout-item-row')
    expect(html).toContain('اسکات')
    expect(html).toContain('تکرار')
    expect(html).toContain('برنامه هفته ۱')
  })

  it('falls back to legacy body when items empty', () => {
    const html = workoutPlanItemsTableHtml([], { legacyBody: 'متن قدیمی' })
    expect(html).toContain('workout-items-legacy')
    expect(html).toContain('متن قدیمی')
  })

  it('collects editor rows and creates missing exercises on demand', async () => {
    const createExercise = vi.fn(async (name) => ({ id: 9, name }))
    const loadExercises = vi.fn(async () => [])
    document.body.innerHTML = '<div id="host"></div>'
    const host = /** @type {HTMLElement} */ (document.getElementById('host'))
    const editor = mountWorkoutPlanEditor(host, { loadExercises, createExercise })
    await vi.waitFor(() => {
      expect(host.querySelector('.custom-combobox-input')).toBeTruthy()
    })

    const input = /** @type {HTMLInputElement} */ (host.querySelector('.custom-combobox-input'))
    input.value = 'اسکوات'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.waitFor(() => expect(createExercise).toHaveBeenCalledWith('اسکوات'))

    expect(host.querySelector('.workout-editor-row')).toBeTruthy()
    expect(host.querySelector('.workout-editor-metrics')).toBeTruthy()
    const unitSelect = host.querySelector('select.workout-editor-unit')
    expect(unitSelect).toBeTruthy()
    expect(unitSelect?.classList.contains('custom-select-skip')).toBe(false)

    const items = editor.getItems()
    expect(items).toHaveLength(1)
    expect(items[0].exercise_name).toBe('اسکوات')
    expect(items[0].sets).toBe(3)
  })
})
