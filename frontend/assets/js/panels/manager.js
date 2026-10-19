import { requireStaff } from '../auth-staff.js'
import { mountAttendance } from '../attendance.js'
import { mountBilling } from '../billing.js'
import { mountClasses } from '../classes.js'
import { mountGuests } from '../guests.js'
import { mountLockers } from '../lockers.js'
import { mountMembers } from '../members.js'
import { mountReports } from '../reports.js'
import { mountSettings } from '../settings.js'
import { mountSmsTemplates } from '../sms-templates.js'
import { mountTrainers } from '../trainers.js'
import { mountTrialLeads } from '../trial.js'
import { mountWorkouts } from '../workouts.js'
import { initStaffShell } from './shell.js'

async function main() {
  const user = await requireStaff(['manager'])
  if (!user) return

  await initStaffShell({ user, defaultHash: 'dash', allowReports: true })

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
    finance: () => mountReports(el('mount-reports'), user),
    settings: () => mountSettings(el('mount-settings'), user),
    sms: () => mountSmsTemplates(el('mount-sms')),
  }

  const loaded = new Set()
  function ensure(hash) {
    if (loaded.has(hash)) return
    const fn = mounts[hash]
    if (fn) {
      fn()
      loaded.add(hash)
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
