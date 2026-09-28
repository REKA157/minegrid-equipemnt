/** Widget score perf. — ventes du mois en cours */
export const SALES_MONTH_SCORE_COLUMNS = ['amount', 'created_at', 'seller_id'].join(',');

/** Prospects actifs (comptage) */
export const PROSPECTS_ACTIVE_SCORE_COLUMNS = ['id', 'seller_id', 'status', 'created_at'].join(',');

/** Objectifs mensuels (ligne unique) */
export const USER_TARGETS_MONTHLY_COLUMNS = [
  'user_id',
  'period',
  'sales_target',
  'prospects_target',
  'response_time_target',
  'growth_target',
].join(',');
