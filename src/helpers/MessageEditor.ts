import { InlineKeyboard } from 'grammy'
import Context from '@/models/Context'
import bot from '@/helpers/bot'
import report from '@/helpers/report'

export default class MessageEditor {
  constructor(
    public messageId?: number,
    private ctx?: Context,
    public chatId?: number
  ) {}

  private get safeChatId() {
    return this.ctx?.dbchat.telegramId || this.chatId
  }

  async editMessage(message: string, keyboard?: InlineKeyboard) {
    try {
      if (!this.safeChatId) {
        return
      }
      const extra = keyboard ? { reply_markup: keyboard } : {}
      if (this.messageId) {
        await bot.api.editMessageText(
          this.safeChatId,
          this.messageId,
          message,
          extra
        )
      } else if (this.ctx) {
        await this.ctx.reply(message, extra)
      } else {
        throw new Error('No messageId or ctx found when editing')
      }
    } catch (error) {
      report(error, {
        ctx: this.ctx,
        location: 'MessageEditor.editMessage',
      })
    }
  }
}
