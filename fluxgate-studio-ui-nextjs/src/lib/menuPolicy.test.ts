import { describe, expect, it } from 'vitest';

import { applyMenuEdits, isPolicy, MENU_IDS, type MenuPolicy, sessionMenus } from './menuPolicy';

const admin = { roles: ['ADMIN', 'USER'], canWrite: true };
const user = { roles: ['USER'], canWrite: false };

describe('effective menu policy', () => {
  it('retains existing defaults only for role-only responses', () => {
    expect(sessionMenus(admin)).toEqual(MENU_IDS);
    expect(sessionMenus(user)).toEqual(['overview', 'rules', 'settings']);
    expect(sessionMenus({ ...user, menus: [] })).toEqual([]);
    expect(sessionMenus({ ...user, menus: undefined })).toEqual([]);
  });

  it('intersects explicit menus with the role ceiling and denies unknown roles', () => {
    expect(sessionMenus({ ...user, menus: ['rules', 'events', 'keys'] })).toEqual(['rules']);
    expect(sessionMenus({ ...admin, menus: ['overview', 'settings'] })).toEqual([
      'overview',
      'settings',
    ]);
    expect(sessionMenus({ roles: ['OTHER'], canWrite: true, menus: ['settings'] })).toEqual([]);
  });

  it('allows only the explicit admin recovery menu during an outage', () => {
    expect(
      sessionMenus({ ...admin, menus: ['overview', 'settings'], menuPolicyUnavailable: true })
    ).toEqual(['settings']);
    expect(sessionMenus({ ...admin, menuPolicyUnavailable: true })).toEqual([]);
    expect(sessionMenus({ ...user, menus: ['settings'], menuPolicyUnavailable: true })).toEqual([]);
  });
});

describe('policy editing', () => {
  const base: MenuPolicy = {
    version: 1,
    admin: ['overview', 'rules', 'settings'],
    user: ['overview', 'rules'],
  };

  it('reapplies only the draft changes to the latest policy version', () => {
    const draft: MenuPolicy = { ...base, user: ['overview'] };
    const latest: MenuPolicy = {
      ...base,
      version: 2,
      admin: ['settings'],
      user: ['overview', 'rules', 'settings'],
    };
    expect(applyMenuEdits(base, draft, latest)).toEqual({
      version: 2,
      admin: ['settings'],
      user: ['overview', 'settings'],
    });
  });

  it('validates the version and role restrictions before trusting saved responses', () => {
    expect(isPolicy(base)).toBe(true);
    expect(isPolicy({ ...base, version: -1 })).toBe(false);
    expect(isPolicy({ ...base, admin: ['overview'] })).toBe(false);
    expect(isPolicy({ ...base, user: [] })).toBe(false);
    expect(isPolicy({ ...base, user: ['overview', 'overview'] })).toBe(false);
    expect(isPolicy({ ...base, user: ['rules', 'audit'] })).toBe(false);
  });
});
