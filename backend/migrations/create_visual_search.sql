ALTER TABLE ai_embeddings
  MODIFY COLUMN document_id INT NULL,
  MODIFY COLUMN chunk_text TEXT NULL,
  MODIFY COLUMN embedding JSON NULL,
  MODIFY COLUMN embedding_model VARCHAR(255) NULL,
  ADD COLUMN source_title VARCHAR(255) NULL AFTER source_id,
  ADD COLUMN image_embedding JSON NULL AFTER embedding,
  ADD COLUMN embedding_type VARCHAR(20) NOT NULL DEFAULT 'text' AFTER embedding_model,
  ADD COLUMN image_url VARCHAR(500) NULL AFTER source_title;

CREATE INDEX idx_ai_embeddings_type
  ON ai_embeddings(embedding_type);

CREATE INDEX idx_ai_embeddings_source
  ON ai_embeddings(source_type, source_id);
