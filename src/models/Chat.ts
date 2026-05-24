import * as findorcreate from 'mongoose-findorcreate'
import { FindOrCreate } from '@typegoose/typegoose/lib/defaultClasses'
import {
  getModelForClass,
  modelOptions,
  plugin,
  prop,
} from '@typegoose/typegoose'
import { randomBytes } from 'crypto'

@plugin(findorcreate)
@modelOptions({ schemaOptions: { timestamps: true } })
export class Chat extends FindOrCreate {
  @prop({ required: true, index: true, unique: true })
  telegramId!: number

  @prop({ required: true, default: 'ar' })
  language!: string

  @prop({ required: true, default: false })
  audio!: boolean

  @prop()
  lastUrl?: string

  @prop({ index: true })
  username?: string

  @prop()
  firstName?: string

  @prop()
  lastName?: string

  @prop({ index: true, unique: true, sparse: true })
  referralCode?: string

  @prop({ index: true })
  referredBy?: number

  @prop({ default: 0 })
  linkCount!: number

  @prop({ default: 0 })
  referralCount!: number

  /** URL awaiting format selection (callback_data is too short for full URLs). */
  @prop()
  pendingUrl?: string

  @prop()
  pendingTitle?: string
}

const ChatModel = getModelForClass(Chat)

export function generateReferralCode(): string {
  return randomBytes(4).toString('hex')
}

export function findOrCreateChat(telegramId: number) {
  return ChatModel.findOrCreate({ telegramId })
}

export { ChatModel }
