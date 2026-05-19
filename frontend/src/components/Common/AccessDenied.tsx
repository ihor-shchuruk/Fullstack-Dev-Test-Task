import { Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"

const AccessDenied = () => {
  return (
    <div
      className="flex min-h-screen items-center justify-center flex-col p-4"
      data-testid="access-denied"
    >
      <div className="flex items-center z-10">
        <div className="flex flex-col ml-4 items-center justify-center p-4">
          <span className="text-6xl md:text-8xl font-bold leading-none mb-4">
            403
          </span>
          <span className="text-2xl font-bold mb-2">Access Denied</span>
        </div>
      </div>

      <p className="text-lg text-muted-foreground mb-4 text-center z-10">
        You don&apos;t have access to this page. Contact an admin if you think
        this is a mistake.
      </p>
      <div className="z-10">
        <Link to="/">
          <Button className="mt-4">Back to dashboard</Button>
        </Link>
      </div>
    </div>
  )
}

export default AccessDenied
