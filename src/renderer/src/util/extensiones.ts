/** Extensiones de TipTap comunes al editor de entradas y al de plantillas (mismos formatos). */
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import Placeholder from '@tiptap/extension-placeholder'
import type { Extensions } from '@tiptap/react'

export function extensionesEditor(placeholder: string): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        protocols: ['http', 'https'],
        defaultProtocol: 'https'
      }
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder })
  ]
}
