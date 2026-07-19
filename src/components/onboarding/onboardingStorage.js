const ONBOARDING_VERSION = '2026-07-v1'
const AGREEMENT_KEY = 'snowlet-onboarding-agreement-version'
const PERMISSION_KEY = 'snowlet-onboarding-permission-version'
const DEVICE_USAGE_PROMPT_KEY = 'snowball-device-usage-prompt-v1'

function readStorage(key) {
  try {
    return window.localStorage.getItem(key) || ''
  } catch (_) {
    return ''
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch (_) {
    return false
  }
}

export function hasAcceptedAgreement() {
  return readStorage(AGREEMENT_KEY) === ONBOARDING_VERSION
}

export function markAgreementAccepted() {
  return writeStorage(AGREEMENT_KEY, ONBOARDING_VERSION)
}

export function hasCompletedPermissionIntro() {
  return readStorage(PERMISSION_KEY) === ONBOARDING_VERSION
}

export function markPermissionIntroCompleted() {
  return writeStorage(PERMISSION_KEY, ONBOARDING_VERSION)
}

export function markLegacyUsagePromptHandled() {
  return writeStorage(DEVICE_USAGE_PROMPT_KEY, '1')
}

export function resetOnboardingForTesting() {
  try {
    window.localStorage.removeItem(AGREEMENT_KEY)
    window.localStorage.removeItem(PERMISSION_KEY)
    return true
  } catch (_) {
    return false
  }
}

export { ONBOARDING_VERSION }
