-- CreateIndex
-- GET /files authorizes message attachments by looking up
-- Message("attachmentId"); the column is a bare String? (validated in app
-- code against Document), so no foreign key is added here.
CREATE INDEX "Message_attachmentId_idx" ON "Message"("attachmentId");
