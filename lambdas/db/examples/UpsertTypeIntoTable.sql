create or replace function upsert_type_into_table(type_name text,
                                                  pk_field text,
                                                  table_name text,
                                                  input_values anyarray) returns void
    strict
    language plpgsql
as
$$
DECLARE
    column_list TEXT;
    update_section  TEXT;
    updated_values int[];
BEGIN
    RAISE NOTICE '%s', input_values;

    IF cardinality(input_values) = 0 THEN
        RETURN;
    END IF;

    RAISE NOTICE 'Get attributes for type %s', type_name;
    select string_agg(format('"%s"', attname), ', ')
    INTO column_list
    FROM get_columns_for_type(type_name);

    RAISE NOTICE 'Get values for %s', type_name;
    select string_agg(format('"%s"=EXCLUDED."%s"', attname, attname), ', ')
    INTO update_section
    FROM get_columns_for_type(type_name)
    WHERE attname != pk_field;

    EXECUTE format(
            'INSERT INTO %s (%s) SELECT %s from UNNEST(Array[%L::%s[]]) ON CONFLICT (player_id) DO UPDATE SET %s',
            table_name,
            column_list,
            column_list,
            input_values,
            type_name,
            update_section);
END
$$;

alter function upsert_type_into_table(text, text, text, anyarray) owner to postgres;

