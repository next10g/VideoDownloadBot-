import { getModelForClass, modelOptions, prop } from '@typegoose/typegoose'
import { DownloadMode } from '@/models/DownloadMode'

@modelOptions({ schemaOptions: { timestamps: true } })
export class Url {
  @prop({ required: true, index: true })
  url!: string
  @prop({ required: true, index: true })
  fileId!: string
  @prop({ required: true, index: true, default: false })
  audio!: boolean
  @prop({ enum: DownloadMode, default: DownloadMode.video, index: true })
  downloadMode!: DownloadMode
  @prop({ default: 0, index: true })
  maxHeight!: number
  @prop({ default: '' })
  preferredExt!: string
  @prop({ required: true })
  title!: string
}

const UrlModel = getModelForClass(Url)

export interface UrlCacheKey {
  url: string
  audio: boolean
  downloadMode?: DownloadMode
  maxHeight?: number
  preferredExt?: string
}

export function findUrl(key: UrlCacheKey) {
  return UrlModel.findOne({
    url: key.url,
    audio: key.audio,
    downloadMode: key.downloadMode ?? DownloadMode.video,
    maxHeight: key.maxHeight ?? 0,
    preferredExt: key.preferredExt ?? '',
  })
}

export async function findOrCreateUrl(
  key: UrlCacheKey,
  fileId: string,
  title: string
) {
  const downloadMode = key.downloadMode ?? DownloadMode.video
  const maxHeight = key.maxHeight ?? 0
  const preferredExt = key.preferredExt ?? ''
  const dburl = await UrlModel.findOne({
    url: key.url,
    audio: key.audio,
    downloadMode,
    maxHeight,
    preferredExt,
  })
  if (dburl) {
    return dburl
  }
  return UrlModel.create({
    url: key.url,
    fileId,
    audio: key.audio,
    downloadMode,
    maxHeight,
    preferredExt,
    title,
  })
}
