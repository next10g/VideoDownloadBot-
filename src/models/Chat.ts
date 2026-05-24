import * as findorcreate from 'mongoose-findorcreate'
import { FindOrCreate } from '@typegoose/typegoose/lib/defaultClasses'
import {
  getModelForClass,
  modelOptions,
  plugin,
  prop,
  Severity,
} from '@typegoose/typegoose'
import { randomBytes } from 'crypto'
import type { DownloadPreference } from '@/models/DownloadPreference'

@plugin(findorcreate)
@modelOptions({
  schemaOptions: { timestamps: true },
  options: { allowMixed: Severity.ALLOW },
})
export class Chat extends FindOrCreate {
  @prop({ required: true, index: true, unique: true })
  telegramId!: number

  @prop({ required: true, default: 'ar' })
  language!: string

  @prop({ required: true, default: false })
  audio!: boolean

  /** When true, next links download as image (toggle via /image). */
  @prop({ required: true, default: false })
  imagePreferred!: boolean

  /** auto = smart probe + menu; video | audio | image = fixed type. */
  @prop({ required: true, default: 'auto' })
  downloadPreference!: DownloadPreference

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

  @prop()
  phoneNumber?: string

  @prop({ default: 0 })
  totalBytesDownloaded!: number

  @prop({ default: 0 })
  successDownloadCount!: number

  /** e.g. video: 5, image: 2, file: 1 */
  @prop({ type: () => Object, default: {} })
  fileTypeCounts!: Record<string, number>

  @prop()
  profilePhotoFileId?: string

  /** URL awaiting format selection (callback_data is too short for full URLs). */
  @prop()
  pendingUrl?: string

  @prop()
  pendingTitle?: string

  /** JSON from probeMediaOffer (heights, facebook embed, etc.). */
  @prop()
  pendingMediaProbe?: string
}

const ChatModel = getModelForClass(Chat)

export function generateReferralCode(): string {
  return randomBytes(4).toString('hex')
}

export function findOrCreateChat(telegramId: number) {
  return ChatModel.findOrCreate({ telegramId })
}

export { ChatModel }
