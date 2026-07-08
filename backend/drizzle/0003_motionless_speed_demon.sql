CREATE INDEX "requests_requested_by_idx" ON "approval_requests" USING btree ("org_id","requested_by");--> statement-breakpoint
CREATE INDEX "expenses_entered_by_idx" ON "expenses" USING btree ("org_id","entered_by","business_date");--> statement-breakpoint
CREATE INDEX "progress_entered_by_idx" ON "progress_notes" USING btree ("org_id","entered_by");