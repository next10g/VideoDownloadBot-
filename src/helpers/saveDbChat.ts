import type { DocumentType } from '@typegoose/typegoose'
import type { Chat } from '@/models/Chat'

/** One save at a time per user — avoids Mongoose ParallelSaveError. */
const chains = new Map<number, Promise<void>>()

export function saveDbChat(chat: DocumentType<Chat>): Promise<void> {
  const id = chat.telegramId
  const prev = chains.get(id) ?? Promise.resolve()
  const next = prev
    .then(() => chat.save())
    .then(() => undefined)
  chains.set(id, next.catch(() => undefined))
  return next
}
