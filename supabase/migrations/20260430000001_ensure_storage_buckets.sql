-- Ensure required storage buckets exist
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('diagnostic-pdfs', 'diagnostic-pdfs', true, 10485760)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('vin-scan-failures', 'vin-scan-failures', false, 5242880)
ON CONFLICT (id) DO NOTHING;
