import { describe, it, expect } from 'vitest';
import { userInitials, userLabel } from './user-display';

describe('userInitials', () => {
  it('uses first + last name part', () => {
    expect(userInitials({ displayName: 'Christine Brand', email: 'cb@x.at' })).toBe('CB');
    expect(userInitials({ displayName: 'Anna Maria Muster', email: 'x@x.at' })).toBe('AM');
  });
  it('falls back to two name chars for single names', () => {
    expect(userInitials({ displayName: 'Julia', email: 'x@x.at' })).toBe('JU');
  });
  it('falls back to the email when displayName is missing/blank', () => {
    expect(userInitials({ displayName: null, email: 'sara.k@oeaw.ac.at' })).toBe('SA');
    expect(userInitials({ displayName: '  ', email: 'sara.k@oeaw.ac.at' })).toBe('SA');
  });
});

describe('userLabel', () => {
  it('prefers the display name, falls back to email', () => {
    expect(userLabel({ displayName: 'Christine Brand', email: 'cb@x.at' })).toBe('Christine Brand');
    expect(userLabel({ displayName: '  ', email: 'cb@x.at' })).toBe('cb@x.at');
    expect(userLabel({ displayName: null, email: 'cb@x.at' })).toBe('cb@x.at');
  });
});
