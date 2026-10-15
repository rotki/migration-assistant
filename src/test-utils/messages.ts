import type { RejectedFileTexts } from '@/modules/convert/messages';
import { createAppI18n } from '@/i18n';
import { createMessages, type Messages } from '@/modules/convert/use-messages';

/** The page's message translations in English, outside a component. */
export function englishMessages(): Messages {
  return createMessages(createAppI18n().global.t);
}

/** The English rejected-file texts as the page sends them for a run with this date format. */
export function englishTexts(dateFormat = 'iso'): RejectedFileTexts {
  return englishMessages().rejectedFileTexts(dateFormat);
}
