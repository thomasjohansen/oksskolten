ALTER TABLE labels ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'promoted' CHECK (lifecycle_status IN ('candidate', 'promoted'));

UPDATE labels SET lifecycle_status = 'candidate' WHERE origin = 'ai';
UPDATE labels
SET lifecycle_status = 'promoted'
WHERE origin = 'ai'
  AND id IN (
    SELECT label_id
    FROM article_ai_labels
    GROUP BY label_id
    HAVING COUNT(DISTINCT article_id) >= 3
       AND COUNT(DISTINCT CASE WHEN confidence >= 0.8 THEN article_id END) >= 2
  );

DROP VIEW IF EXISTS effective_article_labels;
CREATE VIEW effective_article_labels AS
  SELECT article_id, label_id FROM article_labels
  UNION
  SELECT article_id, label_id FROM article_ai_labels;
