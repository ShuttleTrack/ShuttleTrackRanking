import { publicUrl } from "@/utils/constants";

interface TelegramInlineKeyboard {
  inline_keyboard: Array<Array<{
    text: string;
    url?: string;
    callback_data?: string;
  }>>;
}

interface NotificationOptions {
  title: string;
  message: string;
  buttons?: TelegramInlineKeyboard;
}

class NotificationService {
  private async sendNotification(options: NotificationOptions) {
    try {
      const response = await fetch('/api/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        throw new Error('Failed to send notification');
      }

      return await response.json();
    } catch (error) {
      console.error('Notification Error:', error);
      throw error;
    }
  }

  private async sendNotificationWithConfirm(options: NotificationOptions): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.innerHTML = `
        <dialog class="modal modal-open">
          <div class="modal-box">
            <h3 class="font-bold text-lg mb-4">Send Notification</h3>
            <div class="space-y-4">
              <div class="p-4 bg-base-200 rounded-lg">
                <p class="font-semibold">${options.title}</p>
                <p class="text-sm mt-2 text-base-content/70">Send this notification to all subscribed users?</p>
              </div>
              <p class="text-sm text-base-content/70">
                This notification will be sent to all subscribed users.
              </p>
            </div>
            <div class="modal-action">
              <button class="btn btn-outline" id="cancel-notify">Cancel</button>
              <button class="btn btn-primary" id="confirm-notify">Send Notification</button>
            </div>
          </div>
          <form method="dialog" class="modal-backdrop">
            <button id="close-notify">close</button>
          </form>
        </dialog>
      `;
      document.body.appendChild(modal);

      const cleanup = () => {
        document.body.removeChild(modal);
      };

      modal.querySelector('#cancel-notify')?.addEventListener('click', () => {
        cleanup();
        resolve(false);
      });

      modal.querySelector('#close-notify')?.addEventListener('click', () => {
        cleanup();
        resolve(false);
      });

      modal.querySelector('#confirm-notify')?.addEventListener('click', async () => {
        cleanup();
        try {
          await this.sendNotification(options);
          resolve(true);
        } catch (error) {
          console.error('Notification Error:', error);
          resolve(false);
        }
      });
    });
  }

  // squadSlug identifies which squad's public board to link to. Making the underlying Telegram
  // scheduler itself per-squad-configurable is out of scope for this pass (SQUAD_TENANCY_PLAN.md)
  // - this only keeps the linked URLs pointing at a real, valid squad-scoped page.
  async notifyGameStarted(squadSlug: string, gameId: string) {
    const gameViewerUrl = encodeURI(`${publicUrl}/s/${squadSlug}/game-viewer?gameId=${gameId}`);

    return this.sendNotificationWithConfirm({
      title: `🏸 Game #${gameId.slice(-4)} has started!`,
      message: `Track live scores, groups and game combinations by clicking the button below.`,
      buttons: {
        inline_keyboard: [[
          {
            text: '📊 Track Scores',
            url: gameViewerUrl
          }
        ]]
      }
    });
  }

  async notifyGameCompleted(squadSlug: string, gameId: string) {
    return this.sendNotificationWithConfirm({
      title: `🏆 Game #${gameId.slice(-4)} has been completed!`,
      message: `Game #${gameId.slice(-4)} has been completed and scores have been processed. Check the updated rankings by clicking the button below.`,
      buttons: {
        inline_keyboard: [[
          {
            text: '🏆 Check Rankings',
            url: encodeURI(`${publicUrl}/s/${squadSlug}`)
          }
        ]]
      }
    });
  }

  async notifyGameCancelled(gameId: string) {
    return this.sendNotificationWithConfirm({
      title: '❌ Game Cancelled',
      message: `Game #${gameId.slice(-4)} has been cancelled.`
    });
  }
}

export const notificationService = new NotificationService(); 