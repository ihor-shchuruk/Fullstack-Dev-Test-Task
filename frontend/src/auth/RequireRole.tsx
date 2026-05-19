import type { ReactNode } from "react"

import { type Action } from "@/auth/permissions"
import { useCan } from "@/auth/useCan"
import AccessDenied from "@/components/Common/AccessDenied"

interface RequireRoleProps {
  action: Action
  children: ReactNode
}

const RequireRole = ({ action, children }: RequireRoleProps) => {
  const allowed = useCan(action)
  if (!allowed) {
    return <AccessDenied />
  }
  return <>{children}</>
}

export default RequireRole
