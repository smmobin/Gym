/**
 * Pure helpers for multi-step unified login (mobile → chooser → auth).
 * Kept free of DOM so vitest can cover logic without screenshots.
 */

/**
 * @typedef {{ kind: 'staff'|'athlete', role: string, label: string, auth_methods: string[], has_password: boolean }} LoginIdentity
 */

/**
 * @param {LoginIdentity[]} identities
 */
export function needsRoleChooser(identities) {
  return Array.isArray(identities) && identities.length > 1
}

/**
 * @param {LoginIdentity[]} identities
 * @returns {LoginIdentity | null}
 */
export function singleIdentity(identities) {
  if (!Array.isArray(identities) || identities.length !== 1) return null
  return identities[0]
}

/**
 * Manager/receptionist → password only; trainer/athlete → OTP primary.
 * @param {LoginIdentity} identity
 * @returns {'password' | 'otp'}
 */
export function defaultAuthMode(identity) {
  if (!identity?.auth_methods?.includes('otp')) return 'password'
  return 'otp'
}

/**
 * @param {LoginIdentity} identity
 */
export function canUsePassword(identity) {
  return Boolean(identity?.auth_methods?.includes('password'))
}

/**
 * @param {LoginIdentity} identity
 */
export function canUseOtp(identity) {
  return Boolean(identity?.auth_methods?.includes('otp'))
}

/**
 * @param {'otp'|'password'} mode
 * @param {LoginIdentity} identity
 * @returns {'otp'|'password'}
 */
export function toggleAuthMode(mode, identity) {
  if (mode === 'otp' && canUsePassword(identity)) return 'password'
  if (mode === 'password' && canUseOtp(identity)) return 'otp'
  return defaultAuthMode(identity)
}

/**
 * Steps for the login wizard.
 * @typedef {'mobile'|'chooser'|'auth'} LoginStep
 */

/**
 * @param {{ step: LoginStep, identities: LoginIdentity[], selected: LoginIdentity | null }} state
 * @param {{ type: string, identities?: LoginIdentity[], identity?: LoginIdentity }} action
 */
export function reduceLoginStep(state, action) {
  switch (action.type) {
    case 'reset':
      return { step: 'mobile', identities: [], selected: null }
    case 'lookup_ok': {
      const identities = action.identities || []
      if (needsRoleChooser(identities)) {
        return { step: 'chooser', identities, selected: null }
      }
      const only = singleIdentity(identities)
      return { step: 'auth', identities, selected: only }
    }
    case 'choose':
      return {
        ...state,
        step: 'auth',
        selected: action.identity || null,
      }
    case 'back_mobile':
      return { step: 'mobile', identities: [], selected: null }
    case 'back_chooser':
      if (needsRoleChooser(state.identities)) {
        return { ...state, step: 'chooser', selected: null }
      }
      return { step: 'mobile', identities: [], selected: null }
    default:
      return state
  }
}
