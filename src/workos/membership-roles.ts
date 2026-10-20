import { validationError } from '../core/index.js';
import type { WorkOSOrganizationMembership } from './entities.js';
import type { WorkOSStore } from './store.js';

/**
 * A membership's role slugs the way production lists them: the priority role first, then the
 * rest in the organization's role priority order. A slug resolves the way the authorization
 * endpoints resolve it — an organization role shadows an environment role — and the priority is
 * read at call time, so a change to it shows on the next read without rewriting memberships.
 * Slugs that name no defined role keep the order they were written in, after the defined ones.
 * Rows written before `roles` existed carry only the singular `role`, which reads as a one-role
 * list.
 */
export function membershipRoleSlugs(
  ws: WorkOSStore,
  m: Pick<WorkOSOrganizationMembership, 'organization_id' | 'role' | 'roles'>,
): string[] {
  return orderRoleSlugs(
    ws,
    m.organization_id,
    (m.roles ?? [m.role]).map((r) => r.slug),
  );
}

/** `slugs` deduplicated and in role priority order; see membershipRoleSlugs. */
export function orderRoleSlugs(ws: WorkOSStore, organizationId: string, slugs: readonly string[]): string[] {
  const unique = [...new Set(slugs)];
  if (unique.length < 2) return unique;
  const rank = new Map(unique.map((slug) => [slug, rolePriority(ws, organizationId, slug)]));
  // Array.prototype.sort is stable, so equal priorities keep their written order.
  return unique.sort((a, b) => rank.get(a)! - rank.get(b)!);
}

function rolePriority(ws: WorkOSStore, organizationId: string, slug: string): number {
  const candidates = ws.roles.findBy('slug', slug);
  const role =
    candidates.find((r) => r.organization_id === organizationId) ??
    candidates.find((r) => r.type === 'EnvironmentRole' && r.organization_id === null);
  return role ? role.priority : Number.MAX_SAFE_INTEGER;
}

/**
 * The fields a role-set write stores: `role` is the priority role and `roles` the whole set in
 * priority order, so every writer goes through here and the two never disagree.
 */
export function membershipRoleFields(
  ws: WorkOSStore,
  organizationId: string,
  slugs: readonly string[],
): Pick<WorkOSOrganizationMembership, 'role' | 'roles'> {
  const ordered = orderRoleSlugs(ws, organizationId, slugs);
  return { role: { slug: ordered[0] }, roles: ordered.map((slug) => ({ slug })) };
}

/**
 * The role slugs a membership request body names: `role_slugs` for several roles (what
 * production accepts once multiple roles are enabled) or the singular `role_slug`, never both.
 * Undefined when the body names neither, so an update can leave the roles alone.
 */
export function roleSlugsFromBody(body: Record<string, unknown>): string[] | undefined {
  if ('role_slug' in body && 'role_slugs' in body) {
    throw validationError('The role_slug parameter cannot be used when role_slugs is provided.', [
      { field: 'role_slug', code: 'invalid' },
    ]);
  }
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
