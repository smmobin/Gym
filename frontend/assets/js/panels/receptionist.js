import { requireStaff } from '../auth-staff.js'
import { mountAttendance } from '../attendance.js'
import { mountBilling } from '../billing.js'
import { mountClasses } from '../classes.js'
import { mountDeskDashboard } from '../desk-dashboard.js'
import { mountGuests } from '../guests.js'
import { mountLockers } from '../lockers.js'
import { mountMembers } from '../members.js'
import { mountPlans } from '../plans.js'
import { mountSettings } from '../settings.js'
import { mountSmsTemplates } from '../sms-templates.js'
import { mountStaff } from '../staff.js'
import { mountTrainers } from '../trainers.js'
import { mountTrialLeads } from '../trial.js'
import { mountWorkouts } from '../workouts.js'
import { initStaffShell } from './shell.js'

async function main() {
  // Receptionist panel only — managers use /manager/; trainers use /trainer/
  const user = await requireStaff(['receptionist'])
  if (!user) return

  await initStaffShell({ user, defaultHash: 'dash' })

  const mounts = {
    dash: () => mountDeskDashboard(el('mount-desk-dashboard'), user),
    members: () => mountMembers(el('mount-members'), user),
    checkin: () => mountAttendance(el('mount-attendance'), user),
    billing: () => mountBilling(el('mount-billing'), user),
    plans: () => mountPlans(el('mount-plans'), user),
    staff: () => mountStaff(el('mount-staff'), user),
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
    // Always refresh desk summary when returning to dashboard.
    if (key === 'dash') {
      mounts.dash()
      loaded.add('dash')
      return
    }
    if (loaded.has(key)) return
    const fn = mounts[key]
    if (fn) {
      fn()
      loaded.add(key)
    }
  }

  ensure((location.hash || '#dash').slice(1))
  window.addEventListener('hashchange', () => ensure(location.hash.slice(1)))
}

/** @param {string} id */
function el(id) {
  const node = document.getElementById(id)
  if (!node) throw new Error(`missing #${id}`)
  return node
}

void main()
