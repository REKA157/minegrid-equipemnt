import { getDailyActionsData } from './getDailyActionsData';
import { listDataFixtures } from './listDataFixtures';

export const getListData = (widgetId: string): any[] => {
  if (widgetId === 'daily-actions') return getDailyActionsData(widgetId);
  return listDataFixtures[widgetId] || [];
};
