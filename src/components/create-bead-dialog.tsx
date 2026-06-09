import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createBeadFn } from '@/lib/server'

import type { Bead } from '@/lib/types'

interface CreateBeadDialogProps {
  project: string
  epics: Bead[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

const TYPES = [
  { value: 'task', label: 'Task' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'epic', label: 'Épico' },
]

const NO_PARENT = '__none__'

export function CreateBeadDialog({
  project,
  epics,
  open,
  onOpenChange,
}: CreateBeadDialogProps) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState('task')
  const [parent, setParent] = useState(NO_PARENT)

  function reset() {
    setTitle('')
    setDescription('')
    setType('task')
    setParent(NO_PARENT)
  }

  const mutation = useMutation({
    mutationFn: () =>
      createBeadFn({
        data: {
          project,
          title: title.trim(),
          description: description.trim() || undefined,
          type,
          parent: type !== 'epic' && parent !== NO_PARENT ? parent : undefined,
        },
      }),
    onSuccess: (res) => {
      toast.success(`Bead ${res.id} criada`)
      queryClient.invalidateQueries({ queryKey: ['beads', project] })
      reset()
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Falha ao criar bead')
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova bead</DialogTitle>
          <DialogDescription>
            Cria uma issue no projeto{' '}
            <span className="font-mono text-foreground">{project}</span>.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (title.trim() && !mutation.isPending) mutation.mutate()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bead-title">Título</Label>
            <Input
              id="bead-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Resumo da tarefa"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bead-desc">Descrição</Label>
            <Textarea
              id="bead-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes (markdown)…"
              className="min-h-24 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Épico pai</Label>
              <Select
                value={parent}
                onValueChange={setParent}
                disabled={type === 'epic'}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent className="max-w-72">
                  <SelectItem value={NO_PARENT}>Nenhum</SelectItem>
                  {epics.map((epic) => (
                    <SelectItem key={epic.id} value={epic.id}>
                      <span className="font-mono text-xs text-muted-foreground">
                        {epic.id}
                      </span>
                      <span className="ml-1.5 truncate">{epic.title}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!title.trim() || mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : null}
              Criar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
