import { describe, expect, it } from "vitest";
import { hasAdminRoleMappings, resolveAdminRole } from "@/lib/admin-role-mapping";
import type { AdminRole } from "@/lib/admin-auth-shared";

const emptyRoles: Record<AdminRole, { users: string[]; groups: string[] }> = {
  viewer: { users: [], groups: [] },
  editor: { users: [], groups: [] },
  admin: { users: [], groups: [] },
};

describe("admin SSO role mapping", () => {
  it("denies admin SSO when no explicit role mappings exist", () => {
    expect(hasAdminRoleMappings({ roles: emptyRoles })).toBe(false);
    expect(resolveAdminRole({ roles: emptyRoles }, {
      sub: "example-subject",
      name: "Example User",
      email: "user@example.com",
      groups: [],
    })).toBeNull();
  });

  it("maps explicit users to the highest matching role", () => {
    expect(resolveAdminRole({
      roles: {
        ...emptyRoles,
        viewer: { users: ["operator@example.com"], groups: [] },
        admin: { users: ["admin@example.com"], groups: [] },
      },
    }, {
      sub: "subject",
      email: "admin@example.com",
    })).toBe("admin");
  });

  it("maps groups to roles", () => {
    expect(resolveAdminRole({
      roles: {
        ...emptyRoles,
        editor: { users: [], groups: ["tpa-editors"] },
      },
    }, {
      sub: "subject",
      email: "operator@example.com",
      groups: ["tpa-editors"],
    })).toBe("editor");
  });
});
