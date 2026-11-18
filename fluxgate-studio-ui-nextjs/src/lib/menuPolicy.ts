export const MENU_IDS = ['overview', 'rules', 'keys', 'events', 'audit', 'settings'] as const;
export type MenuId = (typeof MENU_IDS)[number];
export type MenuRole = 'admin' | 'user';

export const ROLE_MENUS: Record<MenuRole, readonly MenuId[]> = {
  admin: MENU_IDS,
  user: ['overview', 'rules', 'settings'],
};

export interface MenuPolicy {
  version: number;
  admin: MenuId[];
  user: MenuId[];
}

function readMenus(value: unknown, role: MenuRole): MenuId[] {
  if (!Array.isArray(value)) return [];
  return ROLE_MENUS[role].filter((menu) => value.includes(menu));
}

export function sessionMenus(session?: {
  roles: string[];
  canWrite: boolean;
  menus?: MenuId[];
  menuPolicyUnavailable?: boolean;
}): readonly MenuId[] {
  if (!session || !Array.isArray(session.roles)) return [];
  const role =
    session.roles.includes('ADMIN') && session.canWrite === true
      ? 'admin'
      : session.roles.includes('USER')
        ? 'user'
        : undefined;
  if (!role) return [];
  if (session.menuPolicyUnavailable === true) {
    return role === 'admin' && Array.isArray(session.menus) && session.menus.includes('settings')
      ? ['settings']
      : [];
  }
  // The old API omitted this field entirely and used the role defaults.
  if (!Object.hasOwn(session, 'menus')) return ROLE_MENUS[role];
  return readMenus(session.menus, role);
}

export function isPolicy(value: unknown): value is MenuPolicy {
  if (!value || typeof value !== 'object') return false;
  const { version, admin, user } = value as Record<string, unknown>;
  return (
    typeof version === 'number' &&
    Number.isSafeInteger(version) &&
    version >= 0 &&
    Array.isArray(admin) &&
    admin.includes('settings') &&
    readMenus(admin, 'admin').length === admin.length &&
    Array.isArray(user) &&
    user.length > 0 &&
    readMenus(user, 'user').length === user.length
  );
}

export function changedMenus(before: MenuPolicy, after: MenuPolicy, role: MenuRole): MenuId[] {
  return MENU_IDS.filter((menu) => before[role].includes(menu) !== after[role].includes(menu));
}

/** Apply only the switches the editor changed, leaving concurrent edits to other switches intact. */
export function applyMenuEdits(
  before: MenuPolicy,
  draft: MenuPolicy,
  saved: MenuPolicy
): MenuPolicy {
  const reapply = (role: MenuRole) => {
    const changed = changedMenus(before, draft, role);
    return ROLE_MENUS[role].filter((menu) =>
      (changed.includes(menu) ? draft[role] : saved[role]).includes(menu)
    );
  };
  return { version: saved.version, admin: reapply('admin'), user: reapply('user') };
}
