"use client"

import { useState } from "react"
import { UserRole } from "@prisma/client"

interface User {
  id: string
  name: string | null
  email: string | null
  role: UserRole
  teamId: string | null
}

interface Team {
  id: string
  name: string
}

interface EditUserButtonProps {
  user: User
  teams: Team[]
  updateUser: (formData: FormData) => Promise<void>
}

export default function EditUserButton({
  user,
  teams,
  updateUser,
}: EditUserButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [role, setRole] = useState(user.role)
  const [teamId, setTeamId] = useState(user.teamId || "")

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    await updateUser(formData)
    setIsOpen(false)
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-primary hover:text-primary/80 font-semibold transition-colors"
      >
        Edit
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-6 border-2 border-border w-96 shadow-lg rounded-xl bg-card">
            <div className="mt-3">
              <h3 className="text-lg leading-6 font-bold text-foreground mb-4">
                Edit User: {user.name || user.email}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input type="hidden" name="id" value={user.id} />

                {/* Role Selection */}
                <div>
                  <label
                    htmlFor="role"
                    className="block text-sm font-semibold text-foreground mb-2"
                  >
                    Role
                  </label>
                  <select
                    id="role"
                    name="role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    required
                    className="w-full rounded-lg border-2 border-input-border bg-input text-foreground shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 px-3 py-2 transition-colors"
                  >
                    <option value={UserRole.ADMIN}>Admin</option>
                    <option value={UserRole.MANAGER}>Manager</option>
                    <option value={UserRole.SUPERVISOR}>Supervisor</option>
                    <option value={UserRole.MEMBER}>Member</option>
                    <option value={UserRole.CLIENT}>Client</option>
                  </select>
                </div>

                {/* Team Selection */}
                <div>
                  <label
                    htmlFor="teamId"
                    className="block text-sm font-semibold text-foreground mb-2"
                  >
                    Team
                  </label>
                  <select
                    id="teamId"
                    name="teamId"
                    value={teamId}
                    onChange={(e) => setTeamId(e.target.value)}
                    className="w-full rounded-lg border-2 border-input-border bg-input text-foreground shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 px-3 py-2 transition-colors"
                  >
                    <option value="">No Team</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Buttons */}
                <div className="flex gap-3 justify-end pt-4">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2 bg-muted text-muted-foreground font-semibold rounded-lg hover:bg-muted/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors shadow-md"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
