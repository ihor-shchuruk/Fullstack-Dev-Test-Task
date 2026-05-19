import { type Action, can } from "@/auth/permissions"
import useAuth from "@/hooks/useAuth"

export const useCan = (action: Action): boolean => {
  const { user } = useAuth()
  return can(action, user?.role)
}
