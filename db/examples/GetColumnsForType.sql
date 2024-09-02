create function get_columns_for_type(type_name text) returns SETOF pg_attribute
    stable
    strict
    language sql
as
$$
SELECT *
FROM pg_attribute
WHERE attrelid = (SELECT typrelid
                  FROM pg_type
                  WHERE typname = type_name)
  AND attnum > 0
  AND NOT attisdropped
    ;

$$;

alter function get_columns_for_type(text) owner to postgres;

