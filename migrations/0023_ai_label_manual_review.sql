-- AI labels are now manual-review only. Existing data cannot distinguish prior
-- manual promotions from automatic promotions, so all existing promoted AI
-- labels are conservatively returned to the candidate queue. User labels,
-- candidates, and dismissed tombstones are unchanged.
UPDATE labels
SET lifecycle_status = 'candidate'
WHERE origin = 'ai' AND lifecycle_status = 'promoted';
