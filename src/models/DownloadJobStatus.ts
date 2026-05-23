enum DownloadJobStatus {
  created = 'created',
  downloading = 'downloading',
  uploading = 'uploading',
  finished = 'finished',
  failedDownload = 'failedDownload',
  failedUpload = 'failedUpload',
  unsupportedUrl = 'unsupportedUrl',
  noSuitableVideoSize = 'noSuitableVideoSize',
  failedYoutubeBot = 'failedYoutubeBot',
}

export default DownloadJobStatus
