import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

// Login endpoint for the middleware gate. The browser POSTs the password
// here; we compare against GATE_PASSWORD server-side and, on match, set
// an HttpOnly cookie containing the SHA-256 of the password (which the
// middleware then matches against GATE_TOKEN — pre-computed in env).
//
// Why the indirection (password → token):
// - Storing the raw password in the cookie would expose it to anyone who
//   reads the browser jar, including via XSS. SHA-256 hides it.
// - Pre-computing the token in env (`GATE_TOKEN=sha256(GATE_PASSWORD)`)
//   means the middleware never needs to hash on every request.

function tokenize(password: string): string {
  return createHash('sha256').update(password, 'utf8').digest('hex');
}

export async function POST(req: NextRequest) {
  let body: { password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const password = typeof body.password === 'string' ? body.password : '';
  const expectedPassword = process.env.GATE_PASSWORD;

  if (!expectedPassword) {
    // Dev mode without GATE_PASSWORD configured — accept anything but warn.
    return NextResponse.json({ ok: true, mode: 'dev-passthrough' });
  }

  if (password !== expectedPassword) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const token = tokenize(password);
  const res = NextResponse.json({ ok: true });
  res.cookies.set('gate', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}

// DELETE for explicit logout (clears the cookie).
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete('gate');
  return res;
}
