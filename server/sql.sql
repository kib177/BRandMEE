GRANT SELECT, INSERT, UPDATE, DELETE ON service_requests        TO warehouse_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON service_request_parts   TO warehouse_user;
GRANT USAGE, SELECT ON SEQUENCE service_requests_id_seq         TO warehouse_user;
GRANT USAGE, SELECT ON SEQUENCE service_request_parts_id_seq    TO warehouse_user;
