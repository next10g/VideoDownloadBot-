import { getModelForClass, index, modelOptions, prop } from '@typegoose/typegoose'
import { DownloadMode } from '@/models/DownloadMode'

@modelOptions({ schemaOptions: { timestamps: true } })
@index({ telegramId: 1, createdAt: -1 })
export class UserSavedLink {
  @prop({ required: true, index: true })
  telegramId!: number

  @prop({ required: true })
  url!: string

  @prop({ default: '' })
  title!: string

  @prop({ default: 'unknown' })
  platform!: string

  @prop({ enum: DownloadMode, default: DownloadMode.video })
  downloadMode!: DownloadMode

  @prop({ default: 0 })
  bytes!: number

  @prop({ default: '' })
  fileType!: string
}

export const UserSavedLinkModel = getModelForClass(UserSavedLink)
