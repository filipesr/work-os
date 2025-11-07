"use client"

import { useTransition } from "react"
import { useTranslations } from "next-intl"

interface DeleteClientButtonProps {
  clientId: string
  deleteAction: (formData: FormData) => Promise<void>
}

export function DeleteClientButton({ clientId, deleteAction }: DeleteClientButtonProps) {
  const t = useTranslations("delete.client")
  const [isPending, startTransition] = useTransition()

  const handleDelete = (e: React.FormEvent) => {
    e.preventDefault()
    if (!confirm(t("confirm"))) {
      return
    }

    startTransition(async () => {
      const formData = new FormData()
      formData.append("id", clientId)
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
        {isPending ? t("deleting") : t("button")}
      </button>
    </form>
  )
}