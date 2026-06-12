/** Table leads — realPipelineService / RealLead */
export const PIPELINE_LEADS_COLUMNS = [
  'id',
  'seller_id',
  'title',
  'stage',
  'priority',
  'value',
  'probability',
  'next_action',
  'assigned_to',
  'last_contact',
  'notes',
  'contact_name',
  'contact_company',
  'contact_phone',
  'contact_email',
  'source',
  'source_id',
  'machine_id',
  'quote_request_id',
  'buyer_user_id',
  'transaction_case_id',
  'created_at',
  'updated_at',
].join(',');

/** Messages pour génération de leads */
export const MESSAGE_LEAD_SEED_COLUMNS = [
  'id',
  'sender_id',
  'receiver_id',
  'created_at',
  'content',
  'sender_email',
  'processed_for_lead',
].join(',');

/** Offres pour génération de leads */
export const OFFER_LEAD_SEED_COLUMNS = [
  'id',
  'buyer_id',
  'seller_id',
  'amount',
  'created_at',
  'processed_for_lead',
].join(',');

/** pipeline_actions — RealPipelineAction */
export const PIPELINE_ACTIONS_COLUMNS = [
  'id',
  'lead_id',
  'seller_id',
  'title',
  'description',
  'action_type',
  'status',
  'priority',
  'due_date',
  'completed_date',
  'estimated_duration',
  'actual_duration',
  'contact_name',
  'contact_phone',
  'contact_email',
  'notes',
  'ai_recommendation',
  'created_at',
  'updated_at',
].join(',');

/** pipeline_insights — RealPipelineInsight */
export const PIPELINE_INSIGHTS_COLUMNS = [
  'id',
  'seller_id',
  'insight_type',
  'title',
  'description',
  'data',
  'priority',
  'action_required',
  'action_description',
  'is_read',
  'created_at',
].join(',');

/** pipeline_reports — RealPipelineReport */
export const PIPELINE_REPORTS_COLUMNS = [
  'id',
  'seller_id',
  'report_type',
  'title',
  'data',
  'filters',
  'generated_at',
  'created_at',
].join(',');

/** promotions — RealPromotion */
export const PROMOTIONS_COLUMNS = [
  'id',
  'title',
  'description',
  'discount_percentage',
  'start_date',
  'end_date',
  'equipment_ids',
  'status',
  'seller_id',
  'created_at',
].join(',');

/** stock_insights — StockInsight + filtre seller */
export const STOCK_INSIGHTS_COLUMNS = [
  'id',
  'seller_id',
  'equipment_id',
  'insight_type',
  'title',
  'description',
  'priority',
  'action_required',
  'action_description',
  'data',
  'created_at',
].join(',');
