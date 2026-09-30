-- Keep the starting point with a saved trip plan so directions can be reopened.
ALTER TABLE trip_plans ADD COLUMN origin TEXT;
