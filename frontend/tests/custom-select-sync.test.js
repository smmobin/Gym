import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const customSelectSrc = readFileSync(path.join(here, '../public/js/custom-select.js'), 'utf8')

describe('GymCustomSelect dynamic sync', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    // @ts-expect-error test cleanup
    delete globalThis.GymCustomSelect
  })

  it('enhances empty select and syncs when options are filled', () => {
    // eslint-disable-next-line no-new-func
    Function(customSelectSrc)()

    document.body.innerHTML = '<label>طرح<select data-plans required></select></label>'
    const select = /** @type {HTMLSelectElement} */ (document.querySelector('[data-plans]'))
    globalThis.GymCustomSelect.refresh(document)

    expect(select.dataset.enhanced).toBe('1')
    expect(document.querySelector('[data-custom-select]')).toBeTruthy()

    select.innerHTML = [
      '<option value="1">ماهانه سالن</option>',
      '<option value="2">۸ جلسه کلاس</option>',
    ].join('')
    globalThis.GymCustomSelect.sync(select)

    const options = document.querySelectorAll('.custom-select-menu [role="option"]')
    expect(options.length).toBe(2)
    expect(options[0].textContent).toContain('ماهانه سالن')
    expect(document.querySelector('.custom-select-value')?.textContent).toContain('ماهانه سالن')
  })
})
