import { ApiError } from '../api.js'
import { athleteLogin, fetchAthleteMe } from '../auth-athlete.js'
import { setStatus } from '../ui.js'

async function main() {
  const form = /** @type {HTMLFormElement} */ (document.querySelector('[data-login-form]'))
  const status = document.querySelector('[data-status]')

  const me = await fetchAthleteMe()
  if (me) {
    location.href = '/athlete/'
    return
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(form)
    setStatus(/** @type {HTMLElement} */ (status), 'در حال ورود…', 'loading')
    try {
      await athleteLogin(String(fd.get('mobile')), String(fd.get('password')))
      location.href = '/athlete/'
    } catch (err) {
      setStatus(
        /** @type {HTMLElement} */ (status),
        err instanceof ApiError ? err.message : 'ورود ناموفق بود.',
        'error',
      )
    }
  })
}

void main()
