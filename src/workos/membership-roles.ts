import { validationError } from '../core/index.js';
import type { WorkOSOrganizationMembership } from './entities.js';

/**
 * A membership's role slugs, primary first. Rows written before `roles` existed carry only
 * the singular `role`, which reads as a one-role list.
 */
export function membershipRoleSlugs(m: Pick<WorkOSOrganizationMembership, 'role' | 'roles'>): string[] {
  return (m.roles ?? [m.role]).map((r) => r.slug);
}

/**
 * The fields a role-set write stores. Production keeps the singular `role` as the first of
 * `roles`, so every writer goes through here and the two can never disagree.
 */
export function membershipRoleFields(slugs: readonly string[]): Pick<WorkOSOrganizationMembership, 'role' | 'roles'> {
  const unique = [...new Set(slugs)];
  return { role: { slug: unique[0] }, roles: unique.map((slug) => ({ slug })) };
}

/**
 * The role slugs a membership request body names: `role_slugs` for several roles (what
 * production accepts once multiple roles are enabled) or the singular `role_slug`. Undefined
 * when the body names neither, so an update can leave the roles alone.
 */
export function roleSlugsFromBody(body: Record<string, unknown>): string[] | undefined {
  if ('role_slugs' in body) {
    const slugs = body.role_slugs;
    if (!Array.isArray(slugs) || slugs.length === 0 || !slugs.every(isSlug)) {
      throw validationError('role_slugs must be a non-empty array of role slugs', [
        { field: 'role_slugs', code: 'invalid' },
      ]);
    }
    return slugs as string[];
  }
  if ('role_slug' in body) {
    if (!isSlug(body.role_slug)) {
      throw validationError('role_slug must be a role slug', [{ field: 'role_slug', code: 'invalid' }]);
    }
    return [body.role_slug];
  }
  return undefined;
}

const isSlug = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
