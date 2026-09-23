import type { GameEvent } from '@/lib/gameNotifications';

const TITLES: Record<GameEvent, string> = {
  started: '🏸 Game has started',
  completed: '🏆 Game has been completed',
  cancelled: '❌ Game cancelled',
};

class NotificationService {
  // The server (pages/api/squads/[squadId]/notify.ts) builds the message and its links and sends
  // it to this squad's own main Telegram group - the client only names the event.
  private async sendNotification(squadId: number, event: GameEvent, gameId: string) {
    try {
      const response = await fetch(`/api/squads/${squadId}/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ event, gameId }),
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

  private async sendNotificationWithConfirm(squadId: number, event: GameEvent, gameId: string): Promise<boolean> {
    const title = `${TITLES[event]} (#${gameId.slice(-4)})`;
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.innerHTML = `
        <dialog class="modal modal-open">
          <div class="modal-box">
            <h3 class="font-bold text-lg mb-4">Send Notification</h3>
            <div class="space-y-4">
              <div class="p-4 bg-base-200 rounded-lg">
                <p class="font-semibold">${title}</p>
                <p class="text-sm mt-2 text-base-content/70">Post this to the squad's Telegram group?</p>
              </div>
              <p class="text-sm text-base-content/70">
                It goes to the main group set in this squad's game-day settings.
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
          await this.sendNotification(squadId, event, gameId);
          resolve(true);
        } catch (error) {
          console.error('Notification Error:', error);
          resolve(false);
        }
      });
    });
  }

  async notifyGameStarted(squadId: number, gameId: string) {
    return this.sendNotificationWithConfirm(squadId, 'started', gameId);
  }

  async notifyGameCompleted(squadId: number, gameId: string) {
    return this.sendNotificationWithConfirm(squadId, 'completed', gameId);
  }

  async notifyGameCancelled(squadId: number, gameId: string) {
    return this.sendNotificationWithConfirm(squadId, 'cancelled', gameId);
  }
}

export const notificationService = new NotificationService();
