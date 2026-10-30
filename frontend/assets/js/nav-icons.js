/**
 * Shared outline sidebar icons for panel nav (manager / receptionist / trainer / athlete).
 * Stroke uses currentColor so active/hover match --accent.
 */

/** @type {Record<string, string>} path d fragments or full inner SVG content */
const PATHS = {
  gauge:
    '<path d="M4.5 14.5a7.5 7.5 0 1 1 15 0"/><path d="M12 14.5V9"/><circle cx="12" cy="14.5" r="1.1" fill="currentColor" stroke="none"/>',
  users:
    '<path d="M16.5 19v-1.2a3.3 3.3 0 0 0-3.3-3.3H8.8A3.3 3.3 0 0 0 5.5 17.8V19"/><circle cx="11" cy="8.2" r="2.6"/><path d="M18.5 19v-1a2.8 2.8 0 0 0-2-2.7"/><path d="M15.2 5.6a2.6 2.6 0 0 1 0 5"/>',
  clock:
    '<circle cx="12" cy="12" r="7.25"/><path d="M12 8.5V12l2.4 2.4"/>',
  wallet:
    '<rect x="3.5" y="6.5" width="17" height="12" rx="2.2"/><path d="M3.5 10h17"/><circle cx="16.2" cy="14.2" r="1.1"/>',
  layers:
    '<path d="M12 4.5 4.8 8.5 12 12.5l7.2-4L12 4.5z"/><path d="M4.8 12.2 12 16.2l7.2-4"/><path d="M4.8 15.5 12 19.5l7.2-4"/>',
  'user-star':
    '<path d="M15.5 19v-1.1A3.1 3.1 0 0 0 12.4 14.8H8.1A3.1 3.1 0 0 0 5 17.9V19"/><circle cx="10.2" cy="8.4" r="2.5"/><path d="M17.6 8.2l.55 1.15 1.25.18-.9.9.21 1.25-1.11-.58-1.11.58.21-1.25-.9-.9 1.25-.18.55-1.15z"/>',
  user: '<path d="M16.5 19v-1.2a3.3 3.3 0 0 0-3.3-3.3H9.3A3.3 3.3 0 0 0 6 17.8V19"/><circle cx="11.25" cy="8.2" r="2.6"/>',
  calendar:
    '<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M8 3.8v3.2M16 3.8v3.2M4 10h16"/>',
  lock:
    '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8.2a3.5 3.5 0 0 1 7 0v2.3"/>',
  shuffle:
    '<path d="M4.5 7h3.2l2.4 3.2"/><path d="M4.5 17h3.2l8.6-10.2H19"/><path d="M16.5 5.5 19 7l-2.5 1.5"/><path d="M14.2 13.2 19 17"/><path d="M16.5 15.5 19 17l-2.5 1.5"/>',
  dumbbell:
    '<path d="M6.2 9.2v5.6M17.8 9.2v5.6M8.4 10.2v3.6M15.6 10.2v3.6M8.4 12h7.2M4.5 10.5v3M19.5 10.5v3"/>',
  ticket:
    '<path d="M5 8.5a2 2 0 0 0 0 3.2V16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4.3a2 2 0 0 0 0-3.2V8a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v.5z"/><path d="M12 8.2v1.2M12 12v1.2M12 15.5v1"/>',
  hourglass:
    '<path d="M7.5 4.5h9"/><path d="M7.5 19.5h9"/><path d="M8.2 4.5c0 3.2 1.7 4.8 3.8 6.1 2.1-1.3 3.8-2.9 3.8-6.1"/><path d="M8.2 19.5c0-3.2 1.7-4.8 3.8-6.1 2.1 1.3 3.8 2.9 3.8 6.1"/>',
  chat:
    '<path d="M5.5 6.5h13a1.8 1.8 0 0 1 1.8 1.8v6.2a1.8 1.8 0 0 1-1.8 1.8H10l-3.8 3v-3H5.5A1.8 1.8 0 0 1 3.7 14.5V8.3A1.8 1.8 0 0 1 5.5 6.5z"/>',
  gear:
    '<circle cx="12" cy="12" r="2.6"/><path d="M12 4.2v2.1M12 17.7v2.1M4.2 12h2.1M17.7 12h2.1M6.4 6.4l1.5 1.5M16.1 16.1l1.5 1.5M17.6 6.4l-1.5 1.5M7.9 16.1l-1.5 1.5"/>',
  bell:
    '<path d="M6.5 16.5h11"/><path d="M8 16.5V11a4 4 0 1 1 8 0v5.5"/><path d="M10.2 16.5a1.8 1.8 0 0 0 3.6 0"/>',
}

/** Hash (without #) → icon key */
export const NAV_ICON_BY_HASH = {
  dash: 'gauge',
  members: 'users',
  checkin: 'clock',
  billing: 'wallet',
  finance: 'wallet',
  pay: 'wallet',
  plans: 'layers',
  sub: 'layers',
  staff: 'user-star',
  trainers: 'shuffle',
  trainees: 'user',
  classes: 'calendar',
  lockers: 'lock',
  workouts: 'dumbbell',
  plan: 'dumbbell',
  guests: 'ticket',
  trial: 'hourglass',
  sms: 'chat',
  settings: 'gear',
  notif: 'bell',
}

/**
 * @param {string} name
 * @returns {string}
 */
export function navIconSvg(name) {
  const inner = PATHS[name] || PATHS.gauge
  return `<svg class="nav-item-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
}

/**
 * Ensure each sidebar .nav-item has an outline icon + label span.
 * @param {ParentNode} [root=document]
 */
export function applyNavIcons(root = document) {
  root.querySelectorAll('.sidebar .nav-item[href^="#"]').forEach((node) => {
    const a = /** @type {HTMLAnchorElement} */ (node)
    if (a.querySelector('.nav-item-icon')) return
    const hash = (a.getAttribute('href') || '').replace(/^#/, '')
    const iconKey = NAV_ICON_BY_HASH[hash] || 'gauge'
    let label = a.querySelector('.nav-item-label')
    if (!label) {
      label = document.createElement('span')
      label.className = 'nav-item-label'
      while (a.firstChild) label.appendChild(a.firstChild)
      a.appendChild(label)
    }
    a.insertAdjacentHTML('afterbegin', navIconSvg(iconKey))
  })
}
