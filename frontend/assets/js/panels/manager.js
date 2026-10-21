import { requireStaff } from '../auth-staff.js'
import { mountAttendance } from '../attendance.js'
import { mountBilling } from '../billing.js'
import { mountClasses } from '../classes.js'
import { mountDashboard } from '../dashboard.js'
import { mountGuests } from '../guests.js'
import { mountLockers } from '../lockers.js'
import { mountMembers } from '../members.js'
import { mountPlans } from '../plans.js'
import { mountReports } from '../reports.js'
import { mountSettings } from '../settings.js'
import { mountSmsTemplates } from '../sms-templates.js'
import { mountStaff } from '../staff.js'
import { mountTrainers } from '../trainers.js'
import { mountTrialLeads } from '../trial.js'
import { mountWorkouts } from '../workouts.js'
import { initStaffShell } from './shell.js'

async function main() {
  const user = await requireStaff(['manager'])
  if (!user) return

  await initStaffShell({ user, defaultHash: 'dash', allowReports: true })

  const mounts = {
    dash: () => mountDashboard(el('mount-dashboard'), user),
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
    finance: () => mountReports(el('mount-reports'), user),
    settings: () => mountSettings(el('mount-settings'), user),
    sms: () => mountSmsTemplates(el('mount-sms')),
  }

  const loaded = new Set()
  function ensure(hash) {
    const key = hash || 'dash'
    // Dashboard always refreshes so summary stays current after finance edits.
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

function el(id) {
  const node = document.getElementById(id)
  if (!node) throw new Error(`missing #${id}`)
  return node
}

void main()
