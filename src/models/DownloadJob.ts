import * as findorcreate from 'mongoose-findorcreate'
import { FindOrCreate } from '@typegoose/typegoose/lib/defaultClasses'
import {
  isDocument,
  modelOptions,
  plugin,
  post,
  prop,
} from '@typegoose/typegoose'
import { DownloadMode } from '@/models/DownloadMode'
import DownloadJobStatus from '@/models/DownloadJobStatus'
import downloadQueue from '@/helpers/downloadQueue'
import report from '@/helpers/report'
import updateDownloadRequests from '@/helpers/updateDownloadRequests'

@plugin(findorcreate)
@modelOptions({ schemaOptions: { timestamps: true } })
@post<DownloadJob>('save', async function (downloadJob) {
  if (!isDocument(downloadJob)) {
    return
  }
  try {
    if (downloadJob.status === DownloadJobStatus.downloading) {
      downloadQueue.enqueue(String(downloadJob._id))
      return
    }
    await updateDownloadRequests(downloadJob)
  } catch (error) {
    report(error, { location: 'DownloadJob.save hook' })
  }
})
export default class DownloadJob extends FindOrCreate {
  @prop({ required: true, index: true })
  url!: string
  @prop({ required: true, index: true, default: false })
  audio!: boolean

  @prop({ enum: DownloadMode, default: DownloadMode.video, index: true })
  downloadMode!: DownloadMode

  /** Video max height (360/480/720/1080). 0 = server default. */
  @prop({ default: 0, index: true })
  maxHeight!: number
  @prop({
    required: true,
    index: true,
    enum: DownloadJobStatus,
    default: DownloadJobStatus.created,
  })
  status!: DownloadJobStatus
  @prop({ required: true, index: true })
  originalChatId!: number
  @prop({ required: true, index: true })
  originalMessageId!: number
}
