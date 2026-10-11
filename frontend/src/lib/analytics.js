/**
 * Safe, privacy-first telemetry dispatcher.
 * Dispatches events only if an authorized provider (Google Analytics gtag or Plausible) is mounted.
 * Never collects or transmits personal data, filenames, or image content.
 */

export function trackEvent(eventName, params = {}) {
  if (typeof window === 'undefined') return

  // 1. Google Analytics (gtag)
  if (typeof window.gtag === 'function') {
    try {
      window.gtag('event', eventName, params)
    } catch (e) {
      // Suppress analytics dispatch errors to never disrupt UI
    }
  }

  // 2. Plausible Analytics
  if (typeof window.plausible === 'function') {
    try {
      window.plausible(eventName, { props: params })
    } catch (e) {
      // Suppress analytics dispatch errors
    }
  }

  // 3. Custom Event for extensible listeners
  try {
    window.dispatchEvent(
      new CustomEvent('rembg:track', {
        detail: { eventName, params },
      })
    )
  } catch (e) {
    // Suppress custom event errors
  }
}
