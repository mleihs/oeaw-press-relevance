/**
 * Shared constants for the password-gate auth lifecycle. Lives in lib/client
 * because both PasswordGate (the gate itself) and post-gate consumers
 * (e.g. DashboardClient one-shot animations) need them, and the values are
 * client-only (sessionStorage, custom DOM events).
 */

/** SessionStorage key flipped to '1' after a successful password entry. */
export const AUTH_STORAGE_KEY = 'storyscout-auth-marker';

/**
 * Custom window event dispatched right after the gate accepts a password.
 * Consumers listening for one-shot post-auth animations subscribe to this
 * event so they can fire only once the gate has actually been dismissed.
 */
export const AUTH_SUCCESS_EVENT = 'storyscout-auth-success';
