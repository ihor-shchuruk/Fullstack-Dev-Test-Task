import type { Role } from "@/client"

export type Action =
  | "users.list"
  | "users.create"
  | "users.update_any"
  | "metrics.view"
  | "profile.update_own"

const MATRIX: Record<Action, Role[]> = {
  "users.list": ["admin", "manager"],
  "users.create": ["admin"],
  "users.update_any": ["admin"],
  "metrics.view": ["admin", "manager"],
  "profile.update_own": ["admin", "manager", "member"],
}

export const can = (action: Action, role: Role | undefined): boolean =>
  !!role && MATRIX[action].includes(role)
