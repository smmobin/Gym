import { apiGet } from '../api.js'
import { mountPublicPlans } from '../public-plans.js'
import { initThemeToggle } from '../theme.js'
import { mountTrialPublicForm } from '../trial.js'
import { showApiDown } from '../ui.js'

function bindNav() {
  const toggle = document.getElementById('nav-toggle')
  const nav = document.querySelector('.site-links')
  if (!toggle || !nav) return
  function isMobileNav() {
    return window.matchMedia('(max-width: 1100px)').matches
  }
  document.querySelectorAll('.site-links a').forEach((link) => {
    link.addEventListener('click', () => {
      if (isMobileNav()) toggle.checked = false
    })
  })
  document.addEventListener('click', (event) => {
    if (!toggle.checked || !isMobileNav()) return
    if (
      event.target.closest(
        '.site-links, .nav-burger, .nav-toggle, label[for="nav-toggle"]',
      )
    ) {
      return
    }
    toggle.checked = false
  })
}

async function main() {
  initThemeToggle(document)
  bindNav()
  const banner = document.querySelector('[data-api-banner]')
  try {
    await apiGet('/api/v1/health')
    showApiDown(/** @type {HTMLElement} */ (banner), false)
  } catch {
    showApiDown(/** @type {HTMLElement} */ (banner), true)
  }

  const plansGrid = document.querySelector('[data-plans-grid]')
  const plansStatus = document.querySelector('[data-plans-status]')
  if (plansGrid) {
    await mountPublicPlans(
      /** @type {HTMLElement} */ (plansGrid),
      /** @type {HTMLElement | null} */ (plansStatus),
    )
  }

  const form = document.querySelector('.trial-form')
  const status = document.querySelector('[data-trial-status]')
  if (form) {
    // Ensure named fields for API
    const nameInput = form.querySelector('input[type="text"]')
    if (nameInput && !nameInput.getAttribute('name')) nameInput.setAttribute('name', 'full_name')
    const mobile = form.querySelector('input[type="tel"]')
    if (mobile && !mobile.getAttribute('name')) mobile.setAttribute('name', 'mobile')
    const select = form.querySelector('select')
    if (select && !select.getAttribute('name')) select.setAttribute('name', 'preferred_time_note')
    const btn = form.querySelector('button')
    if (btn) btn.type = 'submit'
    mountTrialPublicForm(/** @type {HTMLFormElement} */ (form), /** @type {HTMLElement} */ (status))
  }
}

void main()
