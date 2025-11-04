"use client"

import { useTransition } from "react"

interface DeleteTeamButtonProps {
  teamId: string
  deleteAction: (formData: FormData) => Promise<void>
}

export function DeleteTeamButton({ teamId, deleteAction }: DeleteTeamButtonProps) {
  const [isPending, startTransition] = useTransition()

  const handleDelete = (e: React.FormEvent) => {
    e.preventDefault()
    if (!confirm("Tem certeza que deseja deletar este time?")) {
      return
    }

    startTransition(async () => {
      const formData = new FormData()
      formData.append("id", teamId)
      await deleteAction(formData)
    })
  }

  return (
    <form onSubmit={handleDelete} className="inline">
      <button
        type="submit"
        disabled={isPending}
        className="text-red-600 hover:text-red-900 disabled:opacity-50"
      >
        {isPending ? "Deletando..." : "Deletar"}
      </button>
    </form>
  )
}