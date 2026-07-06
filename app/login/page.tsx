'use client';

import { AuthScreen } from '@/components/auth/auth-screen';

/**
 * Anmelde-Screen (Design: docs/design/claude-design/Login.dc.html). Liegt
 * HINTER dem Passwort-Gate (Gate = äußere Hülle, Auth = Identität;
 * BOARD_PLAN.md §3.1) und legt sich als Vollbild-Overlay über das
 * App-Layout (fixed inset-0 über der Nav). Der Übergangszugang wird hier
 * nicht angeboten — wer auf /login landet, hat das Gate bereits passiert
 * und braucht eine Identität (z. B. fürs Redaktionsboard).
 */
export default function LoginPage() {
  return <AuthScreen variant="login" />;
}
