ALTER TABLE "charge_items" ADD COLUMN "vat_pct" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "period_items" ADD COLUMN "vat_pct" double precision DEFAULT 0 NOT NULL;