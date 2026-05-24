import { getModelForClass, index, modelOptions, prop } from '@typegoose/typegoose'
import { DownloadMode } from '@/models/DownloadMode'

@modelOptions({ schemaOptions: { timestamps: true } })
@index({ telegramId: 1, createdAt: -1 })
@index({ platform: 1, createdAt: -1 })
@index({ success: 1 })
export class LinkLog {
  @prop({ required: true, index: true })
  telegramId!: number

  @prop({ index: true })
  username?: string

  @prop()
  firstName?: string

  @prop({ required: true, index: true })
  url!: string

  @prop({ required: true, index: true, default: 'unknown' })
  platform!: string

  @prop({ enum: DownloadMode, default: DownloadMode.video })
  downloadMode!: DownloadMode

  @prop({ default: 0 })
  maxHeight!: number

  @prop()
  title?: string

  @prop({ index: true })
  success?: boolean

  @prop()
  errorCode?: string
}

export const LinkLogModel = getModelForClass(LinkLog)
