import { getAutoSubmit } from './ui.js';
import { logger } from './logger.js';

let submitting = false;

function findButton(root, text) {
  return Array.from(root.querySelectorAll('button')).find(button =>
    button.textContent.trim() === text && button.getClientRects().length > 0);
}

export async function submitHomework() {
  if (!getAutoSubmit() || submitting) return;
  submitting = true;
  let clicked = false;
  const start = Date.now();
  try {
    while (Date.now() - start < 15000) {
      if (!getAutoSubmit()) return;
      if (!clicked) {
        const button = findButton(document, '提交作业');
        if (!button) throw new Error('未找到提交作业按钮，未自动提交');
        if (!button.disabled && !button.classList.contains('is-loading')) {
          button.click();
          clicked = true;
          logger.log('已点击提交作业，等待平台保存答案并确认');
        }
      } else {
        const box = Array.from(document.querySelectorAll('.el-message-box')).find(el => el.getClientRects().length > 0);
        const message = box?.querySelector('.el-message-box__message')?.textContent.trim();
        if (message && /^还有\d+题未做，是否提交[！!？?]$/.test(message)) {
          findButton(box, '取消')?.click();
          logger.warn('平台提示仍有未做题目，已取消自动提交');
          return;
        }
        if (message && /^作业已经全部做完，是否提交[？?]$/.test(message)) {
          const confirm = findButton(box, '确定');
          if (confirm && !confirm.disabled && !confirm.classList.contains('is-loading')) {
            confirm.click();
            logger.log('已确认提交作业，请查看平台提交结果');
            return;
          }
        }
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('等待作业提交按钮或确认弹窗超时，未确认提交');
  } catch (error) {
    logger.error(error.message);
  } finally {
    submitting = false;
  }
}
