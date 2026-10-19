import { requireStaff } from '../auth-staff.js'
import { mountAttendance } from '../attendance.js'
import { mountBilling } from '../billing.js'
import { mountClasses } from '../classes.js'
import { mountGuests } from '../guests.js'
import { mountLockers } from '../lockers.js'
import { mountMembers } from '../members.js'
import { mountSettings } from '../settings.js'
import { mountSmsTemplates } from '../sms-templates.js'
import { mountTrainers } from '../trainers.js'
import { mountTrialLeads } from '../trial.js'
import { mountWorkouts } from '../workouts.js'
import { initStaffShell } from './shell.js'

async function main() {
  const user = await requireStaff()
  if (!user) return

  // Trainers land on workouts; managers can also use this panel
  if (user.role === 'manager' && !location.hash) {
    // stay — manager may prefer /manager/
  }

  await initStaffShell({ user, defaultHash: user.role === 'trainer' ? 'workouts' : 'dash' })

  const mounts = {
    members: () => mountMembers(el('mount-members'), user),
    checkin: () => mountAttendance(el('mount-attendance'), user),
    billing: () => mountBilling(el('mount-billing'), user),
    classes: () => mountClasses(el('mount-classes'), user),
    lockers: () => mountLockers(el('mount-lockers'), user),
    trainers: () => mountTrainers(el('mount-trainers'), user),
    workouts: () => mountWorkouts(el('mount-workouts'), user),
    guests: () => mountGuests(el('mount-guests'), user),
    trial: () => mountTrialLeads(el('mount-trial'), user),
    sms: () => mountSmsTemplates(el('mount-sms')),
    settings: () => mountSettings(el('mount-settings'), user),
  }

  /** @type {Set<string>} */
  const loaded = new Set()
  function ensure(hash) {
    const key = hash || 'dash'
    if (loaded.has(key)) return
    const fn = mounts[key]
    if (fn) {
      fn()
      loaded.add(key)
    }
  }

  ensure((location.hash || '#dash').slice(1))
  window.addEventListener('hashchange', () => ensure(location.hash.slice(1)))

  // dash stats from today attendance count (light)
  try {
    const { apiGet } = await import('../api.js')
    const today = await apiGet('/api/v1/attendances/today')
    const items = today.items || today.attendances || []
    const elStat = document.querySelector('[data-stat-today]')
    if (elStat) elStat.textContent = String(items.length).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
  } catch {
    // ignore
  }
}

/** @param {string} id */
function el(id) {
  const node = document.getElementById(id)
  if (!node) throw new Error(`missing #${id}`)
  return node
}

void main()
